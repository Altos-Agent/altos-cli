# Memory Adapter Architecture

## Overview

Altos uses an **adapter-based memory system** that allows different storage backends while presenting a unified interface. Memory is **optional** — Altos works perfectly well without memory, but enabling it allows long-term context retention across sessions.

```
┌─────────────────────────────────────────────────────┐
│                    CLI / REPL                       │
├─────────────────────────────────────────────────────┤
│              Memory Commands Layer                  │
│   /memory status|search|write|summarize|use        │
├─────────────────────────────────────────────────────┤
│              MemoryProvider Interface               │
│         (writeMemory, readMemory, search, etc.)     │
├──────────┬──────────┬──────────┬───────────────────┤
│  Local   │ Hermes   │ Memplace │  CodeGraph        │
│ Provider │ Provider │ Provider │    Provider       │
│ (local)  │(placeholder)│(placeholder)│ (placeholder) │
└──────────┴──────────┴──────────┴───────────────────┘
```

## Key Design Principles

1. **Optional**: Memory must never be required for basic operation
2. **Adapter-based**: New backends can be added by implementing the `MemoryProvider` interface
3. **Safe by default**: Secrets are always redacted before storage
4. **Structured storage**: Local provider uses well-defined file formats

---

## MemoryProvider Interface

All memory providers implement the `MemoryProvider` interface from `packages/memory/src/providers/MemoryProvider.ts`.

### Core Methods

| Method | Description |
|--------|-------------|
| `initialize()` | Async setup — must be called before any operations |
| `isReady()` | Returns `true` if the provider is ready |
| `close()` | Clean shutdown |

### Long-term Memory

| Method | Description |
|--------|-------------|
| `writeMemory(content, scope)` | Store content in `global` (user) or `project` scope |
| `readMemory(scope, limit?)` | Retrieve recent entries |
| `searchMemory(query, options?)` | Full-text search across all memory |
| `updateMemory(id, content)` | Replace an existing entry |
| `deleteMemory(id)` | Remove an entry permanently |

### Session Management

| Method | Description |
|--------|-------------|
| `summarizeSession(sessionId, events)` | Compact a session's events into a summary |

### Project Knowledge

| Method | Description |
|--------|-------------|
| `getProjectKnowledge()` | List all knowledge files |
| `addProjectKnowledge(title, content, tags?)` | Add a structured knowledge entry |

---

## LocalMemoryProvider

The default provider that stores memory on the local filesystem.

### Storage Layout

```
~/.altos/
└── memory/
    └── global.md              # Global user-level memory

{project}/
└── .altos/
    └── memory/
        ├── project.md         # Project-specific memory
        ├── sessions/          # Session event logs
        │   └── {sessionId}.jsonl
        └── knowledge/         # Structured knowledge files
            └── {uuid}.md
```

### File Formats

#### Memory Files (`global.md`, `project.md`)

Memory entries are stored as markdown with timestamp separators:

```markdown
# Global Memory

_Last updated: 2024-01-15T10:30:00.000Z_

---

[2024-01-15T10:30:00.000Z]

This is the first memory entry.

---

[2024-01-15T11:45:00.000Z]

Another entry with **formatting** and content.

```

#### Session Event Logs (`sessions/{id}.jsonl`)

Session events are stored as JSON Lines, one event per line:

```jsonl
{"type":"session_started","sessionId":"abc123","sequence":1,"timestamp":1705312200000}
{"type":"user_message","sessionId":"abc123","sequence":2,"timestamp":1705312201000,"payload":{"content":"Hello"}}
{"type":"assistant_message","sessionId":"abc123","sequence":3,"timestamp":1705312205000,"payload":{"content":"Hi!"}}
```

#### Knowledge Files (`knowledge/{uuid}.md`)

Knowledge files use YAML frontmatter:

```markdown
---
id: 550e8400-e29b-41d4-a716-446655440000
title: "TypeScript Best Practices"
tags: ["typescript", "best-practices", "code-quality"]
createdAt: 1705312200000
updatedAt: 1705312200000
---

# TypeScript Best Practices

This document covers key TypeScript patterns...
```

### Search Behavior

- **Case-insensitive** full-text search
- Searches both `global.md` and `project.md`
- Results sorted by timestamp (most recent first)
- Respects `limit` option

---

## Placeholder Providers

### HermesMemoryProvider

> **Status**: Placeholder — no network integration implemented

The Hermes protocol provider is a stub that throws `Error("Hermes provider not implemented - placeholder")` for write operations and returns empty results for read/search.

**To implement**: Connect to Hermes network protocol for distributed memory sync.

### MemplaceMemoryProvider

> **Status**: Placeholder — no network integration implemented

The Memplace/MemPalace provider is a stub. Memplace would provide semantic memory with AI-powered recall.

**To implement**: Connect to MemPalace API for cloud-synced semantic memory.

### CodeGraphMemoryProvider

> **Status**: Placeholder — no network integration implemented

The CodeGraph provider would store memory as code annotations linked to the codebase's symbol graph.

**To implement**: Connect to CodeGraph index for code-aware memory retrieval.

---

## Configuration

### Config Key

