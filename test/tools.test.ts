import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the client module
vi.mock("../src/client.js", () => ({
  getClient: vi.fn(),
  testConnection: vi.fn(),
}));

import { getClient, testConnection } from "../src/client.js";
import { listModels } from "../src/tools/list-models.js";
import { listLoadedModels } from "../src/tools/list-loaded-models.js";
import { loadModel } from "../src/tools/load-model.js";
import { unloadModel } from "../src/tools/unload-model.js";
import { getModelInfo } from "../src/tools/get-model-info.js";
import { healthCheck } from "../src/tools/health-check.js";
import { ErrorCode } from "../src/types.js";

describe("tool handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("listModels", () => {
    it("returns success with model list", async () => {
      const mockModels = [
        {
          modelKey: "llama-3.2-3b",
          path: "/models/llama-3.2-3b",
          displayName: "Llama 3.2 3B",
          sizeBytes: 1000000,
          architecture: "llama",
          quantization: { name: "Q4_K_M" },
        },
      ];

      const mockClient = {
        system: {
          listDownloadedModels: vi.fn().mockResolvedValue(mockModels),
        },
      };
      vi.mocked(getClient).mockReturnValue(mockClient as never);

      const result = await listModels({});

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data?.[0].modelKey).toBe("llama-3.2-3b");
      expect(result.data?.[0].quantization).toBe("Q4_K_M");
    });

    it("returns error on connection failure", async () => {
      const mockClient = {
        system: {
          listDownloadedModels: vi.fn().mockRejectedValue(new Error("ECONNREFUSED")),
        },
      };
      vi.mocked(getClient).mockReturnValue(mockClient as never);

      const result = await listModels({});

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.CONNECTION_FAILED);
    });
  });

  describe("listLoadedModels", () => {
    it("returns success with loaded models", async () => {
      const mockModels = [
        {
          identifier: "model-1",
          modelKey: "llama-3.2-3b",
          path: "/models/llama-3.2-3b",
          displayName: "Llama 3.2 3B",
          sizeBytes: 1000000,
          vision: false,
          trainedForToolUse: true,
        },
      ];

      const mockClient = {
        llm: {
          listLoaded: vi.fn().mockResolvedValue(mockModels),
        },
      };
      vi.mocked(getClient).mockReturnValue(mockClient as never);

      const result = await listLoadedModels({});

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data?.[0].identifier).toBe("model-1");
    });
  });

  describe("loadModel", () => {
    it("returns success with model details", async () => {
      const mockModel = {
        identifier: "my-model",
        modelKey: "llama-3.2-3b",
        path: "/models/llama-3.2-3b",
      };

      const mockClient = {
        llm: {
          load: vi.fn().mockResolvedValue(mockModel),
        },
      };
      vi.mocked(getClient).mockReturnValue(mockClient as never);

      const result = await loadModel({ model: "llama-3.2-3b" });

      expect(result.success).toBe(true);
      expect(result.data?.identifier).toBe("my-model");
      expect(mockClient.llm.load).toHaveBeenCalledWith("llama-3.2-3b", {});
    });

    it("passes options to SDK", async () => {
      const mockModel = {
        identifier: "custom-id",
        modelKey: "llama-3.2-3b",
        path: "/models/llama-3.2-3b",
      };

      const mockClient = {
        llm: {
          load: vi.fn().mockResolvedValue(mockModel),
        },
      };
      vi.mocked(getClient).mockReturnValue(mockClient as never);

      const result = await loadModel({
        model: "llama-3.2-3b",
        identifier: "custom-id",
        contextLength: 4096,
        evalBatchSize: 512,
      });

      expect(result.success).toBe(true);
      expect(mockClient.llm.load).toHaveBeenCalledWith("llama-3.2-3b", {
        identifier: "custom-id",
        config: {
          contextLength: 4096,
          evalBatchSize: 512,
        },
      });
    });

    it("returns error on load failure", async () => {
      const mockClient = {
        llm: {
          load: vi.fn().mockRejectedValue(new Error("Model not found")),
        },
      };
      vi.mocked(getClient).mockReturnValue(mockClient as never);

      const result = await loadModel({ model: "nonexistent" });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.MODEL_NOT_LOADED);
    });
  });

  describe("unloadModel", () => {
    it("returns success on unload", async () => {
      const mockClient = {
        llm: {
          unload: vi.fn().mockResolvedValue(undefined),
        },
      };
      vi.mocked(getClient).mockReturnValue(mockClient as never);

      const result = await unloadModel({ identifier: "my-model" });

      expect(result.success).toBe(true);
      expect(mockClient.llm.unload).toHaveBeenCalledWith("my-model");
    });

    it("returns error when model not loaded", async () => {
      const mockClient = {
        llm: {
          unload: vi.fn().mockRejectedValue(new Error("No loaded model with identifier")),
        },
      };
      vi.mocked(getClient).mockReturnValue(mockClient as never);

      const result = await unloadModel({ identifier: "nonexistent" });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.MODEL_NOT_LOADED);
    });
  });

  describe("getModelInfo", () => {
    it("returns model info when loaded", async () => {
      const mockInfo = {
        identifier: "my-model",
        modelKey: "llama-3.2-3b",
        path: "/models/llama-3.2-3b",
        displayName: "Llama 3.2 3B",
        sizeBytes: 1000000,
        contextLength: 4096,
      };

      const mockHandle = {
        getModelInfo: vi.fn().mockResolvedValue(mockInfo),
      };

      const mockClient = {
        llm: {
          createDynamicHandle: vi.fn().mockReturnValue(mockHandle),
        },
      };
      vi.mocked(getClient).mockReturnValue(mockClient as never);

      const result = await getModelInfo({ identifier: "my-model" });

      expect(result.success).toBe(true);
      expect(result.data?.identifier).toBe("my-model");
      expect(result.data?.contextLength).toBe(4096);
    });

    it("returns error when model not found", async () => {
      const mockHandle = {
        getModelInfo: vi.fn().mockResolvedValue(undefined),
      };

      const mockClient = {
        llm: {
          createDynamicHandle: vi.fn().mockReturnValue(mockHandle),
        },
      };
      vi.mocked(getClient).mockReturnValue(mockClient as never);

      const result = await getModelInfo({ identifier: "nonexistent" });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.MODEL_NOT_LOADED);
    });
  });

  describe("edge cases", () => {
    it("listModels returns empty array when no models", async () => {
      const mockClient = {
        system: {
          listDownloadedModels: vi.fn().mockResolvedValue([]),
        },
      };
      vi.mocked(getClient).mockReturnValue(mockClient as never);

      const result = await listModels({});

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
      expect(result.message).toBe("Found 0 downloaded model(s)");
    });

    it("listLoadedModels returns empty array when no models loaded", async () => {
      const mockClient = {
        llm: {
          listLoaded: vi.fn().mockResolvedValue([]),
        },
      };
      vi.mocked(getClient).mockReturnValue(mockClient as never);

      const result = await listLoadedModels({});

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
      expect(result.message).toBe("Found 0 loaded model(s)");
    });

    it("listModels handles models without optional fields", async () => {
      const mockModels = [
        {
          modelKey: "test-model",
          path: "/models/test",
          displayName: "Test Model",
          sizeBytes: 1000,
          // architecture and quantization are undefined
        },
      ];

      const mockClient = {
        system: {
          listDownloadedModels: vi.fn().mockResolvedValue(mockModels),
        },
      };
      vi.mocked(getClient).mockReturnValue(mockClient as never);

      const result = await listModels({});

      expect(result.success).toBe(true);
      expect(result.data?.[0].architecture).toBeUndefined();
      expect(result.data?.[0].quantization).toBeUndefined();
    });

    it("loadModel works with only required model parameter", async () => {
      const mockModel = {
        identifier: "auto-id",
        modelKey: "test-model",
        path: "/models/test",
      };

      const mockClient = {
        llm: {
          load: vi.fn().mockResolvedValue(mockModel),
        },
      };
      vi.mocked(getClient).mockReturnValue(mockClient as never);

      const result = await loadModel({ model: "test-model" });

      expect(result.success).toBe(true);
      expect(mockClient.llm.load).toHaveBeenCalledWith("test-model", {});
    });
  });

  describe("healthCheck", () => {
    it("returns success when connected", async () => {
      vi.mocked(testConnection).mockResolvedValue({
        connected: true,
        baseUrl: "ws://127.0.0.1:1234",
      });

      const result = await healthCheck({});

      expect(result.success).toBe(true);
      expect(result.data?.connected).toBe(true);
      expect(result.data?.baseUrl).toBe("ws://127.0.0.1:1234");
    });

    it("returns error when not connected", async () => {
      vi.mocked(testConnection).mockResolvedValue({
        connected: false,
        baseUrl: "ws://127.0.0.1:1234",
        error: "ECONNREFUSED",
      });

      const result = await healthCheck({});

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.CONNECTION_FAILED);
      expect(result.error?.message).toBe("ECONNREFUSED");
    });

    it("uses default error message when none provided", async () => {
      vi.mocked(testConnection).mockResolvedValue({
        connected: false,
        baseUrl: "ws://127.0.0.1:1234",
      });

      const result = await healthCheck({});

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe("Connection failed");
    });
  });
});
