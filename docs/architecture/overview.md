# Architecture Overview

## System Layers

```
┌─────────────────────────────────────────────────────────────┐
│                         CLI App                             │
│                    (@altos/cli)                             │
└──────────────────────────┬────────────────────────────────┘
                           │
┌──────────────────────────▼────────────────────────────────┐
│                    Core Packages                            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐ │
│  │   core   │  │    ai    │  │  config  │  │ telemetry  │ │
│  └──────────┘  └──────────┘  └──────────┘  └────────────┘ │
└──────────────────────────┬────────────────────────────────┘
                           │
┌──────────────────────────▼────────────────────────────────┐
│                  Capability Packages                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐ │
│  │  tools   │  │  mcp     │  │ memory   │  │ code-index │ │
│  └──────────┘  └──────────┘  └──────────┘  └────────────┘ │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐ │
│  │plugins   │  │ skills   │  │packages  │  │  evals     │ │
│  └──────────┘  └──────────┘  └──────────┘  └────────────┘ │
└──────────────────────────┬────────────────────────────────┘
                           │
┌──────────────────────────▼────────────────────────────────┐
│                 Safety & Infrastructure                     │
│  ┌──────────────┐  ┌─────────────┐  ┌───────────────────┐ │
│  │  permissions │  │  sandbox   │  │   cloud           │ │
│  └──────────────┘  └─────────────┘  └───────────────────┘ │
└───────────────────────────────────────────────────────────┘
```

## Layer Descriptions

### Core Packages

| Package | Purpose |
|---------|---------|
| `core` | Event types, session interfaces, logger, runtime config |
| `ai` | AI provider abstraction, model configs, prompt management |
| `config` | Configuration loading, schema validation |
| `telemetry` | Tracing and metrics (foundation for observability) |

### Capability Packages

| Package | Purpose |
|---------|---------|
| `tools` | Built-in tools: fs, git, shell, search |
| `mcp` | Model Context Protocol client and server |
| `memory` | Session history, embeddings, compaction |
| `code-index` | AST parsing, symbol maps, semantic search |
| `plugins` | Plugin discovery, lifecycle, permissions |
| `skills` | Skill behaviors and workflows |
| `packages` | Package registry and publishing |
| `evals` | Evaluation framework and replay |

### Safety & Infrastructure

| Package | Purpose |
|---------|---------|
| `permissions` | Permission engine, audit logging |
| `sandbox` | Process isolation, resource limits |
| `cloud` | Cloud runtime, worker coordination, local mock |

## Design Principles

### 1. Plugin-First

Every capability — tools, skills, memory backends, AI providers — is a plugin. The core provides the runtime and contracts; extensions provide the implementations.

### 2. Safe by Default

Every tool execution requires explicit permission. The permission engine supports allow/deny patterns, interactive prompts, and configurable default policies.

### 3. Local-First Cloud

Cloud features are a progressive enhancement. The local mock runtime enables full cloud-feature development without remote infrastructure.

### 4. Type-Safe Module Boundaries

All package boundaries use TypeScript interfaces. Internal details are encapsulated; only explicitly exported types cross package lines.

## Key Interfaces

### AgentRuntime

The central orchestrator. Runs an agent session, dispatches tool calls, manages permission checks, and emits events.

### ToolCall

Standard interface for all tool executions: `{ id, name, args, result, error, duration }`.

### PermissionContext

Passed to every tool call. Contains the tool definition, arguments, and session context for policy evaluation.

### CloudRuntime

Abstract interface for cloud coordination. `LocalMockCloudRuntime` is the in-process implementation.

## See Also

- [Core Architecture](../architecture/ai-provider-layer.md)
- [Permission System](../security/overview.md)
- [Plugin Authoring](../plugin-authoring/overview.md)
- [Cloud Architecture](../cloud/cloud-architecture.md)
- Individual package exports for type definitions.
