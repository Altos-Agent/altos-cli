# Subagent System Architecture

## Overview

Altos supports specialized subagents with separate context, tools, permissions, memory scope, and model configuration. Subagents enable parallel execution of specialized tasks while maintaining isolation from the lead session.

## Core Concepts

### SubAgentDefinition

Each subagent type is defined by a `SubAgentDefinition`:

```typescript
interface SubAgentDefinition {
  name: string;
  description: string;
  system_prompt: string;
  allowed_tools: string[];
  permission_profile: PermissionProfile;
  memory_scope: MemoryScope;
  model_preference?: ModelPreference;
  read_only?: boolean;
}
```

### SubAgentManager

The `SubAgentManager` class manages subagent registration, spawning, and lifecycle:

- **Registration**: Register custom subagent definitions
- **Spawning**: Create subagent instances with task context
- **Tool Filtering**: Restrict tools based on subagent permissions
- **Read-Only Enforcement**: Strip write tools from read-only agents
- **Result Collection**: Gather results from completed subagents

### Memory Scope Levels

| Scope | Description |
|-------|-------------|
| `none` | No memory access |
| `session` | Current session only |
| `workspace` | Current workspace/project |
| `global` | All memory (admin only) |

### Permission Profile

```typescript
interface PermissionProfile {
  read: boolean;
  write: boolean;
  execute: boolean;
  network: boolean;
  tools: string[];
  paths?: string[];
}
```

## Built-in Subagents

| Name | Description | Mode | Memory Scope |
|------|-------------|------|--------------|
| `explorer` | Explore and analyze codebase structure | READ-ONLY | workspace |
| `planner` | Analyze requirements and create plans | READ-ONLY | workspace |
| `implementer` | Implement features and refactor code | READ-WRITE | workspace |
| `reviewer` | Review code for bugs and quality issues | READ-ONLY | workspace |
| `tester` | Write and run tests | READ-WRITE | workspace |
| `security` | Analyze for security vulnerabilities | READ-ONLY | workspace |
| `devops` | Handle CI/CD, Docker, deployment | READ-WRITE | workspace |
| `docs` | Write and update documentation | READ-WRITE | workspace |

## Tool Permission Matrix

| Tool | explorer | planner | implementer | reviewer | tester | security | devops | docs |
|------|----------|---------|-------------|----------|--------|----------|--------|------|
| Read | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Write | ✗ | ✗ | ✓ | ✗ | ✓ | ✗ | ✓ | ✓ |
| Edit | ✗ | ✗ | ✓ | ✗ | ✓ | ✗ | ✓ | ✓ |
| Glob | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Grep | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| LSP | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✗ | ✗ |
| codegraph_* | ✓ | ✓ | ✗ | ✓ | ✗ | ✓ | ✗ | ✗ |
| WebSearch | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| WebFetch | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Bash | ✗ | ✗ | ✓ | ✗ | ✓ | ✗ | ✓ | ✗ |
| Docker | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ |
| docker_compose | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ |

## Usage

### CLI Commands

```bash
altos agent list              # List all subagents
altos agent inspect <name>    # Show subagent details
altos agent run <name> --task <task>  # Run a subagent
```

### Slash Commands (Interactive Mode)

- `/agents` - List available subagents
- `/agent run <name> --task <task>` - Run a subagent task

### spawn_agent Tool

```json
{
  "agent_name": "explorer",
  "task": "Find all TypeScript files in src/",
  "context": { "cwd": "/path/to/project" }
}
```

### API Usage

```typescript
import { SubAgentManager, getBuiltinSubagents } from '@altos/core';

const manager = new SubAgentManager();

// Load built-in subagents
for (const def of getBuiltinSubagents()) {
  manager.register(def);
}

// Spawn a subagent
const instance = manager.spawn('explorer', {
  task: 'Analyze project structure',
  context: { cwd: '/path/to/project' }
});

// Get result
const result = await instance.result;
```

## Worktree Isolation

Worktree isolation provides parallel code editing capability. When a subagent needs to make changes:

1. A temporary git worktree is created for the subagent
2. Changes are made in isolation
3. Results are merged back to the main branch

**Note**: This is currently a placeholder. Actual git worktree integration is planned for future implementation.

## Result Format

Subagents return structured results:

```typescript
interface SubAgentResult {
  success: boolean;
  output: string;
  artifacts: SubAgentArtifact[];
  summary: string;
  durationMs: number;
  error?: string;
}

interface SubAgentArtifact {
  type: "code" | "test" | "findings" | "diff" | "report" | "plan";
  path: string;
  content?: string;
  description?: string;
}
```

## Architecture Layers

```
┌─────────────────────────────────────────────┐
│  Lead Session (Main Agent)                  │
│  - Commands: /agents, /agent run            │
│  - Tool: spawn_agent                        │
└────────────────┬────────────────────────────┘
                 │ spawns
                 ▼
┌─────────────────────────────────────────────┐
│  SubAgentManager                            │
│  - Registers subagent definitions           │
│  - Spawns subagent instances                │
│  - Filters tools by permissions             │
│  - Enforces read-only mode                  │
└────────────────┬────────────────────────────┘
                 │ creates
                 ▼
┌─────────────────────────────────────────────┐
│  SubAgentInstance                           │
│  - Isolated execution context               │
│  - Worktree path (placeholder)              │
│  - Result collection                        │
└─────────────────────────────────────────────┘
```

## Security Considerations

- **Tool Filtering**: Subagents only have access to explicitly allowed tools
- **Read-Only Mode**: Write operations are stripped from read-only agents
- **Path Restrictions**: Permission profiles can limit file system access
- **Memory Scope**: Subagents are limited to specific memory contexts
- **Worktree Isolation**: Changes are isolated until explicitly merged
