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
  act,
  getSessionTool,
  deleteSessionTool,
  loadModelInputSchema,
  unloadModelInputSchema,
  getModelInfoInputSchema,
  actInputSchema,
  getSessionInputSchema,
  deleteSessionInputSchema,
} from "./tools/index.js";
import { ToolResult, errorResult, ErrorCode } from "./types.js";

// Server configuration
const SERVER_CONFIG = {
  name: "lmstudio",
  version: "1.0.0",
};

/**
 * Validate input params against a Zod schema and call the handler if valid.
 * Returns an INVALID_INPUT error if validation fails.
 */
async function validateAndCall<T, R>(
  schema: z.ZodType<T>,
  params: unknown,
  handler: (validatedParams: T) => Promise<ToolResult<R>>
): Promise<ToolResult<R>> {
  const result = schema.safeParse(params);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    return errorResult("Invalid input parameters", ErrorCode.INVALID_INPUT, issues) as ToolResult<R>;
  }
  return handler(result.data);
}

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
    return safeToolHandler(() => validateAndCall(loadModelInputSchema, params, loadModel));
  });

  // Register unload_model tool - use schema from tool file
  server.tool("lmstudio_unload_model", "Unload a model from memory in LM Studio", unloadModelInputSchema.shape, async (params) => {
    return safeToolHandler(() => validateAndCall(unloadModelInputSchema, params, unloadModel));
  });

  // Register get_model_info tool - use schema from tool file
  server.tool("lmstudio_get_model_info", "Get detailed information about a specific loaded model in LM Studio", getModelInfoInputSchema.shape, async (params) => {
    return safeToolHandler(() => validateAndCall(getModelInfoInputSchema, params, getModelInfo));
  });

  // Register act tool - agentic task execution with tool use
  server.tool(
    "lmstudio_act",
    "Run an agentic task with a local LM Studio model. Supports tool use via request/response pattern - model can request tool calls which are returned to caller for execution.",
    actInputSchema.shape,
    async (params) => {
      return safeToolHandler(() => validateAndCall(actInputSchema, params, act));
    }
  );

  // Register get_session tool - read session response/history
  server.tool(
    "lmstudio_get_session",
    "Read the response from a completed agentic session. Use this to fetch the full response text only when needed, reducing token usage.",
    getSessionInputSchema.shape,
    async (params) => {
      return safeToolHandler(() => validateAndCall(getSessionInputSchema, params, getSessionTool));
    }
  );

  // Register delete_session tool - explicit session cleanup
  server.tool(
    "lmstudio_delete_session",
    "Delete an agentic session and free its resources",
    deleteSessionInputSchema.shape,
    async (params) => {
      return safeToolHandler(() => validateAndCall(deleteSessionInputSchema, params, deleteSessionTool));
    }
  );

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
