# MCP Integration Architecture

Model Context Protocol (MCP) enables Altos to connect to external MCP servers and expose its own capabilities as an MCP server. This document covers the architecture of the MCP integration layer.

## Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Altos Agent                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐│
│  │ ToolRegistry │  │ Permission  │  │   MCP Client Manager   ││
│  │             │  │   Engine    │  │                         ││
│  │ mcp.github.│  │             │  │  ┌─────────────────────┐ ││
│  │ create_issue│◄─┤  ask-high   │  │  │  Stdio Transport    │ ││
│  │ mcp.postgres│  │  for writes │  │  │  ┌───────────────┐ │ ││
│  │ .query      │  │             │  │  │  │ MCP Server 1  │ │ ││
│  │ mcp.figma. │  │             │  │  │  └───────────────┘ │ ││
│  │ get_file   │  │             │  │  │  ┌───────────────┐ │ ││
│  └─────────────┘  └─────────────┘  │  │  │ MCP Server 2  │ │ ││
│                                     │  │  └───────────────┘ │ ││
│  ┌─────────────────────────────┐ │  └─────────────────────┘ ││
│  │   MCP Server (altos mcp    │ └───────────────────────────┘│
│  │   serve) - exposes read-   │                              │
│  │   only tools to MCP clients│                              │
│  └─────────────────────────────┘                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ JSON-RPC 2.0 over stdio or TCP
                              ▼
                    ┌─────────────────────┐
                    │   External MCP      │
                    │   Servers          │
                    │   (GitHub, Figma,  │
                    │   Postgres, etc.)  │
                    └─────────────────────┘
```

## MCP Client Manager

The `MCPClientManager` class (`@altos/mcp`) manages connections to external MCP servers and exposes their tools within the Altos tool registry.

### Configuration Loading

MCP server configurations are loaded from multiple sources in priority order (highest to lowest):

1. **Runtime-added servers** - Servers added via API during session
2. **Project config** - `<project>/.altos/mcp.json`
3. **Global config** - `~/.altos/mcp.json`
4. **Plugin contributions** - Servers registered by plugins via `api.registerMcpServer()`
5. **Package contributions** - Servers contributed by installed packages

Configurations are merged with later sources overriding earlier ones for conflicting keys. Server IDs must be unique across all sources.

### Tool Naming Convention

MCP tools are exposed in the ToolRegistry with a namespaced naming scheme to prevent collisions:

```
mcp.<server-id>.<tool-name>

