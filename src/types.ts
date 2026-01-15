/**
 * Standard error codes for tool operations.
 */
export const ErrorCode = {
  MODEL_NOT_FOUND: "MODEL_NOT_FOUND",
  MODEL_NOT_LOADED: "MODEL_NOT_LOADED",
  CONNECTION_FAILED: "CONNECTION_FAILED",
  INVALID_INPUT: "INVALID_INPUT",
  LOAD_FAILED: "LOAD_FAILED",
  UNLOAD_FAILED: "UNLOAD_FAILED",
  UNKNOWN: "UNKNOWN",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * Standard error shape for tool failures.
 */
export interface ToolError {
  code: ErrorCode;
  message: string;
}

/**
 * Standard result envelope for all tool operations.
 * Every tool returns this shape for consistency.
 */
export interface ToolResult<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
  error?: ToolError;
}

/**
 * Helper to create a successful result.
 */
export function successResult<T>(message: string, data?: T): ToolResult<T> {
  const result: ToolResult<T> = { success: true, message };
  if (data !== undefined) {
    result.data = data;
  }
  return result;
}

/**
 * Helper to create an error result.
 */
export function errorResult(message: string, code: ErrorCode = ErrorCode.UNKNOWN, errorMessage?: string): ToolResult<never> {
  return {
    success: false,
    message,
    error: {
      code,
      message: errorMessage || message,
    },
  };
}

/**
 * Map common SDK error messages to error codes.
 */
export function mapErrorCode(error: unknown): ErrorCode {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

  if (message.includes("not found") || message.includes("no loaded model")) {
    return ErrorCode.MODEL_NOT_LOADED;
  }
  if (message.includes("connect") || message.includes("econnrefused") || message.includes("websocket")) {
    return ErrorCode.CONNECTION_FAILED;
  }
  if (message.includes("invalid") || message.includes("validation")) {
    return ErrorCode.INVALID_INPUT;
  }

  return ErrorCode.UNKNOWN;
}
