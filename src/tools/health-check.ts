import { testConnection } from "../client.js";
import { z } from "zod";
import { ToolResult, successResult, errorResult, ErrorCode } from "../types.js";

// Input schema for the health check tool (no inputs required)
export const inputSchema = z.object({});

export type HealthCheckInput = z.infer<typeof inputSchema>;

// Output data for health check
export interface HealthCheckData {
  connected: boolean;
  baseUrl: string;
}

/**
 * Check the health/connectivity of the LM Studio server.
 */
export async function healthCheck(_input: HealthCheckInput = {}): Promise<ToolResult<HealthCheckData>> {
  const result = await testConnection();

  if (result.connected) {
    return successResult(`Connected to LM Studio at ${result.baseUrl}`, {
      connected: true,
      baseUrl: result.baseUrl,
    });
  }

  return errorResult(`Failed to connect to LM Studio at ${result.baseUrl}`, ErrorCode.CONNECTION_FAILED, result.error || "Connection failed");
}
