# Package Authoring: Getting Started

## Step-by-Step: Building Your First Package

This guide walks through creating a complete Altos package with skills, prompts, and MCP configurations.

### Step 1: Scaffold the package

```bash
altos create package @myorg/dev-toolkit
```

This creates:

```
.altos/packages/@myorg/dev-toolkit/
├── altos-package.json
├── plugins/
├── skills/
├── prompts/
└── themes/
```

### Step 2: Define the manifest

Edit `altos-package.json`:

```json
{
  "name": "@myorg/dev-toolkit",
  "version": "0.1.0",
  "description": "Developer productivity toolkit for code review and documentation",
  "author": "My Org",
  "keywords": ["altos", "productivity", "code-review", "docs"],
  "plugins": [],
  "skills": [
    {
      "name": "dev-docs",
      "version": "0.1.0",
      "description": "Generate developer documentation from code",
      "entry": "skills/dev-docs"
    }
  ],
  "prompts": [
    {
      "name": "system-dev",
      "description": "Developer mode system prompt",
      "template": "You are a developer assistant. Focus on: {{focus}}. Style: {{style}}."
    }
  ],
  "mcp": [],
  "permissions": [
    { "scope": "filesystem:read", "reason": "Read source files to generate docs" }
  ]
}
```

### Step 3: Add a skill

Create the skill directory and manifest:

```bash
mkdir -p .altos/packages/@myorg/dev-toolkit/skills/dev-docs
```

```json
// .altos/packages/@myorg/dev-toolkit/skills/dev-docs/skill.json
{
  "name": "dev-docs",
  "version": "0.1.0",
  "description": "Generate developer documentation from code",
  "instructions": "You are a technical documentation expert. When asked to generate developer documentation:\n\n1. Read the relevant source files\n2. Identify the public API surface (exported functions, classes, types)\n3. Write JSDoc comments for each exported item\n4. Generate a README section documenting the module purpose and usage\n5. Include code examples for non-trivial functions\n\nOutput format: Updated source files with documentation.",
  "required_tools": ["grep", "find_files", "read_file", "write_file"],
  "triggers": ["write docs", "document", "generate docs"],
  "examples": [
    {
      "description": "Generate docs for a module",
      "input": "document src/api/users.ts",
      "expected": "Updated file with JSDoc comments"
    }
  ]
}
```

### Step 4: Add a prompt template

Edit `altos-package.json` to add the prompt inline:

```json
{
  "prompts": [
    {
      "name": "system-dev",
      "description": "Developer mode system prompt",
      "template": "You are a developer assistant specializing in {{language}}. When asked to help with code:\n1. Read and understand the existing codebase\n2. Identify the relevant patterns already in use\n3. Write code consistent with those patterns\n4. Explain your changes clearly\n\nCurrent focus: {{focus}}"
    }
  ]
}
```

### Step 5: Install and test

```bash
# Install the local package
altos package add ./.altos/packages/@myorg/dev-toolkit

# List packages to verify
altos package list

# Inspect the package
altos package inspect @myorg/dev-toolkit
```

### Step 6: Publish

```bash
# Publish to npm (requires login)
npm publish --access public

# Or install directly from git
altos package add git+https://github.com/myorg/altos-dev-toolkit.git
```

## Package Structure Reference

```
my-package/
├── altos-package.json     # Package manifest (REQUIRED)
├── README.md              # Package documentation
├── CHANGELOG.md           # Version history
├── plugins/               # Bundled plugin directories
│   └── my-plugin/
│       └── plugin.json
├── skills/                # Skill directories
│   └── my-skill/
│       └── skill.json
├── prompts/               # Prompt template files (optional)
│   └── my-prompt.md
└── themes/                # Theme directories (optional)
    └── my-theme/
        └── theme.css
```

## Permission Scopes

Declare the permissions your package needs:

```json
{
  "permissions": [
    { "scope": "filesystem:read", "reason": "Read source to analyze" },
    { "scope": "filesystem:write", "reason": "Write generated docs" },
    { "scope": "network", "reason": "Fetch dependency metadata" }
  ]
}
```

Users will be prompted to grant these permissions when the package is first installed.

## Validating a Package

Before publishing, validate your package structure:

```bash
# Inspect will show any manifest errors
altos package inspect @myorg/my-package
```

Ensure:
- `name` and `version` are set in `altos-package.json`
- All `entry` paths exist relative to the package root
- All skill manifests have `name`, `version`, and `instructions`
- Prompt templates have valid `{{variable}}` syntax

## Migrating from v0 to v1

If you published a package before the manifest format was finalized, update your `altos-package.json`:

| Old field | New location |
|---|---|
| `plugins[]` entries with `manifest` | `plugins[].entry` (path to plugin dir) |
| Inline skills | `skills[].entry` pointing to skill dir |
| N/A | New: `prompts`, `themes`, `mcp` arrays |
