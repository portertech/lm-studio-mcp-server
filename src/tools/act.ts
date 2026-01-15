import { getClient } from "../client.js";
import { z } from "zod";
import { ToolResult, successResult, errorResult, ErrorCode, mapErrorCode } from "../types.js";

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

// Message in conversation history
const messageZ = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string(),
});

// Input schema for the act tool
export const inputSchema = z.object({
  identifier: z.string().min(1).describe("The loaded model identifier to use"),
  task: z.string().min(1).describe("The task or prompt for the model"),
  tools: z.array(toolSchemaZ).optional().describe("Tool schemas available for the model to call"),
  toolResults: z.array(toolResultZ).optional().describe("Results from previously requested tool calls"),
  history: z.array(messageZ).optional().describe("Conversation history for multi-turn interactions"),
  maxTokens: z.number().int().min(1).optional().describe("Maximum tokens to generate"),
});

export type ActInput = z.infer<typeof inputSchema>;

// Tool call request output
export interface ToolCallRequest {
  name: string;
  arguments?: Record<string, unknown>;
}

// Output data
export interface ActData {
  done: boolean;
  response?: string;
  toolCalls?: ToolCallRequest[];
  history: Array<{ role: string; content: string }>;
}

/**
 * Build system prompt with tool definitions
 */
function buildToolSystemPrompt(tools: Array<{ name: string; description?: string; parameters?: Record<string, unknown> }>): string {
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
 */
export async function act(input: ActInput): Promise<ToolResult<ActData>> {
  try {
    const client = getClient();

    // Get the model handle
    const handle = client.llm.createDynamicHandle({ identifier: input.identifier });
    const modelInfo = await handle.getModelInfo();

    if (!modelInfo) {
      return errorResult(`Model '${input.identifier}' not found or not loaded`, ErrorCode.MODEL_NOT_LOADED, "Model not loaded");
    }

    // Build conversation history
    type MessageRole = "system" | "user" | "assistant";
    const history: Array<{ role: MessageRole; content: string }> = [];

    // Add any existing history
    if (input.history) {
      for (const msg of input.history) {
        history.push({ role: msg.role, content: msg.content });
      }
    }

    // Add system prompt with tools if provided and not already present
    if (input.tools && input.tools.length > 0 && !history.some((m) => m.role === "system")) {
      history.unshift({
        role: "system",
        content: buildToolSystemPrompt(input.tools),
      });
    }

    // If we have tool results, add them as a user message
    if (input.toolResults && input.toolResults.length > 0) {
      const resultsText = input.toolResults
        .map((r) => `Tool "${r.name}" returned: ${r.result}`)
        .join("\n\n");

      history.push({
        role: "user",
        content: `Here are the results from the tool calls:\n\n${resultsText}\n\nPlease continue with your task based on these results.`,
      });
    } else {
      // Add task as user message for fresh requests
      history.push({ role: "user", content: input.task });
    }

    // Get response from model
    const result = await handle.respond(history, {
      maxTokens: input.maxTokens || 2048,
    });

    const responseText = result.content.trim();

    // Update history with assistant response
    const updatedHistory = [...history, { role: "assistant" as const, content: responseText }];

    // Check if response contains tool calls
    const toolCalls = parseToolCalls(responseText);

    if (toolCalls && toolCalls.length > 0) {
      return successResult("Model requested tool calls", {
        done: false,
        toolCalls,
        history: updatedHistory,
      });
    }

    // No tool calls - this is the final response
    return successResult("Task completed", {
      done: true,
      response: responseText,
      history: updatedHistory,
    });
  } catch (error) {
    const code = mapErrorCode(error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return errorResult("Failed to run task", code, errorMessage);
  }
}
