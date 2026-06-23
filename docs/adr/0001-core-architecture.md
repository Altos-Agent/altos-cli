# ADR-0001: Core Architecture

**Status:** Accepted

**Date:** 2024-01-01

## Context

We need to design the initial architecture for Altos — a CLI agent platform. We drew inspiration from Pi, Claude Code, OpenCode, Aider, and Codex CLI, but designed an independent architecture.

## Decisions

### 1. Monorepo with pnpm workspaces

We use pnpm workspaces in a Turborepo monorepo structure. Each package is independently versioned and can be consumed separately.

**Rationale:** Enables incremental builds, shared tooling, and atomic changes across packages.

### 2. Plugin-first design

The core is minimal. All capabilities beyond the bare minimum (tool execution, message handling) are provided by plugins. The plugin system exposes hooks for lifecycle events, tool registration, and message processing.

**Rationale:** Prevents core bloat, enables community contributions, and allows users to swap implementations.

### 3. Tool abstraction

Tools are registered by name and described by a schema. Execution is async and returns a `ToolResult` with success flag, data, error, and duration.

**Rationale:** Standard interface allows any plugin to provide tools without coupling to a specific runtime.

### 4. Permission system as architectural primitive

Permissions are checked before tool execution. The system supports allowlists, deny rules, and interactive prompts. Audit logs capture every decision.

**Rationale:** Safety must be built in, not bolted on. Users need granular control over what the agent can do.

### 5. Sandbox isolation

Process execution uses resource limits (memory, CPU, time, file size). Network access is controllable per operation.

**Rationale:** Even with permissions, a misbehaving tool or prompt injection must be contained.

### 6. MCP as first-class integration

The Model Context Protocol client is a first-class package, not a plugin. MCP servers provide tools and resources using a standardized protocol.

**Rationale:** Interoperability with the broader MCP ecosystem is essential.

### 7. Repository references stored separately

Reference implementations are stored under `repository_reference/` with license analysis. Code is not copied into production without review.

**Rationale:** Legal safety and architectural integrity. Inspiration without plagiarism.

## Consequences

- Building a plugin is straightforward — implement `Plugin` interface and register.
- Adding a new model provider only requires implementing the `ModelProvider` interface.
- The CLI is thin — all major logic lives in packages.
- Security posture is explicit — every permission decision is auditable.
