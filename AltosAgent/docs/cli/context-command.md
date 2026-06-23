# `altos context` Command

Inspect what context Altos would send to the model for a given prompt. Useful for debugging agent context and understanding which files are selected for a query.

## Usage

```bash
altos context "how does auth work"
altos context "fix login bug" --files 10
altos context "add user profile" --json
altos context "debug payment webhook" --include-tree
altos context "refactor auth service" --max-tokens 2000
```

## Flags

| Flag | Description | Default |
|---|---|---|
| `<prompt>` | Query to select relevant files (required) | — |
| `--path, -p` | Working directory | `cwd` |
| `--files, -n` | Maximum number of files to select | `20` |
| `--json` | Output machine-readable JSON | `false` |
| `--max-tokens` | Token budget for repo map slice | `2000` |
| `--show-evidence` | Show scoring breakdown and evidence | `false` |
| `--include-tree` | Include full file tree in output | `false` |
| `--include-git` | Include git context (recency, changes) | `false` |

## Output

### Human-Readable Format

```
## Context for prompt

Selected 3 files, ~850 tokens

### File Selection

│ Score  │ Path                                             │ Reasons
│────────│──────────────────────────────────────────────────│─────────────────────
│ 0.85   │ src/services/auth.ts                             │ symbol_match: matched symbol 'AuthService'
│ 0.72   │ src/middleware/auth.ts                           │ symbol_match: matched symbol 'authenticate'
│ 0.65   │ src/utils/token.ts                               │ lexical_match: path contains 'auth'

### Token Budget
  Estimated: 850 / 2,000 tokens
  Status: ✅ Within budget

### Repo Map Summary
  124 files, 3 packages
  Languages: typescript:98, javascript:20, json:6
```

With `--show-evidence`:

```
### Scoring Breakdown

**src/services/auth.ts** (score: 0.85)
  symbolScore:       ████████████████████ 0.90
  lexicalScore:      ██████████░░░░░░░░░░ 0.50
  gitRecencyScore:   ██████████████████░░ 0.80
  pathProximityScore: ████████░░░░░░░░░░░ 0.40
  testProximityScore: ░░░░░░░░░░░░░░░░░░ 0.00
  importGraphScore:  ████████████████████ 0.85

  Evidence:
    • class 'AuthService' at line 10
    • imports src/utils/token.ts
    • modified 3 days ago
```

### JSON Format

```json
{
  "prompt": "how does auth work",
  "selectedFiles": [
    {
      "path": "src/services/auth.ts",
      "score": 0.85,
      "reasons": [
        { "type": "symbol_match", "detail": "matched symbol 'AuthService'" }
      ],
      "evidence": ["class 'AuthService' at line 10", "imports src/utils/token.ts"],
      "components": {
        "symbolScore": 0.90,
        "lexicalScore": 0.50,
        "gitRecencyScore": 0.80,
        "pathProximityScore": 0.40,
        "testProximityScore": 0.00,
        "importGraphScore": 0.85
      }
    }
  ],
  "repoMap": { ... },
  "totalTokens": 850,
  "maxTokens": 2000,
  "fitsBudget": true
}
```

## Scoring Components

Files are scored across six dimensions:

| Component | Weight | Description |
|---|---|---|
| `symbolScore` | 0.30 | Quality of matched symbols (classes > functions > variables) |
| `lexicalScore` | 0.25 | Substring match in file path |
| `gitRecencyScore` | 0.15 | Modified recently (within 30 days) |
| `pathProximityScore` | 0.12 | Near other high-scoring files |
| `testProximityScore` | 0.10 | Test file for selected source |
| `importGraphScore` | 0.08 | Imports or is imported by selected files |

## Token Budget

The `--max-tokens` flag controls the budget for the repo map slice. The selector:

1. Selects top-scoring files up to `--files` limit
2. Builds a repo map slice containing only selected files
3. Trims structure/symbols/graph to fit within budget
4. Reports whether result fits the budget

Budget allocation when trimming:
- 40% structure/packages
- 30% exported symbols
- 20% module graph
- 10% important files

## Stale Index Warning

If the index hasn't been updated in 7+ days, you'll see:

```
⚠️  Index is 10 days old (last updated 6/10/2026). Run 'altos index' to refresh.
   Continuing anyway — results may be incomplete.
```

In JSON mode with a stale index, the command returns exit code 1 with:

```json
{
  "warning": "Index is 10 days old...",
  "error": "Index is stale or missing. Run 'altos index' to build it.",
  "selectedFiles": [],
  "fitsBudget": false
}
```

## Examples

### Debug what context a bug report would generate

```bash
altos context "null pointer in payment processor" --show-evidence
```

### Export JSON for external tools

```bash
altos context "user authentication flow" --json > context.json
```

### Test with tight token budget

```bash
altos context "react hooks" --max-tokens 500 --files 5
```

### CI: fail if context doesn't fit budget

```bash
altos context "your query" --json --max-tokens 1000 | jq '.fitsBudget'
```