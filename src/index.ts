import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio";

// Import tool handlers and schemas
import {
  listModels,
  listLoadedModels,
  loadModel,
  unloadModel,
  getModelInfo,
  healthCheck,
  loadModelInputSchema,
  unloadModelInputSchema,
  getModelInfoInputSchema,
} from "./tools";
import { ToolResult, errorResult, ErrorCode } from "./types";

// Server configuration
const SERVER_CONFIG = {
  name: "lmstudio",
  version: "1.0.0",
};

/**
 * Safe wrapper that catches any thrown errors and returns a consistent error payload.
 * This ensures tool handlers never bubble exceptions to the MCP layer.
 */
async function safeToolHandler<T>(handler: () => Promise<ToolResult<T>>): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  try {
    const result = await handler();
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const result = errorResult("An unexpected error occurred", ErrorCode.UNKNOWN, errorMessage);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
}

/**
 * Create and start the MCP server for LM Studio model management.
 */
async function main(): Promise<void> {
  const server = new McpServer({
    name: SERVER_CONFIG.name,
    version: SERVER_CONFIG.version,
  });

  // Register health_check tool
  server.tool("lmstudio_health_check", "Check connectivity to LM Studio server", {}, async () => {
    return safeToolHandler(() => healthCheck({}));
  });

  // Register list_models tool
  server.tool("lmstudio_list_models", "List all downloaded LLM models available in LM Studio", {}, async () => {
    return safeToolHandler(() => listModels({}));
  });

  // Register list_loaded_models tool
  server.tool("lmstudio_list_loaded_models", "List all currently loaded LLM models in LM Studio", {}, async () => {
    return safeToolHandler(() => listLoadedModels({}));
  });

  // Register load_model tool - use schema from tool file
  server.tool("lmstudio_load_model", "Load a model into memory in LM Studio", loadModelInputSchema.shape, async (params) => {
    return safeToolHandler(() => loadModel(params as Parameters<typeof loadModel>[0]));
  });

  // Register unload_model tool - use schema from tool file
  server.tool("lmstudio_unload_model", "Unload a model from memory in LM Studio", unloadModelInputSchema.shape, async (params) => {
    return safeToolHandler(() => unloadModel(params as Parameters<typeof unloadModel>[0]));
  });

  // Register get_model_info tool - use schema from tool file
  server.tool("lmstudio_get_model_info", "Get detailed information about a specific loaded model in LM Studio", getModelInfoInputSchema.shape, async (params) => {
    return safeToolHandler(() => getModelInfo(params as Parameters<typeof getModelInfo>[0]));
  });

  // Connect to stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Handle graceful shutdown
  process.on("SIGINT", async () => {
    await server.close();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    await server.close();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error("Failed to start MCP Server:", error instanceof Error ? error.message : "Unknown error");
  process.exit(1);
});
