import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the client module
vi.mock("../src/client.js", () => ({
  getClient: vi.fn(),
}));

import { getClient } from "../src/client.js";
import { act } from "../src/tools/act.js";
import { ErrorCode } from "../src/types.js";

describe("act tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("basic response", () => {
    it("returns completed response when model responds without tool calls", async () => {
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
      expect(result.data?.response).toBe("Hello! I can help you with that.");
      expect(result.data?.toolCalls).toBeUndefined();
      expect(result.data?.history).toHaveLength(2); // user + assistant
    });

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
  });

  describe("tool calls", () => {
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

  describe("conversation history", () => {
    it("preserves existing history", async () => {
      const mockHandle = {
        getModelInfo: vi.fn().mockResolvedValue({
          identifier: "test-model",
          modelKey: "llama-3.2-3b",
        }),
        respond: vi.fn().mockResolvedValue({
          content: "Continuing the conversation.",
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
        task: "Continue",
        history: [
          { role: "user", content: "Hello" },
          { role: "assistant", content: "Hi there!" },
        ],
      });

      expect(result.success).toBe(true);
      expect(result.data?.history).toHaveLength(4); // 2 existing + user + assistant
    });

    it("adds tool results to history", async () => {
      const mockHandle = {
        getModelInfo: vi.fn().mockResolvedValue({
          identifier: "test-model",
          modelKey: "llama-3.2-3b",
        }),
        respond: vi.fn().mockResolvedValue({
          content: "The weather is sunny.",
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
        toolResults: [{ name: "get_weather", result: "sunny, 22C" }],
        history: [
          { role: "user", content: "What's the weather?" },
          { role: "assistant", content: '{"tool_calls": [{"name": "get_weather"}]}' },
        ],
      });

      expect(result.success).toBe(true);
      // Check that tool results were passed in the history
      const respondCall = mockHandle.respond.mock.calls[0];
      const messages = respondCall[0];
      expect(messages.some((m: { content: string }) => m.content.includes("get_weather"))).toBe(true);
    });
  });

  describe("timeout handling", () => {
    it("times out when model response takes too long", async () => {
      const mockHandle = {
        getModelInfo: vi.fn().mockResolvedValue({
          identifier: "test-model",
          modelKey: "llama-3.2-3b",
        }),
        respond: vi.fn().mockImplementation(
          () => new Promise((resolve) => setTimeout(() => resolve({ content: "done" }), 5000))
        ),
      };

      const mockClient = {
        llm: {
          createDynamicHandle: vi.fn().mockReturnValue(mockHandle),
        },
      };
      vi.mocked(getClient).mockReturnValue(mockClient as never);

      const result = await act({
        identifier: "test-model",
        task: "Slow task",
        timeoutMs: 100, // Very short timeout
      });

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain("timed out");
    }, 10000);

    it("uses default timeout when not specified", async () => {
      const mockHandle = {
        getModelInfo: vi.fn().mockResolvedValue({
          identifier: "test-model",
          modelKey: "llama-3.2-3b",
        }),
        respond: vi.fn().mockResolvedValue({
          content: "Fast response",
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
        task: "Quick task",
      });

      expect(result.success).toBe(true);
      // Default timeout is 60s, so fast response should succeed
    });
  });

  describe("error handling", () => {
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
