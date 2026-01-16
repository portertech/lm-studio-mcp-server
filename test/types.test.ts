import { describe, it, expect } from "vitest";
import {
  successResult,
  errorResult,
  mapErrorCode,
  ErrorCode,
  withErrorHandling,
  withTimeout,
  DEFAULT_TIMEOUT,
} from "../src/types.js";

describe("types", () => {
  describe("successResult", () => {
    it("creates success result without data", () => {
      const result = successResult("Operation completed");
      expect(result).toEqual({
        success: true,
        message: "Operation completed",
      });
    });

    it("creates success result with data", () => {
      const result = successResult("Found models", [{ id: "1" }, { id: "2" }]);
      expect(result).toEqual({
        success: true,
        message: "Found models",
        data: [{ id: "1" }, { id: "2" }],
      });
    });
  });

  describe("errorResult", () => {
    it("creates error result with default code", () => {
      const result = errorResult("Something failed");
      expect(result).toEqual({
        success: false,
        message: "Something failed",
        error: {
          code: ErrorCode.UNKNOWN,
          message: "Something failed",
        },
      });
    });

    it("creates error result with specific code and message", () => {
      const result = errorResult("Model not loaded", ErrorCode.MODEL_NOT_LOADED, "No model with ID xyz");
      expect(result).toEqual({
        success: false,
        message: "Model not loaded",
        error: {
          code: ErrorCode.MODEL_NOT_LOADED,
          message: "No model with ID xyz",
        },
      });
    });
  });

  describe("mapErrorCode", () => {
    it("maps 'not found' errors to MODEL_NOT_LOADED", () => {
      expect(mapErrorCode(new Error("Model not found"))).toBe(ErrorCode.MODEL_NOT_LOADED);
      expect(mapErrorCode(new Error("No loaded model with identifier"))).toBe(ErrorCode.MODEL_NOT_LOADED);
    });

    it("maps connection errors to CONNECTION_FAILED", () => {
      expect(mapErrorCode(new Error("ECONNREFUSED"))).toBe(ErrorCode.CONNECTION_FAILED);
      expect(mapErrorCode(new Error("WebSocket connection failed"))).toBe(ErrorCode.CONNECTION_FAILED);
      expect(mapErrorCode(new Error("Failed to connect"))).toBe(ErrorCode.CONNECTION_FAILED);
    });

    it("maps validation errors to INVALID_INPUT", () => {
      expect(mapErrorCode(new Error("Invalid parameter"))).toBe(ErrorCode.INVALID_INPUT);
      expect(mapErrorCode(new Error("Validation failed"))).toBe(ErrorCode.INVALID_INPUT);
    });

    it("maps unknown errors to UNKNOWN", () => {
      expect(mapErrorCode(new Error("Some random error"))).toBe(ErrorCode.UNKNOWN);
      expect(mapErrorCode("string error")).toBe(ErrorCode.UNKNOWN);
    });
  });

  describe("withErrorHandling", () => {
    it("returns result from successful operation", async () => {
      const result = await withErrorHandling(async () => successResult("Success", { value: 42 }), "Failed");

      expect(result.success).toBe(true);
      expect(result.message).toBe("Success");
      expect(result.data).toEqual({ value: 42 });
    });

    it("catches errors and returns error result", async () => {
      const result = await withErrorHandling(async () => {
        throw new Error("ECONNREFUSED");
      }, "Operation failed");

      expect(result.success).toBe(false);
      expect(result.message).toBe("Operation failed");
      expect(result.error?.code).toBe(ErrorCode.CONNECTION_FAILED);
      expect(result.error?.message).toBe("ECONNREFUSED");
    });

    it("uses fallback error code when error is unknown", async () => {
      const result = await withErrorHandling(
        async () => {
          throw new Error("Some random error");
        },
        "Operation failed",
        ErrorCode.LOAD_FAILED,
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ErrorCode.LOAD_FAILED);
    });

    it("prefers mapped error code over fallback", async () => {
      const result = await withErrorHandling(
        async () => {
          throw new Error("ECONNREFUSED");
        },
        "Operation failed",
        ErrorCode.LOAD_FAILED,
      );

      expect(result.error?.code).toBe(ErrorCode.CONNECTION_FAILED);
    });

    it("handles non-Error exceptions", async () => {
      const result = await withErrorHandling(async () => {
        throw "string error";
      }, "Operation failed");

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe("Unknown error");
    });
  });

  describe("withTimeout", () => {
    it("returns result when operation completes in time", async () => {
      const result = await withTimeout(Promise.resolve("success"), 1, "Test operation");

      expect(result).toBe("success");
    });

    it("rejects with timeout error when operation takes too long", async () => {
      const slowPromise = new Promise((resolve) => setTimeout(() => resolve("done"), 200));

      await expect(withTimeout(slowPromise, 0.05, "Slow operation")).rejects.toThrow(
        "Slow operation timed out after 0.05s",
      );
    });

    it("propagates original error when operation fails", async () => {
      const failingPromise = Promise.reject(new Error("Original error"));

      await expect(withTimeout(failingPromise, 1, "Failing operation")).rejects.toThrow("Original error");
    });

    it("uses default timeout when not specified", () => {
      expect(DEFAULT_TIMEOUT).toBe(30);
    });
  });
});
