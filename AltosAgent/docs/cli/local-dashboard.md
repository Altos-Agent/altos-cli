# Local Dashboard

Web-based monitoring dashboard for Altos agents, served at `http://localhost:3002`.

## Requirements

- [Local API server](./local-api.md) must be running on port `3001`
- Node.js 18+

## Quick Start

```bash
# Start the local API first (port 3001)
cd apps/local-api && pnpm dev

# In another terminal, start the dashboard (port 3002)
cd apps/web-dashboard && pnpm dev
```

Then open `http://localhost:3002` in your browser.

## Pages

| Route | Description |
|---|---|
| `/sessions` | List of all active and recent sessions |
| `/sessions/:id` | Detailed view of a single session |
| `/tools` | Built-in tool inventory |
| `/plugins` | Plugin management |
| `/skills` | Available skill packages |
| `/mcp` | MCP server status |
| `/memory` | Memory usage and context stats |
| `/settings` | Dashboard configuration |

## Session Detail View

The session detail page shows:

- **Prompt** — the original user prompt
- **Timeline** — chronological event stream with types:
  - `agent` — user prompts and assistant responses
  - `tool` — tool calls and their status
  - `approval` — permission requests
  - `diff` — file patches and artifacts
  - `error` — error events
- **Session Info** — status, timestamps, model, provider
- **Pending Approvals** — approve once / approve for session / deny
- **Result** — summary, duration, and cost/token usage when available

## Approval Actions

When an agent requests permission (e.g. to write a file), an approval card appears in the session detail sidebar:

- **Approve once** — allows this single tool call
- **Approve for session** — grants blanket approval for the rest of this session
- **Deny** — blocks this tool call

## Configuration

Dashboard settings are stored in memory (no persistence yet):

| Setting | Default | Description |
|---|---|---|
| Local API URL | `http://localhost:3001/api` | Base URL for local-api |
| Refresh Interval | `3000ms` | Polling interval for live session updates |

## Architecture

```
┌─────────────────────────────────────────────┐
│  Browser (web-dashboard, port 3002)          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │  router  │  │  API     │  │  UI      │  │
│  │ (hash)   │  │ client   │  │ components  │
│  └──────────┘  └──────────┘  └──────────┘  │
│         ↕ fetch / SSE                        │
└──────────────┬──────────────────────────────┘
               │ HTTP
┌──────────────▼──────────────────────────────┐
│  Local API (local-api, port 3001)            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │  HTTP    │  │  WebSocket│  │  Cloud   │  │
│  │  routes  │  │  / SSE   │  │  Runtime │  │
│  └──────────┘  └──────────┘  └──────────┘  │
└─────────────────────────────────────────────┘
```

## Build

```bash
cd apps/web-dashboard
pnpm install
pnpm build        # production build → dist/
pnpm dev          # development server
pnpm preview      # preview production build
```

## Known Limitations

- Dashboard does not yet persist user preferences
- MCP page shows static data (read from running MCP servers at startup)
- Memory page shows simulated data (actual memory tracking not yet wired up)
- Cost/token usage display requires agent to report usage to cloud runtime