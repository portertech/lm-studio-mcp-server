# LM Studio MCP Server

An MCP (Model Context Protocol) server that provides AI assistants with control over LM Studio models. This server enables remote model management including listing, loading, and unloading models through the LM Studio API.

## Features

- **Health Check**: Verify connectivity to LM Studio
- **List Downloaded Models**: View all LLM models available in your LM Studio library
- **List Loaded Models**: See which models are currently loaded in memory
- **Load Models**: Load models into memory with configurable parameters
- **Unload Models**: Remove specific model instances from memory
- **Get Model Info**: Retrieve detailed information about loaded models
- **Agentic Tasks**: Run tasks with local models that can request tool calls
- **Session Management**: Server-side conversation state for reduced token usage

## Prerequisites

- Node.js 18.0.0 or higher
- LM Studio running with the local server enabled

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd lm-studio-mcp-server

# Install dependencies
npm install
```

## Configuration

The server connects to LM Studio using environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `LMSTUDIO_BASE_URL` | `ws://127.0.0.1:1234` | Full WebSocket URL for LM Studio |
| `LMSTUDIO_HOST` | `127.0.0.1` | LM Studio host (used if BASE_URL not set) |
| `LMSTUDIO_PORT` | `1234` | LM Studio port (used if BASE_URL not set) |

## Usage

### Running Modes

**Development** (uses `tsx` for TypeScript execution):
```bash
npm start
# or with file watching
npm run dev
```

**Production** (uses compiled JavaScript):
```bash
npm run build
npm run start:prod
```

**Docker**:
```bash
# Build the image
docker build -t lm-studio-mcp-server .

# Run (connects to LM Studio on host machine)
docker run -i --rm lm-studio-mcp-server

# Run with custom LM Studio host
docker run -i --rm \
  -e LMSTUDIO_HOST=192.168.1.100 \
  -e LMSTUDIO_PORT=1234 \
  lm-studio-mcp-server
```

### MCP Client Configuration

#### Claude Desktop

Add to your `claude_desktop_config.json`:

**Using npx (recommended for installed packages):**
```json
{
  "mcpServers": {
    "lmstudio": {
      "command": "npx",
      "args": ["lm-studio-mcp-server"],
      "env": {
        "LMSTUDIO_HOST": "127.0.0.1",
        "LMSTUDIO_PORT": "1234"
      }
    }
  }
}
```

**Using local development:**
```json
{
  "mcpServers": {
    "lmstudio": {
      "command": "npx",
      "args": ["tsx", "/path/to/lm-studio-mcp-server/src/index.ts"],
      "env": {
        "LMSTUDIO_HOST": "127.0.0.1",
        "LMSTUDIO_PORT": "1234"
      }
    }
  }
}
```

**Using production build:**
```json
{
  "mcpServers": {
    "lmstudio": {
      "command": "node",
      "args": ["/path/to/lm-studio-mcp-server/dist/index.js"],
      "env": {
        "LMSTUDIO_HOST": "127.0.0.1",
        "LMSTUDIO_PORT": "1234"
      }
    }
  }
}
```

**Using Docker:**
```json
{
  "mcpServers": {
    "lmstudio": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm",
        "-e", "LMSTUDIO_HOST=127.0.0.1",
        "-e", "LMSTUDIO_PORT=1234",
        "lm-studio-mcp-server"
      ]
    }
  }
}
```

> **Note:** For Docker on macOS/Windows connecting to LM Studio on the host machine, use `LMSTUDIO_HOST=host.docker.internal`.

## Available Tools

All tools return a consistent response envelope:
```typescript
{
  success: boolean;
  message: string;
  data?: T;           // Present on success
  error?: {           // Present on failure
    code: string;
    message: string;
  };
}
```

### Error Codes

| Code | Description |
|------|-------------|
| `MODEL_NOT_FOUND` | Requested model does not exist |
| `MODEL_NOT_LOADED` | Model is not currently loaded |
| `CONNECTION_FAILED` | Cannot connect to LM Studio |
| `INVALID_INPUT` | Invalid parameters provided |
| `LOAD_FAILED` | Failed to load model |
| `UNLOAD_FAILED` | Failed to unload model |
| `UNKNOWN` | Unexpected error |

### `lmstudio_health_check`

Check connectivity to LM Studio server.

**Parameters**: None

**Returns**: Connection status and base URL

### `lmstudio_list_models`

List all downloaded LLM models available in LM Studio.

**Parameters**: None

**Returns**: Array of model info objects with:
- `modelKey`: Model identifier for loading
- `path`: Relative path to the model
- `displayName`: Human-readable model name
- `sizeBytes`: Size in bytes
- `architecture`: Model architecture (if available)
- `quantization`: Quantization type (if available)

### `lmstudio_list_loaded_models`

List all currently loaded models in memory.

