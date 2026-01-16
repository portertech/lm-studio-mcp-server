import { getClient } from "../client.js";
import { z } from "zod";
import { ToolResult, successResult, errorResult, ErrorCode, withErrorHandling, withTimeout } from "../types.js";

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
  return withErrorHandling(async () => {
    const client = getClient();
    const handle = client.llm.createDynamicHandle({ identifier: input.identifier });
    const modelInfo = await withTimeout(handle.getModelInfo(), undefined, "Get model info");

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
  }, `Failed to get information for model '${input.identifier}'`);
}
