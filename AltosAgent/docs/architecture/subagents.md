# Subagent Architecture

## Overview

Altos supports specialized subagents with separate context, tools, permissions, memory scope, and model configuration. Subagents enable parallel task execution, specialized analysis, and controlled code editing.

## Core Concepts

### SubAgentDefinition

Each subagent type is defined by a `SubAgentDefinition`:

```typescript
interface SubAgentDefinition {
  name: string;                    // Unique identifier (e.g., "explorer", "planner")
  description: string;             // Human-readable description
  system_prompt: string;           // Instructions for the subagent
  allowed_tools: string[];         // Whitelist of permitted tools
  permission_profile: PermissionProfile;
  memory_scope: MemoryScope;
  model_preference?: ModelPreference;
  read_only?: boolean;             // Enforce read-only mode
}
```

### PermissionProfile

Controls what operations a subagent can perform:

```typescript
interface PermissionProfile {
  read: boolean;
  write: boolean;
  execute: boolean;
  network: boolean;
  tools: string[];                 // Specific tool whitelist
  paths?: string[];                // Allowed path patterns
}
```

### MemoryScope

Determines what memory context a subagent can access:

- `none` - No memory access
- `session` - Current session only
- `workspace` - Current workspace/project
- `global` - All memory (admin only)

## SubAgentManager

The `SubAgentManager` class manages the subagent lifecycle:

```typescript
class SubAgentManager {
  register(definition: SubAgentDefinition): void;
  spawn(name: string, options: SpawnOptions): Promise<SubAgentInstance>;
  getInstance(id: string): SubAgentInstance | undefined;
  terminate(id: string): boolean;
  canUseTool(instanceId: string, toolName: string): boolean;
  filterTools<T extends { name: string }>(instanceId: string, tools: T[]): T[];
  collectResults(): SubAgentResult[];
  cleanup(olderThanMs?: number): number;
}
```

## Built-in Subagents

Altos ships with 8 built-in subagents:

| Name | Description | Mode | Tools |
|------|-------------|------|-------|
| `explorer` | Explore and analyze codebase structure | READ-ONLY | Read, Glob, Grep, LSP, codegraph_*, WebSearch, WebFetch |
| `planner` | Analyze requirements and create implementation plans | READ-ONLY | Read, Glob, Grep, LSP, codegraph_*, WebSearch, WebFetch |
| `implementer` | Implement features, refactor code | READ-WRITE | Read, Write, Edit, Glob, Grep, LSP, Bash |
| `reviewer` | Review code for bugs and quality issues | READ-ONLY | Read, Glob, Grep, LSP, codegraph_* |
| `tester` | Write and run tests | READ-WRITE | Read, Write, Edit, Glob, Grep, Bash |
| `security` | Analyze for security vulnerabilities | READ-ONLY | Read, Glob, Grep, LSP, codegraph_* |
| `devops` | Handle CI/CD, Docker, deployment | READ-WRITE | Read, Write, Edit, Glob, Grep, Bash, Docker, docker_compose |
| `docs` | Write and update documentation | READ-WRITE | Read, Write, Edit, Glob, Grep |

## Read-Only Mode

The following agents run in **read-only mode** to prevent accidental modifications:

- `explorer` - Read-only codebase exploration
- `planner` - Read-only analysis and planning
- `reviewer` - Read-only code review
- `security` - Read-only security analysis

In read-only mode, write tools (Write, Edit, Bash) are stripped from the allowed tools list regardless of the definition.

## Worktree Isolation (Placeholder)

SubAgentManager includes worktree isolation placeholders for future parallel code editing:

```typescript
createWorktree(instanceId: string, branchName?: string): Promise<string | null>;
removeWorktree(instanceId: string): Promise<boolean>;
```

When implemented, this will use `git worktree add` to create isolated branches for concurrent subagent edits.

## Spawn Options

```typescript
interface SpawnOptions {
  task: string;                    // Task description for the subagent
  context?: {
    cwd?: string;                  // Working directory
    artifacts?: string[];          // Artifact paths to share
    parentSessionId?: string;      // Parent session for result reporting
  };
  overrides?: Partial<SubAgentDefinition>;  // Override definition fields
}
```

## SubAgentResult

Results are reported back to the lead session as structured reports:

```typescript
interface SubAgentResult {
  success: boolean;
  output: string;                  // Raw output from the subagent
  artifacts: SubAgentArtifact[];   // Files/reports produced
  summary: string;                 // Human-readable summary
  durationMs: number;
  error?: string;                  // Error message if failed
}

interface SubAgentArtifact {
  type: "code" | "test" | "findings" | "diff" | "report" | "plan";
  path: string;
  content?: string;
  description?: string;
}
```

## Tools for Subagent Management

Altos provides four tools for subagent management:

### spawn_agent

Spawn a subagent to perform a task:

```typescript
spawn_agent({
  agent_name: "explorer",
  task: "Find all TypeScript files in src/",
  context: { cwd: "/path/to/project" }
})
```

### list_agents

List available subagent types:

```typescript
list_agents({ filter: "explore", read_only_only: true })
```

### get_agent_result

Get result from a spawned subagent:

```typescript
get_agent_result({ instance_id: "uuid-from-spawn" })
```

### terminate_agent

Cancel a running subagent:

```typescript
terminate_agent({ instance_id: "uuid-to-cancel" })
```

## CLI Commands

### altos agent list

List all available subagents with descriptions.

### altos agent inspect \<name\>

Show detailed information about a specific subagent.

### altos agent run \<name\> --task \<task\>

Spawn and run a subagent with a specific task.

## Slash Commands (Interactive Mode)

- `/agents` - List available subagents
- `/agent run <name> --task <task>` - Run a subagent task

## Usage Example

```typescript
import { SubAgentManager, registerBuiltInSubagents } from "@altos/core";

// Create and configure manager
const manager = new SubAgentManager();
registerBuiltInSubagents(manager);

// Spawn a read-only explorer
const instance = await manager.spawn("explorer", {
  task: "Analyze the project structure and identify main components",
  context: { cwd: process.cwd() }
});

// Check tool permissions
const canRead = manager.canUseTool(instance.id, "Read");    // true
const canWrite = manager.canUseTool(instance.id, "Write");  // false (read-only)

// Filter available tools
const allTools = [{ name: "Read" }, { name: "Write" }, { name: "Grep" }];
const allowedTools = manager.filterTools(instance.id, allTools);
// allowedTools = [{ name: "Read" }, { name: "Grep" }]

// Collect results when complete
const results = manager.collectResults();
```

## Security Considerations

1. **Tool Restriction**: Subagents only have access to explicitly allowed tools
2. **Read-Only Enforcement**: Sensitive agents cannot use write tools
3. **Path Restrictions**: Permission profiles can limit file system access
4. **Memory Scope**: Subagents only access memory within their scope
5. **Result Validation**: All subagent results should be validated before use

## Future Enhancements

- [ ] Worktree isolation for parallel code editing
- [ ] Async subagent execution with event streaming
- [ ] Subagent-to-subagent communication
- [ ] Custom subagent registration via plugins
- [ ] Subagent execution timeout configuration
- [ ] Resource usage limits per subagent type