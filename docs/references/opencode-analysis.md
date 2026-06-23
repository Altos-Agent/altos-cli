# Reference Analysis: opencode

**Generated:** 2026-06-18T20:18:03.625Z
**Repository:** opencode

## Quick Summary

| Metric | Score |
|--------|-------|
| Architecture | ★★★★★★★★★★ |
| Plugin System | ★★★★★★★☆☆☆ |
| Tool System | ★★★★★★★★★★ |
| Memory Management | ★★★★★★★★★★ |
| Security | ★★★☆☆☆☆☆☆☆ |
| **Overall** | ★★★★★★★★☆☆ |

## Repository Overview

**Languages:** Go, Other, YAML, JSON, Markdown
**Total Files:** undefined
**Total Lines:** 0

## Directory Structure (Top 20)

```
  workflows/
  schema/
  app/
  completions/
  config/
  db/
  db/migrations/
  db/sql/
  diff/
  fileutil/
  format/
  history/
  llm/agent/
  llm/models/
  llm/prompt/
  llm/provider/
  llm/tools/
  llm/tools/shell/
  logging/
  lsp/
```

## Key Files

- `/home/oguz/Masaüstü/AltosAgent/repository_reference/opencode/go.mod`

## Detected Patterns

### CLI Patterns

- CLI-related: cmd/root.go
- CLI-related: schema/README.md
- CLI-related: schema/main.go
- CLI-related: lsp/client.go

### Plugin/Extension Patterns

- Plugin/Extension: config/init.go
- Plugin/Extension: migrations/20250424200609_initial.sql
- Plugin/Extension: dialog/init.go

### Memory/State Patterns

- Memory/State: db/sessions.sql.go
- Memory/State: sql/sessions.sql
- Memory/State: history/file.go
- Memory/State: session/session.go
- Memory/State: dialog/session.go

### Tool/Executor Patterns

- Tool/Executor: agent/agent-tool.go
- Tool/Executor: agent/mcp-tools.go
- Tool/Executor: agent/tools.go
- Tool/Executor: tools/bash.go
- Tool/Executor: tools/diagnostics.go
- Tool/Executor: tools/edit.go
- Tool/Executor: tools/fetch.go
- Tool/Executor: tools/file.go
- Tool/Executor: tools/glob.go
- Tool/Executor: tools/grep.go
- Tool/Executor: tools/ls.go
- Tool/Executor: tools/ls_test.go
- Tool/Executor: tools/patch.go
- Tool/Executor: shell/shell.go
- Tool/Executor: tools/sourcegraph.go
- Tool/Executor: tools/tools.go
- Tool/Executor: tools/view.go
- Tool/Executor: tools/write.go

### Configuration Patterns

- Config/Options: schema/README.md
- Config/Options: schema/main.go
- Config/Options: config/config.go
- Config/Options: config/init.go
- Config/Options: opencode/opencode-schema.json

## What Altos Should Learn

- Clean separation of concerns between packages
- Plugin lifecycle management (init/dispose)
- Tool interface design patterns
- Configuration schema validation
- Error handling and logging strategies
- CLI argument parsing patterns
- File editing workflow
- Git integration approach

## What Altos Must NOT Copy Directly

- Direct code copying without license review
- Copying proprietary algorithms
- Replicating file structures without adaptation
- Using copyrighted variable/function names

## Notes

_No additional notes_

---

*Analysis generated automatically. Always verify findings manually.*
*See [ADR-0004](../adr/0004-repository-reference-policy.md) for reference policies.*