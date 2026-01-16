import { LMStudioClient } from "@lmstudio/sdk";

/**
 * Silent logger to prevent SDK output from corrupting MCP's stdio protocol.
 * MCP uses stdout for JSON-RPC, so any console.log from the SDK breaks parsing.
 */
const silentLogger = {
  info: () => {},
  error: () => {},
  warn: () => {},
  debug: () => {},
};

/**
 * Validate that a URL is properly formatted for LM Studio connection.
 * Only ws:// and wss:// protocols are allowed.
 */
function validateUrl(url: string): { valid: boolean; error?: string } {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "ws:" && parsed.protocol !== "wss:") {
      return { valid: false, error: `Invalid protocol '${parsed.protocol}'. Only ws:// and wss:// are supported.` };
    }
    if (!parsed.hostname) {
      return { valid: false, error: "URL must include a hostname." };
    }
    return { valid: true };
  } catch {
    return { valid: false, error: `Invalid URL format: ${url}` };
  }
}

/**
 * Configuration for LM Studio connection.
 * Lazily evaluated from environment variables.
 * Throws if the URL is malformed.
 */
function getConfig(): { baseUrl: string } {
  const baseUrl = process.env.LMSTUDIO_BASE_URL || `ws://${process.env.LMSTUDIO_HOST || "127.0.0.1"}:${process.env.LMSTUDIO_PORT || "1234"}`;

  const validation = validateUrl(baseUrl);
  if (!validation.valid) {
    throw new Error(`Invalid LM Studio URL configuration: ${validation.error}`);
  }

  return { baseUrl };
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
      logger: silentLogger,
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
