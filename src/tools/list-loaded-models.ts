import { getClient } from "../client";
import { z } from "zod";
import { ToolResult, successResult, errorResult, mapErrorCode } from "../types";

// Input schema for the list loaded models tool (no inputs required)
export const inputSchema = z.object({});

export type ListLoadedModelsInput = z.infer<typeof inputSchema>;

// Output data for loaded models
export interface LoadedModelInfo {
  identifier: string;
  modelKey: string;
  path: string;
  displayName: string;
  sizeBytes: number;
  vision: boolean;
  trainedForToolUse: boolean;
}

/**
 * Get currently loaded/active LLM models in LM Studio.
 */
export async function listLoadedModels(_input: ListLoadedModelsInput = {}): Promise<ToolResult<LoadedModelInfo[]>> {
  try {
    const client = getClient();

    // Get the list of loaded LLM models
    const loadedModels = await client.llm.listLoaded();

    const models = loadedModels.map((model) => ({
      identifier: model.identifier,
      modelKey: model.modelKey,
      path: model.path,
      displayName: model.displayName,
      sizeBytes: model.sizeBytes,
      vision: model.vision,
      trainedForToolUse: model.trainedForToolUse,
    }));

    return successResult(`Found ${models.length} loaded model(s)`, models);
  } catch (error) {
    const code = mapErrorCode(error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return errorResult("Failed to list loaded models", code, errorMessage);
  }
}
