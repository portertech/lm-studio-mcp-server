import { LMStudioClient } from "@lmstudio/sdk";

/**
 * Configuration for LM Studio connection.
 * Lazily evaluated from environment variables.
 */
function getConfig(): { baseUrl: string } {
  return {
    baseUrl: process.env.LMSTUDIO_BASE_URL || `ws://${process.env.LMSTUDIO_HOST || "127.0.0.1"}:${process.env.LMSTUDIO_PORT || "1234"}`,
  };
}

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
    });
  }

  return globalClient;
}

/**
 * Reset the client instance. Useful for testing or reconnection.
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
 */
export async function testConnection(): Promise<HealthCheckResult> {
  const config = getConfig();
  try {
    const client = getClient();
    await client.llm.listLoaded();
    return {
      connected: true,
      baseUrl: config.baseUrl,
    };
  } catch (error) {
    return {
      connected: false,
      baseUrl: config.baseUrl,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
