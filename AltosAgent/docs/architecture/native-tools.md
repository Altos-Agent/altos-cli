# Native Tools Architecture

## Overview

The `@altos/tools` package provides the native tool registry and built-in tools for the Altos agent runtime. Tools are schema-based, permission-aware, observable, and safe by default.

## Core Types

### ToolDefinition

Every tool implements the `ToolDefinition` interface:

```typescript
interface ToolDefinition {
  name: string;                    // Unique identifier
  description: string;              // Human-readable description
  inputSchema: ToolInputSchema;     // JSON Schema for parameters
  outputSchema: ToolOutputSchema;  // JSON Schema for output
  riskLevel: RiskLevel;            // low | medium | high | critical
  requiredPermissions: ToolPermission[];
  execute(params, context): Promise<ToolResult>;
}
```

### Risk Levels

| Level | Description | Example Tools |
|-------|-------------|---------------|
| `low` | Read-only, no side effects | `read_file`, `grep`, `git_status` |
| `medium` | May have minor side effects | `list_dir` |
| `high` | Write operations | `write_file`, `edit_file` |
| `critical` | Execute arbitrary code | `bash` |

### Permissions

Tools declare required permissions:

```typescript
interface ToolPermission {
  type: "read" | "write" | "execute" | "network";
  path?: string;       // Optional path glob
  pattern?: string;    // Optional pattern match
  reason?: string;    // Human-readable justification
}
```

## Tool Registry

The `ToolRegistry` manages tool registration and workspace boundaries:

```typescript
const registry = new ToolRegistry();
registry.setWorkspaceRoots(["/home/user/project"]);
registry.registerTool(createReadFileTool(workspaceRoots));
registry.registerTool(createWriteFileTool(workspaceRoots));
```

### Key Methods

- `registerTool(tool)` — Register a tool (throws if duplicate)
- `unregisterTool(name)` — Remove a tool
- `getTool(name)` — Get a tool by name
- `listTools()` — List all registered tools
- `listToolsByRisk(level)` — Filter by risk level
- `listToolsByPermission(type)` — Filter by permission type
- `setWorkspaceRoots(roots)` — Set allowed workspace boundaries

## Built-in Tools

### File System Tools

| Tool | Description | Risk |
|------|-------------|------|
| `read_file` | Read file contents with offset/limit | LOW |
| `write_file` | Write or append to files | HIGH |
| `edit_file` | Find and replace text in files | HIGH |
| `apply_patch` | Apply unified diff patches | HIGH |
| `list_dir` | List directory contents | LOW |

### Git Tools

| Tool | Description | Risk |
|------|-------------|------|
| `git_status` | Show working tree status | LOW |
| `git_diff` | Show changes between commits | LOW |
| `git_log` | Show commit history | LOW |

### Search Tools

| Tool | Description | Risk |
|------|-------------|------|
| `grep` | Search file contents with regex | LOW |
| `find_files` | Find files by glob pattern | LOW |

### Shell Tools

| Tool | Description | Risk |
|------|-------------|------|
| `bash` | Execute bash commands | CRITICAL |

## Security Model

### Workspace Boundaries

All file operations are validated against configured workspace roots. Paths outside the workspace are denied by default.

### Protected Paths

The following paths are never accessible:

- `~/.ssh/` — SSH keys and config
- `~/.env`, `.env*` — Environment files
- `/etc/sudoers`, `/etc/passwd` — System config
- `/System`, `/Library` (macOS) — OS internals
- `~/.aws/`, `~/.kube/` — Cloud credentials
- `~/.gnupg/`, `~/.npm/_auth/` — Auth stores
- Any path matching `*.sock`, `*.socket`

### Secret Masking

Output from all tools is scanned for common secret patterns:

- API keys (`sk-...`, `ghp_...`, AWS keys)
- Bearer tokens
- Private keys
- JWT tokens
- Slack/Discord tokens
- Stripe keys

### Dangerous Command Prevention

The `bash` tool blocks dangerous commands by default:

```
rm, rmdir, del, chmod, chown, sudo, su, kill, pkill,
dd, fdisk, mkfs, wget, curl, docker, kubectl,
ssh, scp, nc, netcat, telnet, etc.
```

These require `allow_dangerous: true` to execute.

## Output Handling

### Truncation

Large outputs are automatically truncated at 1MB (configurable):

- Threshold: 100KB triggers truncation check
- Max: 1MB hard limit
- Format: Truncated output ends with `\n... [output truncated]`

### Structured Summaries

Tools return a `summary` field for display:

```
"Read 1024 bytes from index.ts"
"Made 3 replacements in config.json"
"Found 42 matches in 5 files"
```

## Events

Tools can emit events during execution:

```typescript
type ToolEvent =
  | { type: "tool_executing"; tool: string; params: Record<string, unknown> }
  | { type: "tool_completed"; tool: string; duration: number; outputSize: number }
  | { type: "tool_failed"; tool: string; error: string; duration: number }
  | { type: "tool_truncated"; tool: string; originalSize: number; truncatedSize: number };
```

## CLI Integration

```bash
# List all tools
altos tools

# Show detailed tool info
altos tools --show read_file

# JSON output
altos tools --json
altos tools --show bash --json
```

## Adding Custom Tools

```typescript
import { createBashTool, ToolDefinition } from "@altos/tools";

const myTool: ToolDefinition = {
  name: "my_tool",
  description: "Does something useful",
  inputSchema: {
    type: "object",
    properties: {
      param: { type: "string", description: "A parameter" }
    },
    required: ["param"]
  },
  outputSchema: {
    type: "object",
    properties: {
      result: { type: "string" }
    }
  },
  riskLevel: "medium",
  requiredPermissions: [{ type: "read" }],
  async execute(params, context) {
    return {
      success: true,
      data: { result: "processed: " + params.param },
      duration: Date.now() - startTime
    };
  }
};

registry.registerTool(myTool);
```
