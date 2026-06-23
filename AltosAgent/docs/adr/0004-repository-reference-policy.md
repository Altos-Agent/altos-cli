# ADR-0004: Repository Reference Policy

**Status:** Accepted

**Date:** 2024-01-01

## Context

Altos is inspired by existing agent platforms (Pi, Claude Code, OpenCode, Aider, Codex CLI, OpenHands, Devin). Studying these systems is essential for learning patterns, but we must avoid direct code copying that could:
1. Violate licenses (especially GPL, AGPL, proprietary)
2. Create IP entanglement
3. Undermine Altos's independent architecture

## Decisions

### 1. Reference Repository Storage

Reference repositories are stored in `repository_reference/<name>/` only. They must NEVER be placed in `packages/`, `apps/`, `templates/`, or any production directory.

```
repository_reference/
├── <name>/
│   ├── ALTOS_REFERENCE_META.json   # Required metadata
│   ├── licenses/                    # License documents
│   └── analysis/                   # Auto-generated analysis
```

### 2. Required Metadata

Every imported reference must include `ALTOS_REFERENCE_META.json` with:
- `source_url`: Original repository URL
- `branch`: Branch/tag imported
- `imported_at`: ISO timestamp
- `commit_sha`: Specific commit SHA
- `license_file_detected`: License file name if found
- `status`: "pending_scan" | "scanned" | "analyzed"

### 3. License Compliance

Before any architectural study, run `pnpm reference:license`. Each reference is classified:

| Status | License | Action |
|--------|---------|--------|
| 🟢 **safe_to_study** | MIT, Apache-2.0, BSD, ISC, CC0, Unlicense | Architectural study permitted |
| 🟡 **requires_review** | LGPL, MPL | Note concerns, proceed with caution |
| 🔴 **incompatible_unknown** | GPL, AGPL, Proprietary | Do NOT copy code |

### 4. What IS Permitted

From any reference (even 🟢):
- Reading for architectural understanding
- Taking notes on design patterns
- Analyzing interfaces and data structures conceptually
- Learning UX/CLI interaction patterns
- Writing documentation about patterns observed

### 5. What IS NOT Permitted

From 🔴 repositories:
- Copying any source code
- Translating code to TypeScript (still copying)
- Using proprietary variable/function names as inspiration for identical ones

From all repositories:
- Copying code that hasn't been reviewed for license compatibility
- Claiming copied code as original Altos development
- Importing references into production directories

### 6. Prefer Reimplementation

When Altos needs functionality seen in a reference:
1. **Document** the pattern in `repository_reference/<name>/analysis/`
2. **Design** an Altos-native specification in `docs/adr/`
3. **Implement** independently using Altos's architecture
4. **Attribute** the inspiration in code comments or documentation

### 7. Analysis Workflow

```
Import → Scan License → Generate Audit → Analyze → Document Learnings
   │           │              │             │           │
   └───────────┴──────────────┴─────────────┴───────────┘
                        Continuous Loop
```

### 8. Automated Safeguards

The import script (`reference:import`) MUST:
- Refuse to clone into protected paths (packages/, apps/, etc.)
- Create `ALTOS_REFERENCE_META.json` automatically
- Clone to `repository_reference/<name>/` only

The license check (`reference:license`) MUST:
- Scan for all common license files
- Detect SPDX license patterns
- Generate `repository_reference/licenses/LICENSE_AUDIT.md`

## Consequences

### Positive
- Clear separation between inspiration and implementation
- License compliance is automated and auditable
- Reference knowledge is organized and searchable
- Reimplementation produces cleaner Altos-native code

### Negative
- Takes longer to implement features (must design, not copy)
- Requires discipline to not take shortcuts
- Need to maintain reference documentation

## Enforcement

This policy is enforced by:
1. **Automated scripts** that block dangerous paths
2. **PR review** requiring license audit before merging reference learnings
3. **Code ownership** on docs/adr/ for architectural decisions

## References

- [Import Script](../../scripts/import-reference-repo.ts)
- [License Check Script](../../scripts/license-check.ts)
- [Analyze Script](../../scripts/analyze-reference-repo.ts)
- [License Audit Report](../../repository_reference/licenses/LICENSE_AUDIT.md)
