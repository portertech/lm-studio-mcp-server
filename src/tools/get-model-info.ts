import { getClient } from "../client";
import { z } from "zod";
import { ToolResult, successResult, errorResult, ErrorCode, mapErrorCode } from "../types";

// Input schema for the get model info tool
export const inputSchema = z.object({
  identifier: z.string().min(1).describe("The model instance identifier to get information about"),
});

export type GetModelInfoInput = z.infer<typeof inputSchema>;

// Output data for model info
export interface ModelInfoData {
  identifier: string;
  modelKey: string;
  path: string;
  displayName: string;
  sizeBytes: number;
  contextLength?: number;
}

/**
 * Get detailed information about a specific loaded model instance.
 */
export async function getModelInfo(input: GetModelInfoInput): Promise<ToolResult<ModelInfoData>> {
  try {
    const client = getClient();

    // Create a dynamic handle for the model by identifier
    const handle = client.llm.createDynamicHandle({ identifier: input.identifier });

    // Get model info - returns undefined if model is not loaded
    const modelInfo = await handle.getModelInfo();

    if (!modelInfo) {
      return errorResult(`Model '${input.identifier}' not found or not loaded`, ErrorCode.MODEL_NOT_LOADED, "Model not loaded");
    }

    return successResult(`Retrieved information for model '${input.identifier}'`, {
      identifier: modelInfo.identifier,
      modelKey: modelInfo.modelKey,
      path: modelInfo.path,
      displayName: modelInfo.displayName,
      sizeBytes: modelInfo.sizeBytes,
      contextLength: modelInfo.contextLength,
    });
  } catch (error) {
    const code = mapErrorCode(error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return errorResult(`Failed to get information for model '${input.identifier}'`, code, errorMessage);
  }
}
