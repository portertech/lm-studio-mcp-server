import { getClient } from "../client";
import { z } from "zod";
import { ToolResult, successResult, errorResult, ErrorCode, mapErrorCode } from "../types";

// Input schema for the load model tool
export const inputSchema = z.object({
  model: z.string().min(1).describe("The model key to load (e.g., 'llama-3.2-3b-instruct')"),
  identifier: z.string().optional().describe("Custom identifier for the loaded model instance"),
  contextLength: z.number().int().min(1).optional().describe("Context window size in tokens"),
  evalBatchSize: z.number().int().min(1).optional().describe("Number of tokens to process together in a batch"),
});

export type LoadModelInput = z.infer<typeof inputSchema>;

// Output data for loaded model
export interface LoadedModelData {
  identifier: string;
  modelKey: string;
  path: string;
}

/**
 * Load a model into memory in LM Studio with optional configuration.
 */
export async function loadModel(input: LoadModelInput): Promise<ToolResult<LoadedModelData>> {
  try {
    const client = getClient();

    // Build load options
    const opts: {
      identifier?: string;
      config?: {
        contextLength?: number;
        evalBatchSize?: number;
      };
    } = {};

    if (input.identifier) {
      opts.identifier = input.identifier;
    }

    // Build config if any config options are specified
    if (input.contextLength !== undefined || input.evalBatchSize !== undefined) {
      opts.config = {};
      if (input.contextLength !== undefined) {
        opts.config.contextLength = input.contextLength;
      }
      if (input.evalBatchSize !== undefined) {
        opts.config.evalBatchSize = input.evalBatchSize;
      }
    }

    // Load the model
    const model = await client.llm.load(input.model, opts);

    return successResult(`Model '${input.model}' loaded successfully with identifier '${model.identifier}'`, {
      identifier: model.identifier,
      modelKey: model.modelKey,
      path: model.path,
    });
  } catch (error) {
    const code = mapErrorCode(error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    // Use specific error code for load failures
    const finalCode = code === ErrorCode.UNKNOWN ? ErrorCode.LOAD_FAILED : code;
    return errorResult(`Failed to load model '${input.model}'`, finalCode, errorMessage);
  }
}
