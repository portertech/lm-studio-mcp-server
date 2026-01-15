import { z } from "zod";
import { ToolResult, successResult, errorResult, ErrorCode } from "../types.js";
import { deleteSession } from "../sessions.js";

// Input schema for delete-session tool
export const inputSchema = z.object({
  sessionId: z.string().min(1).describe("The session ID to delete"),
});

export type DeleteSessionInput = z.infer<typeof inputSchema>;

// Output data
export interface DeleteSessionData {
  sessionId: string;
  deleted: boolean;
}

/**
 * Delete an active session and free its resources.
 * Sessions are automatically cleaned up after TTL, but this allows explicit cleanup.
 */
export async function deleteSessionTool(input: DeleteSessionInput): Promise<ToolResult<DeleteSessionData>> {
  const deleted = deleteSession(input.sessionId);

  if (!deleted) {
    return errorResult(
      "Session not found or already deleted",
      ErrorCode.INVALID_INPUT,
      `Session '${input.sessionId}' does not exist or has already been deleted`
    );
  }

  return successResult("Session deleted", {
    sessionId: input.sessionId,
    deleted: true,
  });
}
