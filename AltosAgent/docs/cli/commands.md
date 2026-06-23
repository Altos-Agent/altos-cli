# Altos CLI Command Reference

Complete reference for all `altos` CLI commands.

## Global Options

| Option | Description |
|--------|-------------|
| `--version`, `-v` | Print version and exit |
| `--help`, `-h` | Print help and exit |
| `--config=<path>` | Use alternate config file |
| `--json` | Output JSON format (where supported) |

## Commands

### `altos` (no arguments)
Start interactive REPL mode.

```bash
altos
```

### `altos -p "question"`
Print mode — ask a question and print the answer.

```bash
altos -p "how does auth work"
altos -p "fix the login bug" --json
```

### `altos run "task"`
Run a task non-interactively.

```bash
altos run "fix the null pointer exception"
altos run "add user authentication" --sandbox
```

---

## Indexing Commands

### `altos index`
Index the repository for code intelligence.

```bash
altos index                    # Index with incremental updates
altos index --force            # Force full re-index
altos index --stats            # Show detailed statistics
altos index --json             # Output JSON format
altos index --quiet            # Minimal output
altos index --watch            # Watch mode for live updates
altos index --path=/project    # Index specific directory
altos index --poll=5000        # Polling interval in ms (watch mode)
```

**Output (default):**
```
[index] incremental done in 1852ms — indexed 1887, skipped 0, removed 0, total 5974 symbols
```

**Output (`--stats`):**
```
Index Run:
  Mode:            incremental
  Discovered:      1887
  Indexed:         1887
  Skipped:         0
  Removed:         0
  Duration:        1852ms
Scan Statistics:
  Total files scanned: 8002
  By language: {"typescript":974,"javascript":913,...}
  Scan time: 904ms

Symbol Statistics:
  Total symbols: 5974
  Total files with symbols: 1882

Repository Statistics:
  Packages: 60
```

**Exit Codes:**
- `0` — Success
- `1` — Indexing error

---

### `altos map`
Show repository structure and architecture.

```bash
altos map                      # Show summary and important files
altos map --json               # Output JSON format
altos map --quiet              # Minimal one-line summary
altos map --packages           # Show package information
altos map --exports            # Show exported symbols
altos map --important          # Show important files
altos map --focus=api          # Focus on specific area
altos map --path=/project      # Map specific directory
```

**Output (default):**
```
Repository Map
├── apps/
│   ├── cli/           CLI entry point
│   ├── local-api/     Local API server
│   └── web-dashboard/ Web monitoring UI
├── packages/
│   ├── ai/            AI provider integration
│   ├── code-index/    Code indexing and search
│   ├── core/          Core runtime
│   └── ...
└── ...

Generated in 234ms

Important files:
  apps/cli/src/index.ts - Main CLI entry point (234 lines)
  packages/core/src/agent.ts - Agent runtime (456 lines)
  ...
```

**Exit Codes:**
- `0` — Success
- `1` — Error

---

### `altos context "prompt"`
Show relevant context files for a prompt.

```bash
altos context "how does auth work"
altos context "fix login bug" --json
altos context "add user profile" --files 10
altos context "debug payment" --max-tokens 2000
altos context "refactor" --show-evidence
altos context --path=/project "query"
```

**Options:**

| Flag | Description | Default |
|------|-------------|---------|
| `<prompt>` | Query to select relevant files | Required |
| `--path=<dir>` | Working directory | `cwd` |
| `--files=<n>` | Max files to select | `10` |
| `--json` | Output JSON format | `false` |
| `--evidence` | Show scoring breakdown | `false` |
| `--max-tokens=<n>` | Token budget | `6000` |

**Output (human-readable):**
```
Context for prompt: "how does auth work"
Selected 3 files, ~850 tokens

### File Selection
│ Score  │ Path                        │ Reasons
│────────│─────────────────────────────│────────────────────
│ 0.85   │ src/services/auth.ts        │ symbol_match: AuthService
│ 0.72   │ src/middleware/auth.ts      │ symbol_match: authenticate
│ 0.65   │ src/utils/token.ts          │ lexical_match: path contains 'auth'

### Token Budget
  Estimated: 850 / 6,000 tokens
  Status: ✅ Within budget
```