**Parameters**: None

**Returns**: Array of loaded model info with:
- `identifier`: Instance identifier
- `modelKey`: Model key
- `path`: Model path
- `displayName`: Human-readable name
- `sizeBytes`: Size in bytes
- `vision`: Whether model supports vision
- `trainedForToolUse`: Whether model was trained for tool use

### `lmstudio_load_model`

Load a model into memory.

**Parameters**:
- `model` (required): Model key to load (e.g., `llama-3.2-3b-instruct`)
- `identifier` (optional): Custom identifier for the loaded instance
- `contextLength` (optional): Context window size in tokens (minimum: 1)
- `evalBatchSize` (optional): Batch size for token processing (minimum: 1)

**Returns**: Success status with loaded model details (identifier, modelKey, path)

### `lmstudio_unload_model`

Unload a model from memory.

**Parameters**:
- `identifier` (required): Identifier of the loaded model to unload

**Returns**: Success status

### `lmstudio_get_model_info`

Get detailed information about a loaded model.

**Parameters**:
- `identifier` (required): Identifier of the loaded model

**Returns**: Model details including identifier, modelKey, path, displayName, sizeBytes, contextLength

### `lmstudio_act`

Run an agentic task with a local LM Studio model. Supports tool use via a request/response pattern where the local model can request tool calls that are returned to the caller for execution.

Uses server-side session management to store conversation history, reducing token usage for the parent model by ~80-90% on multi-turn tasks.

**Parameters**:
- `sessionId` (optional): Resume an existing session (omit to start new)
- `identifier` (required for new sessions): The loaded model identifier to use
- `task` (required for new sessions): The task or prompt for the model
- `tools` (optional): Array of tool schemas available for the model to call
- `toolResults` (optional): Results from previously requested tool calls
- `maxTokens` (optional): Maximum tokens to generate (default: 2048)

**Tool Schema Format**:
```typescript
{
  name: string;
  description?: string;
  parameters?: Record<string, any>;
}
```

**Returns**:
```typescript
{
  sessionId: string;       // Session ID for continuation
  done: boolean;           // true if task complete, false if tool calls needed
  response?: string;       // Final response (when done=true)
  toolCalls?: Array<{      // Requested tool calls (when done=false)
    name: string;
    arguments?: Record<string, any>;
  }>;
}
```

**Example Flow**:
```
# Start new session
Parent → lmstudio_act(identifier: "model", task: "What files are in /tmp?", tools: [...])
       ← {sessionId: "abc-123", done: false, toolCalls: [{name: "read_dir", arguments: {path: "/tmp"}}]}

# Continue with tool results (only send sessionId, not full history)
Parent → lmstudio_act(sessionId: "abc-123", toolResults: [{name: "read_dir", result: "file1.txt, file2.txt"}])
       ← {sessionId: "abc-123", done: true, response: "The /tmp directory contains: file1.txt and file2.txt"}
```

### `lmstudio_get_session`

Get information about an active agentic session.

**Parameters**:
- `sessionId` (required): The session ID to get information about

**Returns**:
```typescript
{
  sessionId: string;
  modelId: string;
  messageCount: number;
  toolCount: number;
  createdAt: number;       // Unix timestamp
  lastAccessedAt: number;  // Unix timestamp
  ttlRemainingMs: number;  // Milliseconds until session expires
}
```

### `lmstudio_end_session`

End an active agentic session and free its resources. Sessions automatically expire after 30 minutes of inactivity, but this allows explicit cleanup.

**Parameters**:
- `sessionId` (required): The session ID to end

**Returns**:
```typescript
{
  sessionId: string;
  ended: boolean;
}
```

## Development

```bash
# Build the project
npm run build

# Run in development mode with auto-reload
npm run dev

# Run tests
npm test

# Type check without emitting
npm run typecheck
```

### Project Structure

```
src/
├── index.ts              # MCP server entry point
├── client.ts             # LM Studio client wrapper
├── sessions.ts           # Server-side session management
├── types.ts              # Shared types and result helpers
└── tools/
    ├── index.ts          # Tool exports
    ├── health-check.ts   # Health check tool
    ├── list-models.ts    # List downloaded models
    ├── list-loaded-models.ts
    ├── load-model.ts
    ├── unload-model.ts
    ├── get-model-info.ts
    ├── act.ts            # Agentic task execution
    ├── get-session.ts    # Session introspection
    └── end-session.ts    # Session cleanup
```

### Architecture

- **Consistent Results**: All tools return the same `ToolResult<T>` envelope
- **Safe Wrappers**: Tool handlers are wrapped to catch exceptions and return error payloads
- **Lazy Config**: Environment variables are read at runtime, not module load
- **Singleton Client**: Single LM Studio client instance is reused
- **Session Management**: Server-side conversation state with automatic TTL cleanup

## License

ISC
