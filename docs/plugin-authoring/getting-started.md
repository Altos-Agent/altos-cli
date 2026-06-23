# Plugin Authoring Guide

Altos plugins are self-contained packages that extend the runtime with tools, commands, hooks, memory providers, model providers, MCP bridges, and skills.

## Quick Start

```bash
# Scaffold a new plugin
altos create plugin my-plugin

# Navigate to it
cd my-plugin

# Install and build
pnpm install && pnpm build

# Install globally for testing
cp -r . ~/.altos/plugins/my-plugin

# Reload
altos plugin list
```

## Plugin Manifest

Every plugin needs a `plugin.json` (or `package.json` with an `altosPlugin` field):

```json
{
  "name": "my-plugin",
  "version": "0.1.0",
  "description": "What my plugin does",
  "entry": "dist/index.js",
  "permissions": [
    { "scope": "hook:before_tool_call", "reason": "Validate all tool calls" }
  ],
  "tools": [],
  "commands": [{ "name": "hello", "description": "Say hello", "handler": "index.onHello" }],
  "hooks": [{ "event": "session_start", "handler": "index.onSessionStart" }]
}
```

Or via `package.json`:

```json
{
  "name": "@altos/plugin-my-plugin",
  "altosPlugin": {
    "entry": "dist/index.js",
    "permissions": [],
    "hooks": []
  }
}
```

## The Plugin API

The `init(api)` function receives the `PluginAPI`:

```typescript
import type { PluginAPI } from "@altos/plugins";

export const plugin = {
  name: "my-plugin",
  version: "0.1.0",

  async init(api: PluginAPI) {
    // api.registerTool(...)
    // api.registerCommand(...)
    // api.registerHook(...)
    // api.registerMemoryProvider(...)
    // api.registerModelProvider(...)
    // api.registerMcpServer(...)
    // api.registerSkill(...)
    // api.readConfig(key)
    // api.writeConfig(key, value)
    // api.hasPermission(scope)
    // api.logger.info(...)
  },

  async dispose() {
    // Clean up
  },
};
```

### `api.registerTool(tool)`

Register a tool with the runtime:

```typescript
api.registerTool({
  name: "my-plugin/greet",
  description: "Greet someone by name",
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Name to greet" },
    },
    required: ["name"],
  },
  async handler(args, ctx) {
    const { name } = args;
    return {
      success: true,
      data: { message: `Hello, ${name}!` },
      duration: 0,
    };
  },
});
```

### `api.registerCommand(spec)`

Register a slash command available in the REPL:

```typescript
api.registerCommand({
  name: "greet",
  description: "Greet someone",
});
```

The handler is referenced by `handler` path and called when the user types `/greet`.

### `api.registerHook(hook)`

Register a lifecycle hook:

```typescript
api.registerHook({
  name: "log-tools",        // Unique name within plugin
  event: "before_tool_call", // Hook event type
  priority: 100,            // Lower = earlier (default: 100)
  handler: async (ctx) => {
    // ctx.event        — the event name
    // ctx.sessionId    — current session
    // ctx.data         — event payload
    // ctx.stopPropagation — set true to stop chain
    // ctx.result       — override return value

    api.logger.debug("Tool call:", ctx.data);
  },
});
```

## Hook Events

All hooks receive `HookContext` and are fire-and-forget — errors do not crash the runtime.

| Event | Payload | When |
|-------|---------|------|
| `session_start` | `{ sessionId, cwd, model?, provider? }` | New session begins |
| `user_prompt` | `{ sessionId, prompt }` | User sends a message |
| `before_model_call` | `{ sessionId, messages, modelConfig }` | Before model API call |
| `after_model_call` | `{ sessionId, response, duration }` | After model returns |
| `before_tool_call` | `{ sessionId, toolName, arguments }` | Before tool executes |
| `after_tool_call` | `{ sessionId, toolName, arguments, result }` | After tool completes |
| `before_file_write` | `{ sessionId, filePath, content }` | Before file is written |
| `after_file_write` | `{ sessionId, filePath, bytesWritten }` | After file is written |
| `before_compact` | `{ sessionId, eventCount }` | Before session compaction |
| `session_end` | `{ sessionId, reason?, totalEvents, duration }` | Session completes |

### Hook Priority

