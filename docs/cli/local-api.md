# Local API Server

The Altos Local API server (`@altos/local-api`) provides HTTP and WebSocket APIs for managing Altos sessions locally. It is the coordination layer for cloud-enabled features when running in local mode.

## Requirements

- Node.js 20+
- `@altos/local-api` must be built (`pnpm build`)

## Starting the Server

```bash
# From the altos-cli project
pnpm --filter @altos/local-api start

# Or via the bin entry point
node apps/local-api/bin/server.js
```

The server starts on `http://localhost:3001` by default.

## Configuration

```typescript
import { LocalAPIServer } from "@altos/local-api";

const server = new LocalAPIServer({
  port: 3001,         // API server port (default: 3001)
  host: "localhost",  // bind host (default: localhost)
});
```

## REST API Endpoints

### Health Check

```
GET /api/health
```

Returns server status.

```json
{ "status": "ok", "mode": "local" }
```

### Sessions

```
GET    /api/sessions
POST   /api/sessions
GET    /api/sessions/:id
PATCH  /api/sessions/:id
```

**Create session:**
```bash
curl -X POST http://localhost:3001/api/sessions \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Analyze this codebase", "cwd": "/path/to/project"}'
```

**List sessions:**
```bash
curl http://localhost:3001/api/sessions
```

**Get session:**
```bash
curl http://localhost:3001/api/sessions/:id
```

**Update session status:**
```bash
curl -X PATCH http://localhost:3001/api/sessions/:id \
  -H "Content-Type: application/json" \
  -d '{"status": "completed"}'
```

### Tasks

```
GET    /api/tasks
GET    /api/sessions/:id/tasks
PATCH  /api/tasks/:id
```

### Approvals

```
GET    /api/approvals
GET    /api/sessions/:id/approvals
PATCH  /api/approvals/:id
```

Resolve an approval:
```bash
curl -X PATCH http://localhost:3001/api/approvals/:id \
  -H "Content-Type: application/json" \
  -d '{"action": "approve", "decidedBy": "user@example.com"}'
```

### Workers

```
GET /api/workers
```

### Events (SSE)

```
GET /api/sessions/:id/events
```

Subscribe to session events via Server-Sent Events:
```bash
curl -N http://localhost:3001/api/sessions/:id/events
```

### Diff / Artifacts

```
GET /api/diffs?sessionId=:id
GET /api/sessions/:id/artifacts
```

## WebSocket API

Connect to `ws://localhost:3001/ws?sessionId=:id` for real-time event streaming.

### Subscribe message

```json
{
  "type": "subscribe",
  "sessionId": "session-uuid"
}
```

After subscribing, the server sends all cloud events for the session as JSON.

## Architecture

The Local API server uses `@altos/cloud`'s `LocalMockCloudRuntime` as its session backend. All sessions run in the same process via `AgentRuntime` but are tracked as if they were remote, enabling cloud feature development without remote infrastructure.

## See Also

- [Local Dashboard](./local-dashboard.md)
- [Cloud Architecture](../cloud/cloud-architecture.md)
- [Cloud Overview](../cloud/overview.md)
