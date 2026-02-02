import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

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
} from "./tools/index.js";
import { ToolResult, errorResult, ErrorCode } from "./types.js";

// Server configuration
const SERVER_CONFIG = {
  name: "lmstudio",
  version: "1.0.0",
};

/**
 * Safe wrapper that catches any thrown errors and returns a consistent error payload.
 * This ensures tool handlers never bubble exceptions to the MCP layer.
 */
async function safeToolHandler<T>(
  handler: () => Promise<ToolResult<T>>,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
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
 * Tool definition for registration.
 */
interface ToolDefinition<TSchema extends z.ZodObject<z.ZodRawShape>, TResult> {
  name: string;
  description: string;
  schema: TSchema;
  handler: (params: z.infer<TSchema>) => Promise<ToolResult<TResult>>;
}

/**
 * Register a tool with the MCP server.
 */
function registerTool<TSchema extends z.ZodObject<z.ZodRawShape>, TResult>(
  server: McpServer,
  tool: ToolDefinition<TSchema, TResult>,
): void {
  server.tool(tool.name, tool.description, tool.schema.shape, async (params) => {
    return safeToolHandler(() => tool.handler(params as z.infer<TSchema>));
  });
}

// Empty schema for tools with no parameters
const emptySchema = z.object({});

/**
 * Create and start the MCP server for LM Studio model management.
 */
async function main(): Promise<void> {
  const server = new McpServer({
    name: SERVER_CONFIG.name,
    version: SERVER_CONFIG.version,
  });

  // Register tools using the helper
  registerTool(server, {
    name: "health_check",
    description: "Check connectivity to LM Studio server",
    schema: emptySchema,
    handler: healthCheck,
  });

  registerTool(server, {
    name: "list_models",
    description: "List all downloaded LLM models available in LM Studio",
    schema: emptySchema,
    handler: listModels,
  });

  registerTool(server, {
    name: "list_loaded_models",
    description: "List all currently loaded LLM models in LM Studio",
    schema: emptySchema,
    handler: listLoadedModels,
  });

  registerTool(server, {
    name: "load_model",
    description: "Load a model into memory in LM Studio",
    schema: loadModelInputSchema,
    handler: loadModel,
  });

  registerTool(server, {
    name: "unload_model",
    description: "Unload a model from memory in LM Studio",
    schema: unloadModelInputSchema,
    handler: unloadModel,
  });

  registerTool(server, {
    name: "get_model_info",
    description: "Get detailed information about a specific loaded model in LM Studio",
    schema: getModelInfoInputSchema,
    handler: getModelInfo,
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
