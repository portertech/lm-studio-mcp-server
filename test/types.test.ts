import { describe, it, expect } from "vitest";
import { successResult, errorResult, mapErrorCode, ErrorCode } from "../src/types";

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
});
