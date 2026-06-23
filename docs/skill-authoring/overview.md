# Skill Authoring

## Overview

Skills are reusable, declarative agent behaviors packaged as manifest files. A skill describes **what** the agent should do and **how** to do it through an instruction prompt, without coupling to a specific runtime implementation.

Skills are discovered from:
- **Local**: `<project>/.altos/skills/<name>/skill.json`
- **Global**: `~/.altos/skills/<name>/skill.json`
- **Built-in**: distributed with the `@altos/skills` package

## Skill Manifest (`skill.json`)

Every skill lives in its own directory and must contain a `skill.json` manifest:

```json
{
  "name": "code-review",
  "version": "1.0.0",
  "description": "Conduct a thorough code review of a diff.",
  "instructions": "You are an expert code reviewer...",
  "triggers": ["review", "code review"],
  "required_tools": ["grep", "find_files", "read_file"],
  "required_permissions": [{ "scope": "filesystem:read", "reason": "Read source files" }],
  "optional_memory": ["context?", "recent-changes?"],
  "examples": [
    {
      "description": "Review a pull request",
      "input": "review the current PR",
      "expected": "Structured findings report"
    }
  ],
  "hidden": false
}
```

### Fields

| Field | Required | Description |
|---|---|---|
| `name` | Yes | Unique skill identifier (kebab-case) |
| `version` | Yes | Semantic version (e.g. "1.0.0") |
| `instructions` | Yes | The core prompt/instructions injected when the skill is invoked |
| `description` | No | Human-readable description shown in `altos skill list` |
| `triggers` | No | Patterns that auto-invoke this skill |
| `required_tools` | No | Tools the skill needs to function |
| `required_permissions` | No | Permissions the skill declares it needs |
| `optional_memory` | No | Memory keys the skill may read (`key?` = read-only) |
| `examples` | No | Example inputs for documentation and testing |
| `hidden` | No | If `true`, skill is omitted from `altos skill list` |

## Creating a Skill

### Option 1: Use the scaffold command

```bash
altos create skill my-skill
```

This creates `.altos/skills/my-skill/skill.json` with a template manifest.

### Option 2: Manual creation

```bash
mkdir -p .altos/skills/my-skill
```

Then write `skill.json` manually.

### Option 3: Publish as a package

Skills can be bundled inside an [Altos package](./package-authoring.md). Add skill entries to the package's `altos-package.json`:

```json
{
  "skills": [
    {
      "name": "my-skill",
      "version": "1.0.0",
      "entry": "skills/my-skill"
    }
  ]
}
```

## Writing Good Instructions

The `instructions` field is the most important part of a skill. It should:

1. **Define the persona** — Who is the agent when acting as this skill?
2. **Specify the process** — What steps does the agent follow?
3. **Define the output format** — What should the result look like?
4. **State the rules** — What must/must not the agent do?

### Example: Instructions for a `docs-writer` skill

```json
{
  "instructions": "You are an expert technical writer. When asked to write documentation:\n\n1. Determine the audience and scope\n2. Gather context from the relevant code\n3. Write with: clarity over cleverness, specificity over vagueness\n4. Cover: normal case, errors, edge cases, and defaults\n5. Format with Markdown, code blocks with language hints\n\nReport format:\n## Docs Writer Report\n\n### Documents Created/Updated\n- [path] — [type]: description\n\n### Follow-up Needed\n- [Anything requiring further context or decisions]"
}
```

## Tool Requirements

Declare tools your skill needs in `required_tools`. The skill loader does not enforce these at load time, but agents can use this declaration to validate prerequisites before invoking a skill.

Tools are referenced by their registered name (e.g. `grep`, `find_files`, `bash`).

## Trigger Patterns

The `triggers` array defines patterns that auto-invoke the skill. When a user's message matches a trigger (fuzzy or substring match), the skill's instructions are prepended to the agent's context.

```json
{
  "triggers": ["fix test", "failing test", "test broke"]
}
```

A skill can also be invoked explicitly:

```bash
altos skill run test-fix
altos skill inspect code-review
```

## Examples

Examples serve three purposes:
1. Documentation for `altos skill inspect`
2. Test cases for skill validators
3. Guidance for agents learning the skill's expected behavior

```json
{
  "examples": [
    {
      "description": "Fix a single failing test",
      "input": "fix the failing test in src/auth/login.test.ts",
      "expected": "Test passes with a minimal, explained fix"
    }
  ]
}
```

## Distributing Skills

### As a local/global skill

Copy the skill directory to the appropriate location:
- Local: `<project>/.altos/skills/<name>/`
- Global: `~/.altos/skills/<name>/`

### As an npm package

Publish a package containing skill directories. Users install with:

```bash
npm install @myorg/altos-skills
```

The package should export skills via its `altos-package.json` manifest.

### As part of a plugin

Plugins can register skills at runtime via `api.registerSkill()`. See the [plugin authoring guide](../plugin-authoring/getting-started.md) for details.

## CLI Commands

| Command | Description |
|---|---|
| `altos skill list` | List all available skills |
| `altos skill inspect <name>` | Show full skill manifest and instructions |
| `altos skill run <name>` | Validate and display a skill's instructions |
| `altos create skill <name>` | Scaffold a new skill in `.altos/skills/` |

## See Also

- [Package Authoring](./package-authoring.md) — Bundling skills with plugins, prompts, themes
- [Plugin Authoring](../plugin-authoring/getting-started.md) — Runtime skill registration
