import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getSessionTool } from "../src/tools/get-session.js";
import { ErrorCode } from "../src/types.js";
import { createSession, appendMessage, clearAllSessions, getSession } from "../src/sessions.js";

describe("getSessionTool", () => {
  beforeEach(() => {
    clearAllSessions();
  });

  afterEach(() => {
    clearAllSessions();
  });

  it("returns session info with lastResponse", async () => {
    const session = createSession("test-model", [], "You are helpful");
    appendMessage(session.id, { role: "user", content: "Hello" });
    appendMessage(session.id, { role: "assistant", content: "Hi there!" });

    const result = await getSessionTool({ sessionId: session.id });

    expect(result.success).toBe(true);
    expect(result.data?.sessionId).toBe(session.id);
    expect(result.data?.modelId).toBe("test-model");
    expect(result.data?.messageCount).toBe(3); // system + user + assistant
    expect(result.data?.lastResponse).toBe("Hi there!");
    expect(result.data?.messages).toBeUndefined();
  });

  it("includes full message history when includeMessages is true", async () => {
    const session = createSession("test-model", []);
    appendMessage(session.id, { role: "user", content: "Hello" });
    appendMessage(session.id, { role: "assistant", content: "Hi!" });

    const result = await getSessionTool({
      sessionId: session.id,
      includeMessages: true,
    });

    expect(result.success).toBe(true);
    expect(result.data?.messages).toBeDefined();
    expect(result.data?.messages).toHaveLength(2);
    expect(result.data?.messages?.[0].content).toBe("Hello");
    expect(result.data?.messages?.[1].content).toBe("Hi!");
  });

  it("deletes session when deleteAfterRead is true", async () => {
    const session = createSession("test-model", []);
    appendMessage(session.id, { role: "assistant", content: "Done" });

    const result = await getSessionTool({
      sessionId: session.id,
      deleteAfterRead: true,
    });

    expect(result.success).toBe(true);
    expect(result.data?.lastResponse).toBe("Done");

    // Session should be deleted
    const deletedSession = getSession(session.id);
    expect(deletedSession).toBeUndefined();
  });

  it("returns error for non-existent session", async () => {
    const result = await getSessionTool({ sessionId: "non-existent" });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ErrorCode.INVALID_INPUT);
    expect(result.message).toContain("Session not found");
  });

  it("returns undefined lastResponse when no assistant messages", async () => {
    const session = createSession("test-model", []);
    appendMessage(session.id, { role: "user", content: "Hello" });

    const result = await getSessionTool({ sessionId: session.id });

    expect(result.success).toBe(true);
    expect(result.data?.lastResponse).toBeUndefined();
  });
});
