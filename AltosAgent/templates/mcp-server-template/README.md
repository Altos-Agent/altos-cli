# {{name}} MCP Server

An MCP server for Altos.

## Installation

```bash
npm install @altos/mcp-server-{{name}}
```

## Usage

Add to your Altos MCP config:

```json
{
  "mcpServers": {
    "{{name}}": {
      "command": "npx",
      "args": ["mcp-server-{{name}}"]
    }
  }
}
```