**Output (`--json`):**
```json
{
  "prompt": "how does auth work",
  "selectedFiles": [
    {
      "path": "src/services/auth.ts",
      "score": 0.85,
      "reasons": [{"type": "symbol_match", "detail": "matched symbol 'AuthService'"}]
    }
  ],
  "totalTokens": 850,
  "maxTokens": 6000,
  "fitsBudget": true
}
```

**Exit Codes:**
- `0` — Success (may have stale index warning)
- `1` — Error or stale index

---

### `altos search <query>`
Search for symbols and files.

```bash
altos search "AuthService"
altos search "parseTS" --refs
altos search "Component" --kind=class --json
```

**Options:**

| Flag | Description | Default |
|------|-------------|---------|
| `<query>` | Search pattern | Required |
| `--path=<dir>` | Search directory | `cwd` |
| `--refs` | Include references | `false` |
| `--file=<name>` | Filter by filename | none |
| `--kind=<type>` | Filter by symbol kind | none |
| `--json` | Output JSON format | `false` |
| `--limit=<n>` | Max results | `50` |

---

### `altos tools`
List available tools.

```bash
altos tools --list            # List all tools (default)
altos tools --show=<name>     # Show tool details
altos tools --json            # JSON output
altos tools --quiet           # Just show count
```

**Output (`--list`):**
```
=== Altos Tools (11 tools) ===

File System:
  [LOW ] read_file        Read file contents
  [HIGH] write_file       Write content to a file
  [HIGH] edit_file        Edit file by find/replace
  [HIGH] apply_patch      Apply unified diff patch
  [LOW ] list_dir         List directory contents

Git:
  [LOW ] git_status       Show working tree status
  [LOW ] git_diff         Show changes
  [LOW ] git_log          Show commit history

Search:
  [LOW ] grep             Search file contents
  [LOW ] find_files       Find files by pattern

Shell:
  [CRIT] bash             Execute bash command

Risk Levels: [LOW] [MED] [HIGH] [CRIT]

Workspace: /project
Use 'altos tools --show <name>' for detailed info.
```

**Output (`--show=read_file`):**
```
=== Tool: read_file ===

Description: Read the complete contents of a file. Supports partial reads.
Risk Level: [LOW ] (low)

Input Schema:
{
  "type": "object",
  "properties": {
    "path": { "type": "string" },
    "offset": { "type": "number" },
    "limit": { "type": "number" }
  },
  "required": ["path"]
}

Required Permissions: none
```

**Exit Codes:**
- `0` — Success
- `1` — Tool not found (with `--show`)

---

### `altos doctor`
Run diagnostics and check configuration.

```bash
altos doctor                 # Human-readable report
altos doctor --json          # JSON output
altos doctor --release-check # Exit non-zero on issues
```

**Output:**
```
=== Altos Doctor Report ===

OS:           linux 6.8.0
Node:         v24.15.0
Altos:        0.1.0
Providers:    3 registered

--- Config Files ---
  /home/user/.altos/config.json: ✓ exists
  /project/.altos/config.json: ✗ missing

--- Providers ---
  OpenAI (openai): ✓ configured
    Env var: OPENAI_API_KEY
    Models:  4
  Anthropic (anthropic): ✗ not configured
    Env var: ANTHROPIC_API_KEY
    Models:  4

--- Issues ---
  ✗ Provider "anthropic" not configured (ANTHROPIC_API_KEY not set)
```

**Output (`--json`):**
```json
{
  "version": "1.0",
  "summary": {
    "total": 3,
    "configured": 1,
    "unconfigured": 2,
    "issues": 3,
    "hasIssues": true
  },
  "system": {
    "os": "linux 6.8.0",
    "nodeVersion": "v24.15.0",
    "altosVersion": "0.1.0"
  },
  "configFiles": [...],
  "providers": [...],
  "issues": [...]
}
```

