import { getClient } from "../client.js";
import { z } from "zod";
import { ToolResult, successResult, errorResult, ErrorCode, mapErrorCode } from "../types.js";
import {
  createSession,
  getSession,
  appendMessage,
  deleteSession,
  ToolSchema,
} from "../sessions.js";

// Tool schema definition (matches MCP tool format)
const toolSchemaZ = z.object({
  name: z.string(),
  description: z.string().optional(),
  parameters: z.record(z.string(), z.any()).optional(),
});

// Tool result from parent execution
const toolResultZ = z.object({
  name: z.string(),
  result: z.string(),
});

// Input schema for the act tool
export const inputSchema = z.object({
  // Session management
  sessionId: z.string().optional().describe("Resume existing session (omit to start new)"),

  // Required for new sessions (when no sessionId)
  identifier: z.string().min(1).optional().describe("The loaded model identifier to use"),
  task: z.string().min(1).optional().describe("The task or prompt for the model"),
  tools: z.array(toolSchemaZ).optional().describe("Tool schemas available for the model to call"),

  // For continuing sessions
  toolResults: z.array(toolResultZ).optional().describe("Results from previously requested tool calls"),

  // Optional configuration
  maxTokens: z.number().int().min(1).optional().describe("Maximum tokens to generate"),
});

export type ActInput = z.infer<typeof inputSchema>;

// Tool call request output
export interface ToolCallRequest {
  name: string;
  arguments?: Record<string, unknown>;
}

// Response stats for tracking without full content
export interface ResponseStats {
  messageCount: number;
  responseLength: number;
}

// Output data
export interface ActData {
  sessionId: string;
  done: boolean;
  response?: string;
  toolCalls?: ToolCallRequest[];
  stats?: ResponseStats;
}

/**
 * Build system prompt with tool definitions
 */
function buildToolSystemPrompt(tools: ToolSchema[]): string {
  const toolDescriptions = tools
    .map((t) => {
      let desc = `- ${t.name}`;
      if (t.description) desc += `: ${t.description}`;
      if (t.parameters) {
        desc += `\n  Parameters: ${JSON.stringify(t.parameters)}`;
      }
      return desc;
    })
    .join("\n");

  return `You have access to the following tools:

${toolDescriptions}

When you need to use a tool, respond ONLY with a JSON object in this exact format (no other text):
{"tool_calls": [{"name": "tool_name", "arguments": {"arg1": "value1"}}]}

When you have completed the task or don't need tools, respond with your normal answer.
Do not explain that you're going to use a tool - just output the JSON or your final answer.`;
}

/**
 * Format tool results as a compact message
 */
function formatToolResults(toolResults: Array<{ name: string; result: string }>): string {
  return toolResults.map((r) => `[${r.name}]: ${r.result}`).join("\n");
}

/**
 * Try to parse tool calls from response text
 */
function parseToolCalls(text: string): ToolCallRequest[] | null {
  const trimmed = text.trim();

  // Try direct JSON parse
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed.tool_calls && Array.isArray(parsed.tool_calls)) {
      return parsed.tool_calls.map((tc: { name: string; arguments?: Record<string, unknown> }) => ({
        name: tc.name,
        arguments: tc.arguments,
      }));
    }
  } catch {
    // Not valid JSON
  }

  // Try to extract JSON from markdown code block
  const jsonMatch = trimmed.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      if (parsed.tool_calls && Array.isArray(parsed.tool_calls)) {
        return parsed.tool_calls.map((tc: { name: string; arguments?: Record<string, unknown> }) => ({
          name: tc.name,
          arguments: tc.arguments,
        }));
      }
    } catch {
      // Not valid JSON in code block
    }
  }

  return null;
}

/**
 * Run an agentic task with a local LM Studio model.
 * Supports tool use via a request/response pattern with the parent model.
 *
 * Uses server-side session management to store conversation history,
 * reducing token usage for the parent model by ~80-90% on multi-turn tasks.
 */
export async function act(input: ActInput): Promise<ToolResult<ActData>> {
  let session;
  let isNewSession = false;

  if (input.sessionId) {
    // Resume existing session
    session = getSession(input.sessionId);
    if (!session) {
      return errorResult(
        "Session not found or expired",
        ErrorCode.INVALID_INPUT,
        `Session '${input.sessionId}' does not exist or has expired`
      );
    }

    // Add tool results to conversation
    if (input.toolResults && input.toolResults.length > 0) {
      appendMessage(session.id, {
        role: "user",
        content: formatToolResults(input.toolResults),
      });
    }
  } else {
    // Create new session
    if (!input.identifier) {
      return errorResult(
        "Model identifier required for new session",
        ErrorCode.INVALID_INPUT,
        "Provide 'identifier' when starting a new session"
      );
    }
    if (!input.task) {
      return errorResult(
        "Task required for new session",
        ErrorCode.INVALID_INPUT,
        "Provide 'task' when starting a new session"
      );
    }

    const tools: ToolSchema[] = input.tools || [];
    const systemPrompt = tools.length > 0 ? buildToolSystemPrompt(tools) : undefined;

    session = createSession(input.identifier, tools, systemPrompt);
    isNewSession = true;

    // Add the task as the first user message
    appendMessage(session.id, { role: "user", content: input.task });
  }

  try {
    const client = getClient();

    // Get the model handle
    const handle = client.llm.createDynamicHandle({ identifier: session.modelId });
    const modelInfo = await handle.getModelInfo();

    if (!modelInfo) {
      // Clean up session if model not found on new session
      if (isNewSession) {
        deleteSession(session.id);
      }
      return errorResult(
        `Model '${session.modelId}' not found or not loaded`,
        ErrorCode.MODEL_NOT_LOADED,
        "Model not loaded"
      );
    }

    // Get response from model using session messages
    const result = await handle.respond(session.messages, {
      maxTokens: input.maxTokens || 2048,
    });

    const responseText = result.content.trim();

    // Append assistant response to session
    appendMessage(session.id, { role: "assistant", content: responseText });

    // Check if response contains tool calls
    const toolCalls = parseToolCalls(responseText);

    if (toolCalls && toolCalls.length > 0) {
      return successResult("Model requested tool calls", {
        sessionId: session.id,
        done: false,
        toolCalls,
        stats: {
          messageCount: session.messages.length,
          responseLength: responseText.length,
        },
      });
    }

    // No tool calls - task complete (session kept for parent to read if needed)
    return successResult("Task completed", {
      sessionId: session.id,
      done: true,
      stats: {
        messageCount: session.messages.length,
        responseLength: responseText.length,
      },
    });
  } catch (error) {
    // Clean up session on error if it was newly created
    if (isNewSession) {
      deleteSession(session.id);
    }

    const code = mapErrorCode(error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return errorResult("Failed to run task", code, errorMessage);
  }
}