Hooks run in priority order (lower first). Default priority is `100`. Use lower values (e.g. `10`) to run before other handlers, higher values (e.g. `1000`) to run after.

### Stopping Propagation

In `before_*` hooks, set `ctx.stopPropagation = true` to prevent subsequent handlers and/or the main action from running. You can also set `ctx.result` to override the return value.

```typescript
api.registerHook({
  name: "block-dangerous",
  event: "before_tool_call",
  handler: async (ctx) => {
    if (ctx.data.toolName === "delete_all_files") {
      ctx.stopPropagation = true;
      ctx.result = {
        success: false,
        error: "Blocked by my-plugin security policy",
      };
    }
  },
});
```

## Permissions

Plugins declare required permissions in `plugin.json`. The system validates them at load time.

| Scope | Description | Default |
|-------|-------------|---------|
| `fs:read` | Read files | Auto |
| `fs:write` | Write files | Auto |
| `fs:exec` | Execute files | **Denied** — requires explicit grant |
| `net:connect` | Open network connections | Auto |
| `config:read` | Read plugin config | Auto |
| `config:write` | Write plugin config | Auto |
| `memory:read` | Read memory | Auto |
| `memory:write` | Write memory | Auto |
| `memory:search` | Search memory | Auto |
| `hook:*` | Any hook event | **Denied** |
| `tool:register` | Register tools | **Denied** |
| `model:*` | Model provider ops | **Denied** |
| `mcp:*` | MCP server ops | **Denied** |
| `skill:*` | Skill registration | **Denied** |

### Granting Permissions

```bash
# Grant specific scopes
altos plugin grant my-plugin "hook:before_tool_call" "hook:after_tool_call"

# Deny specific scopes
altos plugin deny my-plugin "fs:exec"

# Revoke all grants
altos plugin revoke my-plugin

# Inspect current state
altos plugin inspect my-plugin
```

## Persistent Config

Plugins can store persistent key-value data:

```typescript
// Read
const count = (api.readConfig("visit_count") as number) ?? 0;

// Write
api.writeConfig("visit_count", count + 1);

// Delete
api.deleteConfig("visit_count");
```

Data is stored at `~/.altos/plugin-configs/<plugin-name>.json`.

## Logging

Use the plugin logger — output is prefixed and goes to the standard log system:

```typescript
api.logger.debug("Detailed debug info");
api.logger.info("Plugin initialized");
api.logger.warn("Something unexpected");
api.logger.error("Something went wrong:", err);
```

## Example: A Minimal Plugin

**plugin.json:**
```json
{
  "name": "hello-world",
  "version": "0.1.0",
  "description": "Minimal example plugin",
  "entry": "dist/index.js",
  "permissions": []
}
```

**src/index.ts:**
```typescript
import type { PluginAPI } from "@altos/plugins";

export const plugin = {
  name: "hello-world",
  version: "0.1.0",

  async init(api: PluginAPI) {
    api.logger.info("hello-world initializing");

    api.registerCommand({
      name: "hello",
      description: "Print a greeting",
    });

    api.registerHook({
      name: "announce",
      event: "session_start",
      handler: async (ctx) => {
        api.logger.info("Session started:", ctx.sessionId);
      },
    });
  },

  async dispose() {},
};
```

## Installing Your Plugin

```bash
# Local (project-specific)
cp -r . /path/to/project/.altos/plugins/hello-world

# Global
cp -r . ~/.altos/plugins/hello-world

# Load (Altos auto-discovers on startup)
altos plugin list
```

## Debugging

```bash
# Inspect a plugin's manifest and permissions
altos plugin inspect my-plugin

# See verbose loading output
ALTOS_LOG_LEVEL=debug altos plugin list

# Check permission grants
cat ~/.altos/plugin-permissions.json
```

## Publishing

```json
// package.json
{
  "name": "@altos/plugin-my-plugin",
  "exports": {
    ".": "./dist/index.js",
    "./plugin": "./plugin.json"
  },
  "altosPlugin": {
    "entry": "dist/index.js",
    "permissions": [],
    "hooks": []
  }
}
```

```bash
pnpm build
npm publish --access public
```

Users install with `npm install @altos/plugin-my-plugin` — it will be auto-discovered in `node_modules`.
