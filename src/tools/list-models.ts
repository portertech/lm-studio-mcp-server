import { getClient } from "../client.js";
import { z } from "zod";
import { ToolResult, successResult, withErrorHandling, withTimeout } from "../types.js";

// Input schema for the list models tool (no inputs required)
export const inputSchema = z.object({});

export type ListModelsInput = z.infer<typeof inputSchema>;

// Output data for downloaded models
export interface DownloadedModelInfo {
  modelKey: string;
  path: string;
  displayName: string;
  sizeBytes: number;
  architecture?: string;
  quantization?: string;
}

/**
 * List all downloaded LLM models available in LM Studio.
 * Uses the system.listDownloadedModels() API to get models from the LM Studio library.
 */
export async function listModels(_input: ListModelsInput = {}): Promise<ToolResult<DownloadedModelInfo[]>> {
  return withErrorHandling(async () => {
    const client = getClient();
    const downloadedModels = await withTimeout(client.system.listDownloadedModels("llm"), undefined, "List models");

    const models = downloadedModels.map((model) => ({
      modelKey: model.modelKey,
      path: model.path,
      displayName: model.displayName,
      sizeBytes: model.sizeBytes,
      architecture: model.architecture,
      quantization: model.quantization?.name,
    }));

    return successResult(`Found ${models.length} downloaded model(s)`, models);
  }, "Failed to list models");
}
