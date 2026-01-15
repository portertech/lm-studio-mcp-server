import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the client module
vi.mock("../src/client.js", () => ({
  getClient: vi.fn(),
}));

import { getClient } from "../src/client.js";
import { act } from "../src/tools/act.js";
import { ErrorCode } from "../src/types.js";
import { clearAllSessions } from "../src/sessions.js";

describe("act tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAllSessions();
  });

  afterEach(() => {
    clearAllSessions();
  });

  describe("new session", () => {
    it("returns completed response with sessionId when model responds without tool calls", async () => {
      const mockHandle = {
        getModelInfo: vi.fn().mockResolvedValue({
          identifier: "test-model",
          modelKey: "llama-3.2-3b",
        }),
        respond: vi.fn().mockResolvedValue({
          content: "Hello! I can help you with that.",
        }),
      };

      const mockClient = {
        llm: {
          createDynamicHandle: vi.fn().mockReturnValue(mockHandle),
        },
      };
      vi.mocked(getClient).mockReturnValue(mockClient as never);

      const result = await act({
        identifier: "test-model",
        task: "Say hello",
      });

      expect(result.success).toBe(true);
      expect(result.data?.done).toBe(true);
      expect(result.data?.sessionId).toBeDefined();
      expect(result.data?.response).toBe("Hello! I can help you with that.");
      expect(result.data?.toolCalls).toBeUndefined();
    });

    it("returns tool calls with sessionId for continuation", async () => {
      const mockHandle = {
        getModelInfo: vi.fn().mockResolvedValue({
          identifier: "test-model",
          modelKey: "llama-3.2-3b",
        }),
        respond: vi.fn().mockResolvedValue({
          content: '{"tool_calls": [{"name": "get_weather", "arguments": {"city": "London"}}]}',
        }),
      };

      const mockClient = {
        llm: {
          createDynamicHandle: vi.fn().mockReturnValue(mockHandle),
        },
      };
      vi.mocked(getClient).mockReturnValue(mockClient as never);

      const result = await act({
        identifier: "test-model",
        task: "What's the weather in London?",
        tools: [{ name: "get_weather", description: "Get weather for a city" }],
      });

      expect(result.success).toBe(true);
      expect(result.data?.done).toBe(false);
      expect(result.data?.sessionId).toBeDefined();
      expect(result.data?.toolCalls).toHaveLength(1);
      expect(result.data?.toolCalls?.[0].name).toBe("get_weather");
    });

    it("requires identifier for new session", async () => {
      const result = await act({
        task: "Do something",
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_INPUT);
      expect(result.message.toLowerCase()).toContain("identifier");
    });

    it("requires task for new session", async () => {
      const result = await act({
        identifier: "test-model",
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_INPUT);
      expect(result.message.toLowerCase()).toContain("task");
    });
  });

  describe("session continuation", () => {
    it("continues session with tool results using sessionId", async () => {
      const mockHandle = {
        getModelInfo: vi.fn().mockResolvedValue({
          identifier: "test-model",
          modelKey: "llama-3.2-3b",
        }),
        respond: vi
          .fn()
          .mockResolvedValueOnce({
            content: '{"tool_calls": [{"name": "get_weather", "arguments": {"city": "London"}}]}',
          })
          .mockResolvedValueOnce({
            content: "The weather in London is sunny.",
          }),
      };

      const mockClient = {
        llm: {
          createDynamicHandle: vi.fn().mockReturnValue(mockHandle),
        },
      };
      vi.mocked(getClient).mockReturnValue(mockClient as never);

      // First call - start session
      const result1 = await act({
        identifier: "test-model",
        task: "What's the weather in London?",
        tools: [{ name: "get_weather" }],
      });

      expect(result1.success).toBe(true);
      expect(result1.data?.done).toBe(false);
      const sessionId = result1.data?.sessionId;
      expect(sessionId).toBeDefined();

      // Second call - continue with tool results
      const result2 = await act({
        sessionId,
        toolResults: [{ name: "get_weather", result: "sunny, 22C" }],
      });

      expect(result2.success).toBe(true);
      expect(result2.data?.done).toBe(true);
      expect(result2.data?.sessionId).toBe(sessionId);
      expect(result2.data?.response).toBe("The weather in London is sunny.");
    });

    it("returns error when session not found", async () => {
      const result = await act({
        sessionId: "non-existent-session-id",
        toolResults: [{ name: "test", result: "value" }],
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_INPUT);
      expect(result.message).toContain("Session not found");
    });
  });

  describe("tool call parsing", () => {
    it("parses tool calls from JSON response", async () => {
      const mockHandle = {
        getModelInfo: vi.fn().mockResolvedValue({
          identifier: "test-model",
          modelKey: "llama-3.2-3b",
        }),
        respond: vi.fn().mockResolvedValue({
          content: '{"tool_calls": [{"name": "get_weather", "arguments": {"city": "London"}}]}',
        }),
      };

      const mockClient = {
        llm: {
          createDynamicHandle: vi.fn().mockReturnValue(mockHandle),
        },
      };
      vi.mocked(getClient).mockReturnValue(mockClient as never);

      const result = await act({
        identifier: "test-model",
        task: "What's the weather in London?",
        tools: [{ name: "get_weather", description: "Get weather for a city" }],
      });

      expect(result.success).toBe(true);
      expect(result.data?.done).toBe(false);
      expect(result.data?.toolCalls).toHaveLength(1);
      expect(result.data?.toolCalls?.[0].name).toBe("get_weather");
      expect(result.data?.toolCalls?.[0].arguments).toEqual({ city: "London" });
    });

    it("parses tool calls from markdown code block", async () => {
      const mockHandle = {
        getModelInfo: vi.fn().mockResolvedValue({
          identifier: "test-model",
          modelKey: "llama-3.2-3b",
        }),
        respond: vi.fn().mockResolvedValue({
          content: '```json\n{"tool_calls": [{"name": "search", "arguments": {"query": "test"}}]}\n```',
        }),
      };

      const mockClient = {
        llm: {
          createDynamicHandle: vi.fn().mockReturnValue(mockHandle),
        },
      };
      vi.mocked(getClient).mockReturnValue(mockClient as never);

      const result = await act({
        identifier: "test-model",
        task: "Search for test",
        tools: [{ name: "search" }],
      });

      expect(result.success).toBe(true);
      expect(result.data?.done).toBe(false);
      expect(result.data?.toolCalls?.[0].name).toBe("search");
    });

    it("returns text response when JSON is not valid tool calls", async () => {
      const mockHandle = {
        getModelInfo: vi.fn().mockResolvedValue({
          identifier: "test-model",
          modelKey: "llama-3.2-3b",
        }),
        respond: vi.fn().mockResolvedValue({
          content: '{"other_key": "not tool calls"}',
        }),
      };

      const mockClient = {
        llm: {
          createDynamicHandle: vi.fn().mockReturnValue(mockHandle),
        },
      };
      vi.mocked(getClient).mockReturnValue(mockClient as never);

      const result = await act({
        identifier: "test-model",
        task: "Do something",
      });

      expect(result.success).toBe(true);
      expect(result.data?.done).toBe(true);
      expect(result.data?.toolCalls).toBeUndefined();
    });
  });

  describe("error handling", () => {
    it("returns error when model is not loaded", async () => {
      const mockHandle = {
        getModelInfo: vi.fn().mockResolvedValue(undefined),
      };

      const mockClient = {
        llm: {
          createDynamicHandle: vi.fn().mockReturnValue(mockHandle),
        },
      };
      vi.mocked(getClient).mockReturnValue(mockClient as never);

      const result = await act({
        identifier: "nonexistent-model",
        task: "Do something",
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.MODEL_NOT_LOADED);
    });

    it("returns connection error on network failure", async () => {
      const mockClient = {
        llm: {
          createDynamicHandle: vi.fn().mockImplementation(() => {
            throw new Error("ECONNREFUSED");
          }),
        },
      };
      vi.mocked(getClient).mockReturnValue(mockClient as never);

      const result = await act({
        identifier: "test-model",
        task: "Do something",
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.CONNECTION_FAILED);
    });

    it("handles unknown errors gracefully", async () => {
      const mockHandle = {
        getModelInfo: vi.fn().mockRejectedValue(new Error("Unknown SDK error")),
      };

      const mockClient = {
        llm: {
          createDynamicHandle: vi.fn().mockReturnValue(mockHandle),
        },
      };
      vi.mocked(getClient).mockReturnValue(mockClient as never);

      const result = await act({
        identifier: "test-model",
        task: "Do something",
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe("Failed to run task");
    });
  });
});
