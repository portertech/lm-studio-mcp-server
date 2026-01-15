import { z } from "zod";
import { ToolResult, successResult } from "../types.js";
import { registerToolSet, ToolSchema } from "../sessions.js";

// Tool schema definition (matches MCP tool format)
const toolSchemaZ = z.object({
  name: z.string(),
  description: z.string().optional(),
  parameters: z.record(z.string(), z.any()).optional(),
});

// Input schema for register-tools tool
export const inputSchema = z.object({
  tools: z.array(toolSchemaZ).min(1).describe("Tool schemas to register"),
  toolSetId: z.string().optional().describe("Custom ID for the tool set (auto-generated if omitted)"),
});

export type RegisterToolsInput = z.infer<typeof inputSchema>;

// Output data
export interface RegisterToolsData {
  toolSetId: string;
  toolCount: number;
  toolNames: string[];
}

/**
 * Register a set of tools for reuse across multiple sessions.
 * This reduces token usage by allowing sessions to reference
 * a cached tool set by ID instead of passing the full schema.
 */
export async function registerTools(input: RegisterToolsInput): Promise<ToolResult<RegisterToolsData>> {
  const tools: ToolSchema[] = input.tools;
  const toolSet = registerToolSet(tools, input.toolSetId);

  return successResult("Tool set registered", {
    toolSetId: toolSet.id,
    toolCount: tools.length,
    toolNames: tools.map((t) => t.name),
  });
}