Examples:
- mcp.github.create_issue
- mcp.github.list_issues
- mcp.postgres.query
- mcp.figma.get_file
- mcp.figma.get_comments
```

### Permission Enforcement

All MCP tools pass through the PermissionEngine before execution:

| Tool Category | Permission Required | Behavior |
|--------------|---------------------|----------|
| Read operations (list, get, search, query) | `read` | Auto-granted for autoGrant entries, otherwise prompt-low |
| Write operations (create, update, delete) | `ask-high` | Always prompt user with high-priority confirmation |
| Network operations (web search, API calls) | `network` | Prompt-low unless autoGrant specifies otherwise |

Write operations include any tool that modifies data: `create_*`, `update_*`, `delete_*`, `execute_*`, `run_*`. When a write operation is detected, the PermissionManager requests permission with `askHigh=true`:

```typescript
const permission = await permissionManager.requestPermission({
  tool: toolName,
  operation: "execute",
  riskLevel: "high",
  askHigh: true,  // Forces high-priority prompt
  reason: `MCP tool ${toolName} performs a write operation`
});
```

### Server Connection Lifecycle

```
┌──────────────────────────────────────────────────────────────┐
│                    Server Lifecycle                          │
├──────────────────────────────────────────────────────────────┤
│  1. LOAD    │ Load config from all sources                  │
│  2. VALIDATE│ Check command exists, verify permissions       │
│  3. CONNECT │ Start subprocess with stdio transport          │
│  4. HANDSAKE│ Initialize MCP connection, list tools         │
│  5. READY   │ Tools available in ToolRegistry               │
│  6. MONITOR │ Track connection health, auto-reconnect        │
│  7. DISCONNECT │ Clean shutdown on disable or error         │
└──────────────────────────────────────────────────────────────┘
```

Connection failures trigger automatic reconnection with exponential backoff (initial: 1s, max: 30s, jitter: ±500ms).

## MCP Server Mode (`altos mcp serve`)

When running `altos mcp serve`, Altos acts as an MCP server, exposing a subset of its capabilities to external MCP clients (such as Claude Desktop or other MCP-compatible tools).

### Transport Options

| Transport | Default | Flag | Use Case |
|-----------|---------|------|----------|
| `stdio` | Yes | `--transport=stdio` | Local processes, Claude Desktop integration |
| `TCP` | No | `--port=<port>` `--host=<host>` | Remote connections, server deployments |

TCP transport example:
```bash
altos mcp serve --transport=tcp --host=0.0.0.0 --port=3000
```

### Exposed Capabilities (Read-Only)

By default, only read-only tools are exposed:

| Tool | Description | Parameters |
|------|-------------|------------|
| `repo_map` | Get repository structure and file tree | `path?: string, depth?: number` |
| `session_status` | Get current session info | None |
| `search` | Search files by content | `query: string, path?: string` |
| `run_skill` | Run a registered skill | `skill: string, args?: Record<string, unknown>` |

### Dangerous Tool Filtering

The following tool patterns are blocked by default in server mode:

```
# Shell execution
bash, shell, exec, run_command

# File destruction
rm, rm_rf, delete_file, delete_dir, destroy

# System modification
chmod, chown, sudo, su, kill, pkill

# Network exfiltration
nc, netcat, telnet, ssh, scp (unless explicitly allowed)
```

Tools are filtered by name pattern matching before exposure. Custom allowlists can be specified in config.

### JSON-RPC 2.0 Protocol Implementation

Altos MCP server implements the JSON-RPC 2.0 specification:

**Request format:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "repo_map",
    "arguments": { "path": ".", "depth": 2 }
  }
}
```

**Response format:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"files\": [{\"name\": \"src\", \"type\": \"directory\"}]}"
      }
    ]
  }
}
```

**Error format:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32603,
    "message": "Internal error",
    "data": { "tool": "repo_map", "reason": "path outside workspace" }
  }
}
```

## Configuration

### Config File Locations

| Location | Scope | Merge Priority |
|----------|-------|----------------|
| `~/.altos/mcp.json` | Global (user-level) | Lowest |
| `<project>/.altos/mcp.json` | Project-specific | Higher |
| Runtime API additions | Session-only | Highest |

### Config Format

The configuration uses an array-based format following the MCP standard:

```json
{
  "$schema": "https://docs.altos.dev/mcp-config-schema",
  "servers": [
    {
      "id": "github",
      "name": "GitHub",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "enabled": true,
      "dangerous": false,
      "env": {
        "GITHUB_TOKEN": "$GITHUB_TOKEN"
      },
      "autoGrant": [
        { "tool": "list_issues", "permission": "read", "reason": "Read-only listing" }
      ]
    }
  ]
}
```

### Config Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | Yes | Unique identifier (alphanumeric, hyphens) |
| `name` | `string` | Yes | Display name |
| `command` | `string` | Yes | Executable path (npx, node, docker, etc.) |
| `args` | `string[]` | Yes | Command arguments |
| `enabled` | `boolean` | No | Default: `true` |
| `dangerous` | `boolean` | No | Default: `false` - warns before adding |
| `env` | `object` | No | Environment variables (see Credential Sourcing) |
| `autoGrant` | `Grant[]` | No | Auto-granted permissions |
| `allowedTools` | `string[]` | No | Explicit tool allowlist |
| `blockedTools` | `string[]` | No | Tool blocklist (server mode only) |

