import { LMStudioClient, type LoggerInterface } from "@lmstudio/sdk";
import { withTimeout, DEFAULT_TIMEOUT } from "./types.js";

/**
 * Configuration for LM Studio connection.
 * Lazily evaluated from environment variables.
 */
function getConfig(): { baseUrl: string } {
  return {
    baseUrl: process.env.LMSTUDIO_BASE_URL || `ws://${process.env.LMSTUDIO_HOST || "127.0.0.1"}:${process.env.LMSTUDIO_PORT || "1234"}`,
  };
}

// Route SDK logs to stderr so MCP stdout remains protocol-safe.
const sdkLogger: LoggerInterface = {
  info: (...messages) => console.error(...messages),
  warn: (...messages) => console.error(...messages),
  error: (...messages) => console.error(...messages),
  debug: () => {},
};

// Singleton instance of the client
let globalClient: LMStudioClient | null = null;

/**
 * Get or create an LM Studio client instance.
 * Maintains a singleton pattern to avoid multiple connections.
 * Configuration is read from environment at call time (not module load).
 */
export function getClient(): LMStudioClient {
  if (!globalClient) {
    const config = getConfig();
    globalClient = new LMStudioClient({
      baseUrl: config.baseUrl,
      logger: sdkLogger,
    });
  }

  return globalClient;
}

/**
 * Reset the client instance. Useful for testing or reconnection after failure.
 */
export function resetClient(): void {
  if (globalClient) {
    globalClient = null;
  }
}

/**
 * Health check result.
 */
export interface HealthCheckResult {
  connected: boolean;
  baseUrl: string;
  error?: string;
}

/**
 * Test the connection to LM Studio.
 * Returns detailed health check result.
 * Resets the client on connection failure to allow reconnection on next attempt.
 */
export async function testConnection(timeoutSeconds: number = DEFAULT_TIMEOUT): Promise<HealthCheckResult> {
  const config = getConfig();
  try {
    const client = getClient();
    await withTimeout(client.llm.listLoaded(), timeoutSeconds, "Health check");
    return {
      connected: true,
      baseUrl: config.baseUrl,
    };
  } catch (error) {
    // Reset client on failure to allow fresh connection on retry
    resetClient();
    return {
      connected: false,
      baseUrl: config.baseUrl,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
