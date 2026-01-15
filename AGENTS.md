# AGENTS.md

Guidelines for AI agents working in the LM Studio MCP Server codebase.

## Project Overview

TypeScript MCP (Model Context Protocol) server that enables AI assistants to control LM Studio models. Provides tools for model management (list, load, unload) and agentic task execution through the LM Studio API.

## Commands

| Command | Purpose |
|---------|---------|
| `npm install` | Install dependencies |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run dev server with `tsx` |
| `npm run dev` | Run dev server with file watching |
| `npm run start:prod` | Run compiled production build |
| `npm test` | Run tests once with Vitest |
| `npm run test:watch` | Run tests in watch mode |
| `npm run typecheck` | Type-check without emitting files |

## Project Structure

```
src/
├── index.ts              # MCP server entry point, tool registration
├── client.ts             # LM Studio SDK client wrapper (singleton)
├── sessions.ts           # Server-side session management
├── types.ts              # Shared types, result helpers, error codes
└── tools/
    ├── index.ts          # Barrel exports for all tools
    ├── health-check.ts   # Connection health check
    ├── list-models.ts    # List downloaded models
    ├── list-loaded-models.ts
    ├── load-model.ts
    ├── unload-model.ts
    ├── get-model-info.ts
    ├── act.ts            # Agentic task execution with tool use
    ├── get-session.ts    # Read session response/history
    └── delete-session.ts # Explicit session cleanup

test/
├── schemas.test.ts       # Input schema validation tests
├── tools.test.ts         # Tool handler tests with mocked client
└── types.test.ts         # Type helper function tests
```

## Code Patterns

### Tool Structure

Each tool follows a consistent pattern in its own file under `src/tools/`:

```typescript
import { getClient } from "../client.js";
import { z } from "zod";
import { ToolResult, successResult, errorResult, ErrorCode, mapErrorCode } from "../types.js";

// 1. Define input schema with Zod
export const inputSchema = z.object({
  identifier: z.string().min(1).describe("Description for MCP schema"),
  optionalField: z.number().optional().describe("Optional field description"),
});

export type ToolNameInput = z.infer<typeof inputSchema>;

// 2. Define output data interface
export interface ToolNameData {
  field: string;
}

// 3. Implement async handler returning ToolResult<T>
export async function toolName(input: ToolNameInput): Promise<ToolResult<ToolNameData>> {
  try {
    const client = getClient();
    // ... implementation
    return successResult("Success message", { field: "value" });
  } catch (error) {
    const code = mapErrorCode(error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return errorResult("Failed to do X", code, errorMessage);
  }
}
```

### Result Envelope

All tools return `ToolResult<T>` from `src/types.ts`:

```typescript
interface ToolResult<T = unknown> {
  success: boolean;
  message: string;
  data?: T;           // Present on success
  error?: {           // Present on failure
    code: ErrorCode;
    message: string;
  };
}
```

Use helpers:
- `successResult(message, data?)` - Create success result
- `errorResult(message, code?, errorMessage?)` - Create error result
- `mapErrorCode(error)` - Map SDK errors to appropriate ErrorCode

### Error Codes

Defined in `src/types.ts`:
- `MODEL_NOT_FOUND` - Model doesn't exist
- `MODEL_NOT_LOADED` - Model not currently loaded
- `CONNECTION_FAILED` - Can't connect to LM Studio
- `INVALID_INPUT` - Invalid parameters
- `LOAD_FAILED` - Failed to load model
- `UNLOAD_FAILED` - Failed to unload model
- `UNKNOWN` - Catch-all for unexpected errors

### Client Pattern

The LM Studio client uses a singleton pattern in `src/client.ts`:
- `getClient()` - Get or create client instance
- `resetClient()` - Reset for testing/reconnection
- `testConnection()` - Health check returning detailed result

Configuration is read lazily from environment variables at runtime, not module load time.

### Adding a New Tool

1. Create `src/tools/new-tool.ts` following the pattern above
2. Export from `src/tools/index.ts`:
   ```typescript
   export { newTool } from "./new-tool.js";
   export { inputSchema as newToolInputSchema } from "./new-tool.js";
   export type { NewToolInput, NewToolData } from "./new-tool.js";
   ```
3. Register in `src/index.ts`:
   ```typescript
   server.tool("lmstudio_new_tool", "Description", newToolInputSchema.shape, async (params) => {
     return safeToolHandler(() => newTool(params as Parameters<typeof newTool>[0]));
   });
   ```
4. Add tests in `test/`

## Testing Patterns

Tests use Vitest with mocking for the LM Studio client:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock client module at top
vi.mock("../src/client.js", () => ({
  getClient: vi.fn(),
}));

import { getClient } from "../src/client.js";

describe("toolName", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns success with expected data", async () => {
    const mockClient = {
      llm: {
        someMethod: vi.fn().mockResolvedValue(mockData),
      },
    };
    vi.mocked(getClient).mockReturnValue(mockClient as never);

    const result = await toolName({ input: "value" });

    expect(result.success).toBe(true);
    expect(result.data).toEqual(expected);
  });

  it("returns error on failure", async () => {
    const mockClient = {
      llm: {
        someMethod: vi.fn().mockRejectedValue(new Error("ECONNREFUSED")),
      },
    };
    vi.mocked(getClient).mockReturnValue(mockClient as never);

    const result = await toolName({ input: "value" });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ErrorCode.CONNECTION_FAILED);
  });
});
```

## Module System

- ESM modules with `"type": "module"` in package.json
- Use `.js` extension in imports (e.g., `"./client.js"`) even for TypeScript files
- Target ES2022 with NodeNext module resolution

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `LMSTUDIO_BASE_URL` | - | Full WebSocket URL (overrides HOST/PORT) |
| `LMSTUDIO_HOST` | `127.0.0.1` | LM Studio host |
| `LMSTUDIO_PORT` | `1234` | LM Studio port |

## Dependencies

- `@lmstudio/sdk` - LM Studio client SDK
- `@modelcontextprotocol/sdk` - MCP server SDK
- `zod` - Schema validation for tool inputs

## Docker

Multi-stage Dockerfile:
- Build stage: Install deps, compile TypeScript
- Production stage: Production deps only, runs as non-root user `mcp`
- Default `LMSTUDIO_HOST=host.docker.internal` for host machine access

## Naming Conventions

- Tool files: kebab-case (`list-models.ts`)
- Tool names: snake_case with `lmstudio_` prefix (`lmstudio_list_models`)
- Exported schemas: `inputSchema` (renamed on re-export with tool name)
- Types: PascalCase (`LoadModelInput`, `LoadedModelData`)
- Functions: camelCase (`loadModel`, `getClient`)

## Important Notes

- All tool handlers are wrapped in `safeToolHandler()` to catch exceptions
- Input schemas use `.shape` when registering with MCP server
- The `act` tool supports an agentic loop where models can request tool calls
- MCP servers communicate via stdio - use `StdioServerTransport`
