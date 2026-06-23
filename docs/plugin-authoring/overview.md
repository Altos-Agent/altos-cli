# Plugin Authoring

## Overview

Plugins extend Altos by providing tools, hooks, and capabilities.

## Plugin Interface

```typescript
interface Plugin {
  name: string;
  version: string;
  description?: string;
  init(ctx: PluginContext): Promise<void> | void;
  dispose(): Promise<void> | void;
  tools?: Tool[];
  hooks?: PluginHook[];
}
```

## Creating a Plugin

1. Use `pnpm create-plugin` to scaffold
2. Implement the `Plugin` interface
3. Export from your package's `src/index.ts`
4. Publish to npm or local path

## Plugin Context

The init function receives a `PluginContext` with:
- `config` — Plugin configuration
- `logger` — Logger instance
- `registerTool` — Register tools
- `registerHook` — Register lifecycle hooks

## See Also

- [Skill Authoring](../skill-authoring/overview.md)
- [SDK Reference](../references/sdk.md)
