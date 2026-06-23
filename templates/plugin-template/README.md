# {{name}}

{{description}}

## Installation

### Local (project-specific)
```bash
mkdir -p .altos/plugins/{{name}}
cp -r . .altos/plugins/{{name}}/
```

### Global
```bash
cp -r . ~/.altos/plugins/{{name}}/
```

### From npm
```bash
npm install @altos/plugin-{{name}}
```

## Permissions

Declare required permissions in `plugin.json`. Dangerous permissions require explicit user grant.

```bash
altos plugin grant {{name}} "hook:before_tool_call"
altos plugin inspect {{name}}
```

## Hooks

| Event | Description |
|-------|-------------|
| session_start | Fired when a session begins |
| user_prompt | Fired when user sends a message |
| before_model_call | Before model API call |
| after_model_call | After model API call |
| before_tool_call | Before tool execution |
| after_tool_call | After tool execution |
| before_file_write | Before file write |
| after_file_write | After file write |
| before_compact | Before session compaction |
| session_end | When session completes |

## Development

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm test
```
