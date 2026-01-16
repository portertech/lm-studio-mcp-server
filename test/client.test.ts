import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Create a mock class for LMStudioClient
const mockListLoaded = vi.fn();

vi.mock("@lmstudio/sdk", () => ({
  LMStudioClient: class MockLMStudioClient {
    llm = {
      listLoaded: mockListLoaded,
    };
    constructor(public config: { baseUrl: string }) {}
  },
}));

import { getClient, resetClient, testConnection } from "../src/client.js";

describe("client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetClient();
    // Clear env vars
    delete process.env.LMSTUDIO_BASE_URL;
    delete process.env.LMSTUDIO_HOST;
    delete process.env.LMSTUDIO_PORT;
  });

  afterEach(() => {
    resetClient();
  });

  describe("getClient", () => {
    it("creates client with default config", () => {
      const client = getClient();

      expect(client).toBeDefined();
      expect((client as unknown as { config: { baseUrl: string } }).config.baseUrl).toBe("ws://127.0.0.1:1234");
    });

    it("uses LMSTUDIO_BASE_URL when set", () => {
      process.env.LMSTUDIO_BASE_URL = "ws://custom:5678";

      const client = getClient();

      expect((client as unknown as { config: { baseUrl: string } }).config.baseUrl).toBe("ws://custom:5678");
    });

    it("constructs URL from HOST and PORT", () => {
      process.env.LMSTUDIO_HOST = "192.168.1.100";
      process.env.LMSTUDIO_PORT = "9999";

      const client = getClient();

      expect((client as unknown as { config: { baseUrl: string } }).config.baseUrl).toBe("ws://192.168.1.100:9999");
    });

    it("returns singleton instance", () => {
      const client1 = getClient();
      const client2 = getClient();

      expect(client1).toBe(client2);
    });
  });

  describe("resetClient", () => {
    it("clears singleton so next getClient creates new instance", () => {
      const client1 = getClient();
      resetClient();
      const client2 = getClient();

      expect(client1).not.toBe(client2);
    });
  });

  describe("testConnection", () => {
    it("returns connected true when listLoaded succeeds", async () => {
      mockListLoaded.mockResolvedValue([]);

      const result = await testConnection();

      expect(result.connected).toBe(true);
      expect(result.baseUrl).toBe("ws://127.0.0.1:1234");
      expect(result.error).toBeUndefined();
    });

    it("returns connected false with error on failure", async () => {
      mockListLoaded.mockRejectedValue(new Error("ECONNREFUSED"));

      const result = await testConnection();

      expect(result.connected).toBe(false);
      expect(result.baseUrl).toBe("ws://127.0.0.1:1234");
      expect(result.error).toBe("ECONNREFUSED");
    });

    it("handles non-Error exceptions", async () => {
      mockListLoaded.mockRejectedValue("string error");

      const result = await testConnection();

      expect(result.connected).toBe(false);
      expect(result.error).toBe("Unknown error");
    });

    it("resets client on connection failure for retry", async () => {
      mockListLoaded.mockRejectedValue(new Error("ECONNREFUSED"));

      const client1 = getClient();
      await testConnection();

      // After failure, client should be reset
      const client2 = getClient();
      expect(client1).not.toBe(client2);
    });
  });
});
