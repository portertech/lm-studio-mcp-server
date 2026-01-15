import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { deleteSessionTool } from "../src/tools/delete-session.js";
import { ErrorCode } from "../src/types.js";
import { createSession, clearAllSessions, getSession } from "../src/sessions.js";

describe("deleteSessionTool", () => {
  beforeEach(() => {
    clearAllSessions();
  });

  afterEach(() => {
    clearAllSessions();
  });

  it("deletes an existing session", async () => {
    const session = createSession("test-model", []);

    const result = await deleteSessionTool({ sessionId: session.id });

    expect(result.success).toBe(true);
    expect(result.data?.sessionId).toBe(session.id);
    expect(result.data?.deleted).toBe(true);

    // Verify session is gone
    expect(getSession(session.id)).toBeUndefined();
  });

  it("returns error for non-existent session", async () => {
    const result = await deleteSessionTool({ sessionId: "non-existent" });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ErrorCode.INVALID_INPUT);
    expect(result.message).toContain("Session not found");
  });

  it("returns error when deleting already deleted session", async () => {
    const session = createSession("test-model", []);
    await deleteSessionTool({ sessionId: session.id });

    const result = await deleteSessionTool({ sessionId: session.id });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ErrorCode.INVALID_INPUT);
  });
});