**Exit Codes:**
- `0` — No issues
- `1` — Issues found (or `--release-check` with issues)

---

### `altos memory`
Memory provider management.

```bash
altos memory                 # Show status (default)
altos memory status          # Detailed status
altos memory use <provider>  # Set provider
altos memory help            # Show help
```

**Providers:**
- `local` — Local file-based memory (default)
- `hermes` — Hermes cloud memory
- `memplace` — MemPlace memory service
- `codegraph` — CodeGraph knowledge graph

**Output (`status`):**
```
=== Memory Status ===

Current provider: local
Config file:      /home/user/.altos/config.json

Available providers:
  ● local
  ○ hermes
  ○ memplace
  ○ codegraph

Use 'altos memory use <provider>' to change provider.
```

**Exit Codes:**
- `0` — Success
- `1` — Error (invalid provider, etc.)

---

### `altos models`
List available AI models.

```bash
altos models                 # List all models
altos models --json          # JSON output
altos models --provider=openai  # Filter by provider
```

---

### `altos config`
Configuration management.

```bash
altos config get [key]       # Get config value
altos config set <key> <value>  # Set config value
altos config list            # List all config
```

---

### `altos plugin`
Plugin management.

```bash
altos plugin list            # List installed plugins
altos plugin add <path>      # Add a plugin
altos plugin remove <name>   # Remove a plugin
altos plugin inspect <name>  # Show plugin details
altos plugin create          # Create new plugin
```

---

### `altos skill`
Skill package management.

```bash
altos skill list             # List available skills
altos skill inspect <name>   # Show skill details
altos skill run <name>       # Run a skill
altos skill create           # Create new skill
```

---

### `altos mcp`
MCP server management.

```bash
altos mcp list               # List MCP servers
altos mcp add <config>       # Add MCP server
altos mcp remove <name>      # Remove server
altos mcp tools <name>       # List server tools
```

---

### `altos sandbox`
Sandbox management.

```bash
altos sandbox status         # Show sandbox status
altos sandbox run            # Run in sandbox
```

---

### `altos serve`
Start local API server.

```bash
altos serve                  # Start on default port (3001)
altos serve --port 8080      # Custom port
altos serve --host 0.0.0.0   # Bind address
```

---

### `altos cloud`
Cloud session management.

```bash
altos cloud status           # Show cloud status
altos cloud run              # Start cloud session
```

---

### `altos eval`
Evaluation scenarios.

```bash
altos eval list              # List scenarios
altos eval run               # Run all scenarios
altos eval run --scenario=<name>  # Run specific scenario
altos eval run --json        # JSON output
```

---

### `altos replay <session-id>`
Replay a recorded session.

```bash
altos replay <session-id>
altos replay <session-id> --json
altos replay <session-id> --show-diff
```

---

### `altos perf`
Show performance metrics.

```bash
altos perf
```

---

## Interactive Mode Commands

When running `altos` without arguments, you enter interactive REPL mode:

```
Altos v0.1.0
Type '/help' for commands, '/compact' to compact context, '/exit' to quit.

> _
```

**Special Commands (in interactive mode):**

| Command | Description |
|---------|-------------|
| `/help` | Show help |
| `/compact` | Manually trigger context compaction |
| `/exit`, `/quit` | Exit interactive mode |
| `/context <prompt>` | Run context command |
| `/map` | Run map command |
| `/tools` | List tools |
| `/doctor` | Run diagnostics |

---

## Examples

### First-time setup
```bash
# Check configuration
altos doctor

# Set your API key
export ANTHROPIC_API_KEY=sk-...

# Index your project
altos index --stats

# See repository structure
altos map

# Find relevant code
altos context "how does the auth system work"
```

### Daily workflow
```bash
# Start interactive mode
altos

# In interactive mode:
# /context "fix the login bug"
# /map
# /doctor
# /compact
```

### CI/Automation
```bash
# Index before builds
altos index --quiet

# Check context fits budget
altos context "your query" --json | jq '.fitsBudget'

# Doctor for release
altos doctor --release-check
```