import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the client module
vi.mock("../src/client.js", () => ({
  testConnection: vi.fn(),
}));

import { testConnection } from "../src/client.js";
import { healthCheck } from "../src/tools/health-check.js";
import { ErrorCode } from "../src/types.js";

describe("healthCheck", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns success when connected", async () => {
    vi.mocked(testConnection).mockResolvedValue({
      connected: true,
      baseUrl: "ws://127.0.0.1:1234",
    });

    const result = await healthCheck({});

    expect(result.success).toBe(true);
    expect(result.data?.connected).toBe(true);
    expect(result.data?.baseUrl).toBe("ws://127.0.0.1:1234");
    expect(result.message).toContain("Connected to LM Studio");
  });

  it("returns error with CONNECTION_FAILED code when not connected", async () => {
    vi.mocked(testConnection).mockResolvedValue({
      connected: false,
      baseUrl: "ws://127.0.0.1:1234",
      error: "ECONNREFUSED",
    });

    const result = await healthCheck({});

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ErrorCode.CONNECTION_FAILED);
    expect(result.error?.message).toBe("ECONNREFUSED");
    expect(result.message).toContain("Failed to connect");
  });

  it("returns generic error message when error is undefined", async () => {
    vi.mocked(testConnection).mockResolvedValue({
      connected: false,
      baseUrl: "ws://localhost:1234",
    });

    const result = await healthCheck({});

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ErrorCode.CONNECTION_FAILED);
    expect(result.error?.message).toBe("Connection failed");
  });
});
