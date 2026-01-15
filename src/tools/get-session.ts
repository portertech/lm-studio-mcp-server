import { z } from "zod";
import { ToolResult, successResult, errorResult, ErrorCode } from "../types.js";
import { getSessionInfo, SessionInfo } from "../sessions.js";

// Input schema for get-session tool
export const inputSchema = z.object({
  sessionId: z.string().min(1).describe("The session ID to get information about"),
});

export type GetSessionInput = z.infer<typeof inputSchema>;

// Output data
export type GetSessionData = SessionInfo;

/**
 * Get information about an active session.
 * Returns session metadata without the full message history.
 */
export async function getSessionTool(input: GetSessionInput): Promise<ToolResult<GetSessionData>> {
  const info = getSessionInfo(input.sessionId);

  if (!info) {
    return errorResult(
      "Session not found or expired",
      ErrorCode.INVALID_INPUT,
      `Session '${input.sessionId}' does not exist or has expired`
    );
  }

  return successResult("Session found", info);
}