### Credential Sourcing

Credentials are sourced **only from environment variables**, never hardcoded in config files:

```json
{
  "env": {
    "DATABASE_URL": "$DATABASE_URL",
    "API_KEY": "$API_KEY",
    "GITHUB_TOKEN": "$GITHUB_TOKEN"
  }
}
```

The `$PREFIX` syntax references environment variables. If a referenced variable is not set, the server logs a warning but continues startup.

Credentials are never written to config files. Use `export` or `.env` files to manage credentials.

### Plugin MCP Contributions

Plugins can register MCP servers via the plugin API:

```typescript
// In plugin's registerMcpServer() call
api.registerMcpServer({
  id: 'my-plugin-db',
  name: 'My Plugin Database',
  command: 'npx',
  args: ['-y', '@myorg/mcp-plugin-db', '--connection-string', process.env.MY_DB_CONN!],
  env: {
    // Note: credentials come from env vars, not hardcoded
    MY_DB_CONN: process.env.MY_DB_CONN
  }
});
```

## Security

### MCP External Writes Always Require ask-high

Any MCP tool that performs a write operation automatically triggers high-priority permission prompting:

```
Flow:
1. Agent requests mcp.github.create_issue
2. MCPClientManager identifies write operation (create_* prefix)
3. PermissionEngine.evaluate() called with askHigh=true
4. User sees high-priority confirmation dialog
5. On approval, tool executes via MCP transport
6. Result returned to agent
```

This enforcement is automatic and cannot be bypassed by config.

### Dangerous Server Confirmation Flow

Servers marked `dangerous: true` require explicit user confirmation before being added:

```
1. User runs: altos mcp add --config=dangerous-server.json
2. System detects dangerous: true flag
3. Confirmation prompt:
   "This server is marked as dangerous. It can execute arbitrary code
    and access your filesystem. Are you sure you want to add it?
    Server: my-remote-exec
    Command: npx -y @myorg/malicious-server"
4. User must explicitly approve
5. Server is added only after explicit confirmation
```

### Credential Storage

| Credential Type | Storage Location | Permissions |
|-----------------|------------------|-------------|
| API keys | Environment variables | N/A |
| Tokens | Environment variables | N/A |
| Connection strings | Environment variables | N/A |
| Config files | `~/.altos/mcp-credentials.json` (if needed) | `0o600` (owner read/write only) |

### Tool Filtering in Server Mode

Tools exposed by `altos mcp serve` are filtered before being sent to clients:

1. **Blocked patterns** - Tools matching destructive/dangerous patterns are removed
2. **Write operations** - No write-capable tools are exposed (read-only by design)
3. **Custom allowlists** - If `allowedTools` is specified, only those tools are exposed

## Commands

### `altos mcp list`

List all configured MCP servers and their connection status.

```
$ altos mcp list

MCP Servers:
┌─────────────┬────────────┬──────────┬─────────────────────────┐
│ ID          │ Name       │ Status   │ Tools                   │
├─────────────┼────────────┼──────────┼─────────────────────────┤
│ github      │ GitHub     │ Connected │ 12 tools               │
│ postgres    │ PostgreSQL │ Disabled  │ 3 tools (not enabled)  │
│ filesystem  │ Filesystem │ Connected │ 5 tools                │
└─────────────┴────────────┴──────────┴─────────────────────────┘
```

### `altos mcp add <config-file>`

Add an MCP server from a config file. Prompts for confirmation if server is marked `dangerous: true`.

```bash
altos mcp add --config=~/my-servers.json
altos mcp add --config=~/my-servers.json --server-id=github  # Add specific server
```

### `altos mcp remove <server-id>`

Remove an MCP server from the active configuration.

```bash
altos mcp remove github
altos mcp remove github --global  # Also remove from global config
```

### `altos mcp inspect <server-id>`

Show detailed information about a specific server including available tools, permissions, and configuration.

