import { getClient } from "../client";
import { z } from "zod";
import { ToolResult, successResult, errorResult, ErrorCode, mapErrorCode } from "../types";

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
  try {
    const client = getClient();

    // Use the system namespace to list downloaded LLM models
    const downloadedModels = await client.system.listDownloadedModels("llm");

    const models = downloadedModels.map((model) => ({
      modelKey: model.modelKey,
      path: model.path,
      displayName: model.displayName,
      sizeBytes: model.sizeBytes,
      architecture: model.architecture,
      quantization: model.quantization?.name,
    }));

    return successResult(`Found ${models.length} downloaded model(s)`, models);
  } catch (error) {
    const code = mapErrorCode(error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return errorResult("Failed to list models", code, errorMessage);
  }
}
