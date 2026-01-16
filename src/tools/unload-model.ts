import { getClient } from "../client.js";
import { z } from "zod";
import { ToolResult, successResult, errorResult, ErrorCode, mapErrorCode, withTimeout } from "../types.js";

// Input schema for the unload model tool
export const inputSchema = z.object({
  identifier: z.string().min(1).describe("The model instance identifier to unload"),
});

export type UnloadModelInput = z.infer<typeof inputSchema>;

/**
 * Unload a specific model instance from memory in LM Studio.
 */
export async function unloadModel(input: UnloadModelInput): Promise<ToolResult<void>> {
  // Special handling needed for MODEL_NOT_LOADED to customize error message
  try {
    const client = getClient();
    await withTimeout(client.llm.unload(input.identifier), undefined, "Unload model");
    return successResult(`Model '${input.identifier}' unloaded successfully`);
  } catch (error) {
    const code = mapErrorCode(error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    if (code === ErrorCode.MODEL_NOT_LOADED) {
      return errorResult(
        `Model '${input.identifier}' is not currently loaded`,
        ErrorCode.MODEL_NOT_LOADED,
        errorMessage,
      );
    }

    const finalCode = code === ErrorCode.UNKNOWN ? ErrorCode.UNLOAD_FAILED : code;
    return errorResult(`Failed to unload model '${input.identifier}'`, finalCode, errorMessage);
  }
}
