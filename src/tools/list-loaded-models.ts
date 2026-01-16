import { getClient } from "../client.js";
import { z } from "zod";
import { ToolResult, successResult, withErrorHandling, withTimeout } from "../types.js";

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
  return withErrorHandling(async () => {
    const client = getClient();
    const loadedModels = await withTimeout(client.llm.listLoaded(), undefined, "List loaded models");

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
  }, "Failed to list loaded models");
}
