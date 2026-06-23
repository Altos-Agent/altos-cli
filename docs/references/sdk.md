# SDK Reference

The `@altos/sdk` package provides TypeScript interfaces and utilities for building Altos extensions and integrations.

## Installation

```bash
pnpm add @altos/sdk
```

## SDKClient

The `SDKClient` interface represents a connection to an Altos agent session from an external process or plugin.

```typescript
export interface SDKClient {
  agent: {
    send(message: string): Promise<void>;
    onMessage(handler: (msg: string) => void): void;
  };
  tools: {
    register(tool: unknown): void;
    call(name: string, args: Record<string, unknown>): Promise<unknown>;
  };
  config: {
    get<T>(key: string, fallback: T): T;
    set(key: string, value: unknown): void;
  };
}
```

### agent

- `send(message)` — Send a message to the agent
- `onMessage(handler)` — Register a handler for incoming agent messages

### tools

- `register(tool)` — Register a tool with the agent
- `call(name, args)` — Call a registered tool by name with arguments

### config

- `get(key, fallback)` — Get a configuration value
- `set(key, value)` — Set a configuration value

## SDKServer

The `SDKServer` interface represents a server that receives and responds to agent messages.

```typescript
export interface SDKServer {
  onAgentMessage(handler: (msg: string) => Promise<string>): void;
  sendToolResult(callId: string, result: unknown): void;
  start(): Promise<void>;
}
```

### Methods

- `onAgentMessage(handler)` — Register a handler that processes agent messages and returns responses
- `sendToolResult(callId, result)` — Send the result of a tool call back to the agent
- `start()` — Start the server

## createClient

Creates an SDK client instance.

```typescript
function createClient(config: { apiKey?: string; endpoint?: string }): SDKClient
```

### Example

```typescript
import { createClient } from "@altos/sdk";

const client = createClient({
  apiKey: process.env.ALTOS_API_KEY,
  endpoint: "http://localhost:3001",
});

// Send a message to the agent
await client.agent.send("Analyze the codebase");

// Handle responses
client.agent.onMessage((msg) => {
  console.log("Agent:", msg);
});

// Register a custom tool
client.tools.register({
  name: "my-tool",
  description: "Does something useful",
  execute: async (args) => {
    return { result: "done" };
  },
});
```

## Type Aliases

```typescript
export type SDKClient = SDKClient;
export type SDKServer = SDKServer;
```

## Notes

- The SDK is currently minimal and serves as a foundation for future extension.
- The `createClient` function currently returns stub implementations — full network connectivity is planned.
- For plugin authoring, see the [Plugin Authoring](../plugin-authoring/overview.md) guide.
