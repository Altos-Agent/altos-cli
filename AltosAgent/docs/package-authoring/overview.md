# Package Authoring

## Overview

An Altos package is a distributable bundle that can contain plugins, skills, prompt templates, themes, MCP server configurations, and commands. Packages provide a way to share complete capabilities with other users or across projects.

## Package Manifest (`altos-package.json`)

Every package has a manifest at its root:

```json
{
  "name": "@myorg/altos-pack",
  "version": "1.0.0",
  "description": "A collection of code review and security skills",
  "author": "My Org",
  "keywords": ["altos", "code-review", "security"],
  "plugins": [],
  "skills": [],
  "prompts": [],
  "themes": [],
  "mcp": [],
  "permissions": []
}
```

### Fields

| Field | Required | Description |
|---|---|---|
| `name` | Yes | Package name. Optionally scoped (`@org/name`) |
| `version` | Yes | Semantic version |
| `description` | No | Human-readable description |
| `author` | No | Package author |
| `keywords` | No | Discovery keywords |
| `plugins` | No | Array of [PackagePlugin](#plugins) entries |
| `skills` | No | Array of [PackageSkill](#skills) entries |
| `prompts` | No | Array of [PackagePrompt](#prompts) entries |
| `themes` | No | Array of [PackageTheme](#themes) entries |
| `mcp` | No | Array of [PackageMcpConfig](#mcp-servers) entries |
| `permissions` | No | Package-level permission declarations |

## Creating a Package

### Option 1: Use the scaffold command

```bash
altos create package @myorg/my-pack
```

This creates `.altos/packages/@myorg/my-pack/` with a template `altos-package.json` and subdirectories.

### Option 2: Manual creation

```bash
mkdir -p .altos/packages/my-pack/{plugins,skills,prompts,themes}
```

Write `altos-package.json` at the root.

## Package Contents

### Plugins

Plugins bundled in a package are referenced by name and entry path:

```json
{
  "plugins": [
    {
      "name": "my-plugin",
      "version": "1.0.0",
      "description": "Custom linting rules",
      "entry": "plugins/my-plugin"
    }
  ]
}
```

The `entry` is a path relative to the package root, or an npm package name.

### Skills

```json
{
  "skills": [
    {
      "name": "my-skill",
      "version": "1.0.0",
      "description": "Custom analysis skill",
      "entry": "skills/my-skill"
    }
  ]
}
```

Each skill entry should contain a `skill.json` at the specified path.

### Prompts

Prompt templates are inline in the manifest:

```json
{
  "prompts": [
    {
      "name": "system-prompt-code-review",
      "description": "System prompt injected for code review sessions",
      "template": "You are a senior code reviewer. Focus on {{focus_area}}. Respond in {{format}}."
    }
  ]
}
```

Templates use `{{variable}}` substitution. Variables are resolved at runtime.

### Themes

```json
{
  "themes": [
    {
      "name": "dark-blue",
      "description": "A dark blue theme for the TUI",
      "entry": "themes/dark-blue"
    }
  ]
}
```

The `entry` points to a directory containing CSS or theme definition files.

### MCP Servers

```json
{
  "mcp": [
    {
      "name": "filesystem",
      "description": "Filesystem MCP server",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/workspace"]
    }
  ]
}
```

## Distributing Packages

### As a local package

Copy the package directory to:
- Local: `<project>/.altos/packages/<name>/`
- Global: `~/.altos/packages/<name>/`

### As an npm package

Publish to npm:

```bash
npm publish
```

Users install with:

```bash
altos package add npm:@myorg/altos-pack
```

### As a git package

```bash
altos package add git+https://github.com/myorg/altos-pack.git
```

## CLI Commands

| Command | Description |
|---|---|
| `altos package list` | List all installed packages |
| `altos package add <source>` | Install a package (path, git URL, or npm name) |
| `altos package inspect <name>` | Show full package manifest |
| `altos package remove <name>` | Uninstall a package |
| `altos create package <name>` | Scaffold a new package |

## See Also

- [Skill Authoring](./skill-authoring.md) — Writing skill manifests
- [Plugin Authoring](../plugin-authoring/getting-started.md) — Plugin development
