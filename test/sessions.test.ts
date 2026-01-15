import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  createSession,
  getSession,
  getSessionInfo,
  appendMessage,
  deleteSession,
  listSessions,
  getSessionCount,
  cleanupExpiredSessions,
  clearAllSessions,
  getSessionTTL,
} from "../src/sessions.js";

describe("sessions", () => {
  beforeEach(() => {
    clearAllSessions();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("createSession", () => {
    it("creates a new session with unique ID", () => {
      const session = createSession("test-model", [], undefined);

      expect(session.id).toBeDefined();
      expect(session.id).toHaveLength(36); // UUID format
      expect(session.modelId).toBe("test-model");
      expect(session.messages).toEqual([]);
      expect(session.tools).toEqual([]);
      expect(session.createdAt).toBeGreaterThan(0);
      expect(session.lastAccessedAt).toBe(session.createdAt);
    });

    it("creates a session with system prompt", () => {
      const session = createSession("test-model", [], "You are a helpful assistant.");

      expect(session.messages).toHaveLength(1);
      expect(session.messages[0]).toEqual({
        role: "system",
        content: "You are a helpful assistant.",
      });
    });

    it("creates a session with tools", () => {
      const tools = [
        { name: "read_file", description: "Read a file" },
        { name: "write_file", description: "Write a file", parameters: { path: "string" } },
      ];
      const session = createSession("test-model", tools, undefined);

      expect(session.tools).toEqual(tools);
    });

    it("stores session in the store", () => {
      const session = createSession("test-model", [], undefined);

      expect(getSessionCount()).toBe(1);
      expect(listSessions()).toContain(session.id);
    });
  });

  describe("getSession", () => {
    it("returns session by ID", () => {
      const created = createSession("test-model", [], undefined);
      const retrieved = getSession(created.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
    });

    it("returns undefined for non-existent session", () => {
      const session = getSession("non-existent-id");
      expect(session).toBeUndefined();
    });

    it("updates lastAccessedAt on retrieval", () => {
      vi.useFakeTimers();
      const created = createSession("test-model", [], undefined);
      const originalTime = created.lastAccessedAt;

      vi.advanceTimersByTime(1000);
      const retrieved = getSession(created.id);

      expect(retrieved?.lastAccessedAt).toBeGreaterThan(originalTime);
    });

    it("returns undefined for expired session", () => {
      vi.useFakeTimers();
      const created = createSession("test-model", [], undefined);

      // Advance past TTL
      vi.advanceTimersByTime(getSessionTTL() + 1000);

      const retrieved = getSession(created.id);
      expect(retrieved).toBeUndefined();
    });
  });

  describe("getSessionInfo", () => {
    it("returns session info without messages", () => {
      const session = createSession("test-model", [{ name: "tool1" }], "System prompt");
      appendMessage(session.id, { role: "user", content: "Hello" });
      appendMessage(session.id, { role: "assistant", content: "Hi there" });

      const info = getSessionInfo(session.id);

      expect(info).toBeDefined();
      expect(info?.sessionId).toBe(session.id);
      expect(info?.modelId).toBe("test-model");
      expect(info?.messageCount).toBe(3); // system + user + assistant
      expect(info?.toolCount).toBe(1);
      expect(info?.ttlRemainingMs).toBeGreaterThan(0);
      expect(info?.ttlRemainingMs).toBeLessThanOrEqual(getSessionTTL());
    });

    it("returns undefined for non-existent session", () => {
      const info = getSessionInfo("non-existent");
      expect(info).toBeUndefined();
    });
  });

  describe("appendMessage", () => {
    it("appends message to session", () => {
      const session = createSession("test-model", [], undefined);

      const result = appendMessage(session.id, { role: "user", content: "Hello" });

      expect(result).toBe(true);
      expect(session.messages).toHaveLength(1);
      expect(session.messages[0]).toEqual({ role: "user", content: "Hello" });
    });

    it("appends multiple messages in order", () => {
      const session = createSession("test-model", [], undefined);

      appendMessage(session.id, { role: "user", content: "Hello" });
      appendMessage(session.id, { role: "assistant", content: "Hi" });
      appendMessage(session.id, { role: "user", content: "How are you?" });

      expect(session.messages).toHaveLength(3);
      expect(session.messages.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    });

    it("returns false for non-existent session", () => {
      const result = appendMessage("non-existent", { role: "user", content: "Hello" });
      expect(result).toBe(false);
    });

    it("updates lastAccessedAt", () => {
      vi.useFakeTimers();
      const session = createSession("test-model", [], undefined);
      const originalTime = session.lastAccessedAt;

      vi.advanceTimersByTime(1000);
      appendMessage(session.id, { role: "user", content: "Hello" });

      expect(session.lastAccessedAt).toBeGreaterThan(originalTime);
    });
  });

  describe("deleteSession", () => {
    it("deletes existing session", () => {
      const session = createSession("test-model", [], undefined);

      const result = deleteSession(session.id);

      expect(result).toBe(true);
      expect(getSession(session.id)).toBeUndefined();
      expect(getSessionCount()).toBe(0);
    });

    it("returns false for non-existent session", () => {
      const result = deleteSession("non-existent");
      expect(result).toBe(false);
    });
  });

  describe("listSessions", () => {
    it("returns empty array when no sessions", () => {
      expect(listSessions()).toEqual([]);
    });

    it("returns all session IDs", () => {
      const s1 = createSession("model1", [], undefined);
      const s2 = createSession("model2", [], undefined);
      const s3 = createSession("model3", [], undefined);

      const ids = listSessions();

      expect(ids).toHaveLength(3);
      expect(ids).toContain(s1.id);
      expect(ids).toContain(s2.id);
      expect(ids).toContain(s3.id);
    });
  });

  describe("cleanupExpiredSessions", () => {
    it("removes expired sessions", () => {
      vi.useFakeTimers();

      createSession("model1", [], undefined);
      createSession("model2", [], undefined);

      vi.advanceTimersByTime(getSessionTTL() + 1000);

      // Create a fresh session
      createSession("model3", [], undefined);

      const cleaned = cleanupExpiredSessions();

      expect(cleaned).toBe(2);
      expect(getSessionCount()).toBe(1);
    });

    it("returns 0 when no expired sessions", () => {
      createSession("model1", [], undefined);
      createSession("model2", [], undefined);

      const cleaned = cleanupExpiredSessions();

      expect(cleaned).toBe(0);
      expect(getSessionCount()).toBe(2);
    });
  });

  describe("clearAllSessions", () => {
    it("removes all sessions", () => {
      createSession("model1", [], undefined);
      createSession("model2", [], undefined);
      createSession("model3", [], undefined);

      clearAllSessions();

      expect(getSessionCount()).toBe(0);
      expect(listSessions()).toEqual([]);
    });
  });

  describe("getSessionTTL", () => {
    it("returns TTL in milliseconds", () => {
      const ttl = getSessionTTL();
      expect(ttl).toBe(30 * 60 * 1000); // 30 minutes
    });
  });
});
