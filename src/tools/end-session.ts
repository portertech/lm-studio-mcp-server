import { z } from "zod";
import { ToolResult, successResult, errorResult, ErrorCode } from "../types.js";
import { deleteSession } from "../sessions.js";

// Input schema for end-session tool
export const inputSchema = z.object({
  sessionId: z.string().min(1).describe("The session ID to end"),
});

export type EndSessionInput = z.infer<typeof inputSchema>;

// Output data
export interface EndSessionData {
  sessionId: string;
  ended: boolean;
}

/**
 * End an active session and free its resources.
 * Sessions are automatically cleaned up after TTL, but this allows explicit cleanup.
 */
export async function endSession(input: EndSessionInput): Promise<ToolResult<EndSessionData>> {
  const deleted = deleteSession(input.sessionId);

  if (!deleted) {
    return errorResult(
      "Session not found or already ended",
      ErrorCode.INVALID_INPUT,
      `Session '${input.sessionId}' does not exist or has already been ended`
    );
  }

  return successResult("Session ended", {
    sessionId: input.sessionId,
    ended: true,
  });
}
