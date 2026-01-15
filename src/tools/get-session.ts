import { z } from "zod";
import { ToolResult, successResult, errorResult, ErrorCode } from "../types.js";
import { getSession, deleteSession, ChatMessage } from "../sessions.js";

// Input schema for the get-session tool
export const inputSchema = z.object({
  sessionId: z.string().min(1).describe("The session ID to retrieve"),
  includeMessages: z.boolean().optional().describe("Include full message history (default: false)"),
  deleteAfterRead: z.boolean().optional().describe("Delete session after reading (default: false)"),
});

export type GetSessionInput = z.infer<typeof inputSchema>;

// Output data
export interface GetSessionData {
  sessionId: string;
  modelId: string;
  messageCount: number;
  lastResponse?: string;
  messages?: ChatMessage[];
}

/**
 * Get session details and optionally the full conversation history.
 * Use this to read the final response from a completed task without
 * having it included in every act() response.
 */
export async function getSessionTool(input: GetSessionInput): Promise<ToolResult<GetSessionData>> {
  const session = getSession(input.sessionId);

  if (!session) {
    return errorResult(
      "Session not found or expired",
      ErrorCode.INVALID_INPUT,
      `Session '${input.sessionId}' does not exist or has expired`
    );
  }

  // Find the last assistant message
  const lastAssistantMessage = [...session.messages]
    .reverse()
    .find((m) => m.role === "assistant");

  const data: GetSessionData = {
    sessionId: session.id,
    modelId: session.modelId,
    messageCount: session.messages.length,
    lastResponse: lastAssistantMessage?.content,
  };

  if (input.includeMessages) {
    data.messages = session.messages;
  }

  if (input.deleteAfterRead) {
    deleteSession(session.id);
  }

  return successResult("Session retrieved", data);
}