```bash
$ altos mcp inspect github

Server: github
Name: GitHub
Command: npx -y @modelcontextprotocol/server-github
Status: Connected
Enabled: true

Available Tools:
- mcp.github.create_issue      (write) - Creates a new issue
- mcp.github.list_issues      (read)  - Lists repository issues
- mcp.github.get_issue        (read)  - Gets issue details
- mcp.github.search_code      (read)  - Searches code
- ...

Auto-granted Permissions:
- list_issues: read
- get_issue: read
- search_code: read

Required Environment Variables:
- GITHUB_TOKEN: (set)
```

### `altos mcp tools`

List all tools available from all connected MCP servers.

```bash
$ altos mcp tools

mcp.github.create_issue  (write) - Create a new GitHub issue
mcp.github.list_issues   (read)  - List repository issues
mcp.github.get_issue     (read)  - Get issue details
mcp.postgres.query       (read)  - Execute a read-only query
mcp.filesystem.read_file (read)  - Read a file
...
```

### `altos mcp serve`

Start Altos as an MCP server.

```bash
altos mcp serve                        # stdio transport (default)
altos mcp serve --transport=stdio     # Explicit stdio
altos mcp serve --transport=tcp --port=3000 --host=0.0.0.0  # TCP transport
altos mcp serve --allowed-tools=repo_map,session_status,search  # Restrict tools
```

## Type References

### MCPServerConfig

```typescript
interface MCPServerConfig {
  /** Unique identifier for the server */
  id: string;

  /** Human-readable display name */
  name: string;

  /** Executable command (npx, node, docker, etc.) */
  command: string;

  /** Command arguments */
  args: string[];

  /** Enable/disable the server */
  enabled?: boolean;

  /** Mark as dangerous, requiring explicit confirmation */
  dangerous?: boolean;

  /** Environment variables (values reference env vars with $ prefix) */
  env?: Record<string, string>;

  /** Auto-granted permissions */
  autoGrant?: MCPGrant[];

  /** Explicit tool allowlist (server mode) */
  allowedTools?: string[];

  /** Tool blocklist (server mode) */
  blockedTools?: string[];
}

interface MCPGrant {
  /** Tool name pattern or specific name */
  tool: string;
  /** Permission type */
  permission: 'read' | 'write' | 'network' | 'execute';
  /** Human-readable justification */
  reason?: string;
}
```

### MCPConnectedServer

```typescript
interface MCPConnectedServer {
  /** Server configuration */
  config: MCPServerConfig;

  /** Current connection state */
  status: 'connecting' | 'connected' | 'disconnected' | 'error';

  /** Available tools from this server */
  tools: MCPToolDefinition[];

  /** Error message if status is 'error' */
  error?: string;

  /** Connection timestamp */
  connectedAt?: Date;

  /** Process handle for stdio transport */
  process?: ChildProcess;
}
```

### MCPToolWrapper

```typescript
interface MCPToolWrapper {
  /** Full tool name including namespace: mcp.<server>.<tool> */
  fullName: string;

  /** Original tool name from MCP server */
  originalName: string;

  /** Server ID this tool belongs to */
  serverId: string;

  /** Tool definition for ToolRegistry */
  definition: ToolDefinition;

  /** Whether this tool performs write operations */
  isWriteOperation: boolean;

  /** Execute the tool via MCP transport */
  execute(params: Record<string, unknown>, context: ToolContext): Promise<ToolResult>;
}
```

### MCPTransport

```typescript
interface MCPTransport {
  /** Transport type */
  type: 'stdio' | 'tcp';

  /** Send a JSON-RPC request */
  request(method: string, params?: unknown): Promise<unknown>;

  /** Send a JSON-RPC notification (no response expected) */
  notify(method: string, params?: unknown): void;

  /** Close the transport */
  close(): Promise<void>;

  /** Connection status */
  connected: boolean;
}
```
