import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the client module
vi.mock("../src/client.js", () => ({
  getClient: vi.fn(),
}));

import { getClient } from "../src/client.js";
import { act } from "../src/tools/act.js";
import { ErrorCode } from "../src/types.js";
import { clearAllSessions, clearAllToolSets, registerToolSet } from "../src/sessions.js";

describe("act tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAllSessions();
    clearAllToolSets();
  });

  afterEach(() => {
    clearAllSessions();
    clearAllToolSets();
  });

  describe("new session", () => {
    it("returns completed status with sessionId when model responds without tool calls", async () => {
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
      expect(result.data?.response).toBeUndefined(); // Response omitted for token efficiency
      expect(result.data?.stats?.responseLength).toBe(32);
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

    it("uses cached tool set when toolSetId is provided", async () => {
      // Register a tool set first
      const toolSet = registerToolSet([
        { name: "cached_tool", description: "A cached tool" },
      ]);

      const mockHandle = {
        getModelInfo: vi.fn().mockResolvedValue({
          identifier: "test-model",
          modelKey: "llama-3.2-3b",
        }),
        respond: vi.fn().mockResolvedValue({
          content: '{"tool_calls": [{"name": "cached_tool", "arguments": {}}]}',
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
        task: "Use the cached tool",
        toolSetId: toolSet.id,
      });

      expect(result.success).toBe(true);
      expect(result.data?.toolCalls?.[0].name).toBe("cached_tool");
    });

    it("returns error when toolSetId not found", async () => {
      const result = await act({
        identifier: "test-model",
        task: "Do something",
        toolSetId: "non-existent-tool-set",
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.INVALID_INPUT);
      expect(result.message).toContain("Tool set not found");
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
      expect(result2.data?.response).toBeUndefined(); // Response omitted, use getSession to read
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

  describe("response options", () => {
    it("includes stats in completed response", async () => {
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
      expect(result.data?.stats).toBeDefined();
      expect(result.data?.stats?.messageCount).toBeGreaterThan(0);
      expect(result.data?.stats?.responseLength).toBe(32);
    });

    it("includes stats in tool call response", async () => {
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
        task: "What's the weather?",
        tools: [{ name: "get_weather" }],
      });

      expect(result.success).toBe(true);
      expect(result.data?.done).toBe(false);
      expect(result.data?.stats).toBeDefined();
      expect(result.data?.stats?.messageCount).toBeGreaterThan(0);
    });

    it("omits response by default for token efficiency", async () => {
      const mockHandle = {
        getModelInfo: vi.fn().mockResolvedValue({
          identifier: "test-model",
          modelKey: "llama-3.2-3b",
        }),
        respond: vi.fn().mockResolvedValue({
          content: "This is a response that parent can fetch via getSession.",
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
      expect(result.data?.response).toBeUndefined();
      expect(result.data?.stats?.responseLength).toBe(56);
    });

    it("keeps session alive after completion for parent to read", async () => {
      const mockHandle = {
        getModelInfo: vi.fn().mockResolvedValue({
          identifier: "test-model",
          modelKey: "llama-3.2-3b",
        }),
        respond: vi.fn().mockResolvedValue({
          content: "Task complete.",
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

      // Session should still exist
      const { getSession } = await import("../src/sessions.js");
      const session = getSession(result.data!.sessionId);
      expect(session).toBeDefined();
      expect(session?.messages.some((m) => m.content === "Task complete.")).toBe(true);
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