```json
{
  "memory": {
    "use": "local"
  }
}
```

Supported values: `local`, `hermes`, `memplace`, `codegraph`

### CLI Usage

```bash
# Set memory provider
altos memory use local

# Get current config
altos config get memory.use
```

---

## CLI Commands

### Slash Commands (Interactive Mode)

| Command | Description |
|---------|-------------|
| `/memory status` | Show current provider and ready state |
| `/memory search <query>` | Search across all memory |
| `/memory write [--global] <content>` | Write to memory |
| `/memory summarize` | Compact current session |
| `/memory use <provider>` | Switch memory provider |

### CLI Commands (Non-interactive)

```bash
altos memory use <local|hermes|memplace|codegraph>
```

---

## Secret Safety

### Automatic Redaction

**All write operations automatically redact secrets** before storage. This includes:

- **API Keys**: OpenAI (`sk-...`), GitHub (`ghp_...`), generic (`api_key=...`)
- **Tokens**: Bearer tokens, JWTs
- **Credentials**: Passwords, passwd, pwd patterns
- **Connection Strings**: Database URLs with embedded passwords
- **Private Keys**: RSA/EC/DSA private key headers

### How Redaction Works

The `redactSecrets()` function in `packages/memory/src/redaction.ts`:

1. Extends the core `@altos/core` maskSecrets patterns
2. Applies regex replacements for known secret formats
3. Replaces matched secrets with `[REDACTED]`
4. Returns the sanitized string for storage

### Confirmation Prompts

Before writing long-term memory, you can check if content contains secrets:

```typescript
import { containsSecrets } from "@altos/memory";

if (containsSecrets(content)) {
  console.log("WARNING: Content may contain secrets");
}
```

### What Gets Redacted

| Pattern | Example | Redacted |
|---------|---------|----------|
| OpenAI key | `sk-1234567890...` | `[REDACTED]` |
| GitHub token | `ghp_abcdef...` | `[REDACTED]` |
| Bearer token | `Bearer eyJ...` | `Bearer [REDACTED]` |
| Password | `password="secret"` | `password=[REDACTED]` |
| Database URL | `mysql://user:pass@...` | `mysql://user:[REDACTED]@...` |
| JWT | `eyJhbGci...` | `[REDACTED]` |

---

## Session Compaction

Session compaction reduces a session's raw events to a structured summary.

### What is Preserved

- **Decisions**: Extracted from assistant messages containing "I will", "I decided", "Choosing", etc.
- **File Changes**: From `file_patch_applied` events and tool results for write operations
- **Test Results**: From `run_tests`/`test` tool outcomes

### What is Dropped

- Detailed tool arguments
- Repeated patterns
- Raw API interactions
- Intermediate thinking

### Output Format

```markdown
# Session Compaction Summary

**Time Range:** Jan 15, 10:30 AM - 11:45 AM
**Total Events:** 47

## Decisions

- I will implement the memory adapter interface first
- Choosing local filesystem for initial storage
- Selected JSONL format for session logs

## File Changes

- `packages/memory/src/providers/MemoryProvider.ts`
- `packages/memory/src/providers/LocalMemoryProvider.ts`
- `packages/memory/src/redaction.ts`

## Test Results

- Tests passed

_This summary was auto-generated by session compaction._
_Detailed event logs are available in the session JSONL file._
```

### Triggering Compaction

```bash
/memory summarize
```

---

## Future: Implementing Real Providers

### Hermes Integration

1. Add Hermes client library as dependency
2. Implement `initialize()` to connect to Hermes network
3. Implement `writeMemory()` to use Hermes KV store
4. Implement `searchMemory()` for Hermes query protocol
5. Handle authentication and encryption

### Memplace Integration

1. Add MemPalace API client
2. Implement authentication with MemPalace OAuth
3. Implement semantic search using MemPalace embeddings
4. Handle sync conflicts and eventual consistency

### CodeGraph Integration

1. Connect to CodeGraph index
2. Store memory entries as code annotations
3. Use CodeGraph's symbol graph for context-aware retrieval
4. Link memory to specific functions/files

---

## File Structure

```
packages/memory/src/
├── index.ts                      # Main exports
├── providers/
│   ├── MemoryProvider.ts         # Interface definition
│   ├── LocalMemoryProvider.ts    # Local filesystem impl
│   ├── HermesMemoryProvider.ts   # Hermes placeholder
│   ├── MemplaceMemoryProvider.ts # Memplace placeholder
│   ├── CodeGraphMemoryProvider.ts # CodeGraph placeholder
│   ├── factory.ts                # createMemoryProvider()
│   └── index.ts                  # Provider exports
├── redaction.ts                  # Secret redaction
└── compaction.ts                 # Session compaction
```

---

## Testing

```bash
# Run memory package tests
pnpm --filter @altos/memory test

# Run specific test file
pnpm --filter @altos/memory test -- src/__tests__/redaction.test.ts
```

### Key Test Coverage

- **LocalMemoryProvider**: All CRUD operations, search, session compaction
- **Secret Redaction**: API keys, tokens, passwords, connection strings, edge cases
- **Project Knowledge**: Add, retrieve, tag filtering
