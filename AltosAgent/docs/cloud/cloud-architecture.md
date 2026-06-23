# Cloud Architecture — Phase 14

## Design Principles

- **Local-first**: all cloud functionality is a progressive enhancement; local sessions work without any remote services
- **Opt-in**: nothing requires cloud infra; it must be explicitly started
- **Composable**: the same session can run locally, in a worker, or remotely without changing application code
- **Portable**: designed to work with a real hosted coordinator in the future without architectural changes

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                     Client (CLI)                        │
│                                                         │
│   altos serve              altos cloud status            │
│   altos cloud run          altos -p "question"          │
└──────────┬──────────────────────────────────────────────┘
           │ HTTP / WebSocket
           ▼
┌─────────────────────────────────────────────────────────┐
│               @altos/local-api (port 3001)             │
│                                                         │
│   GET  /api/sessions          — list sessions          │
│   POST /api/sessions          — create session          │
│   GET  /api/sessions/:id     — get session            │
│   GET  /api/sessions/:id/events — SSE event stream      │
│   PATCH /api/sessions/:id     — update status          │
│   GET  /api/sessions/:id/approvals — list approvals     │
│   PATCH /api/approvals/:id    — approve/deny           │
│   GET  /api/diffs?sessionId=  — get file diffs         │
│   WS   /ws?sessionId=         — WebSocket events        │
│                                                         │
│   LocalAPIServer ←→ LocalMockCloudRuntime (singleton)  │
└──────────────────────┬──────────────────────────────────┘
                       │ event stream
         ┌─────────────┴─────────────┐
         ▼                           ▼
┌──────────────────────┐  ┌────────────────────────────┐
│  @altos/cloud-worker │  │   @altos/core             │
│                      │  │   AgentRuntime (local)    │
│  polls for tasks     │  │                            │
│  runs AgentRuntime   │  │   sessions, events,       │
│  streams events      │  │   permissions             │
│  routes approvals    │  │                            │
└──────────────────────┘  └────────────────────────────┘
```

## Packages

### `packages/cloud`

The cloud type system and local mock runtime. This package has **zero external dependencies** and works entirely in-memory.

**Interfaces exported:**
- `CloudRuntime` — the main interface, implemented by `LocalMockCloudRuntime`
- `CloudSession` — session state with status, input, and result
- `CloudTask` — a unit of work dispatched to a worker
- `CloudWorker` — a registered worker with heartbeat
- `CloudArtifact` — output produced by a completed task
- `CloudApprovalRequest` — a pending permission request

**`LocalMockCloudRuntime`** — in-process implementation of `CloudRuntime`:
- Sessions and tasks stored in `Map`s
- Event subscription via callback registry
- Approval workflow with polling-based resolution
- `emitAgentEvent(sessionId, agentEvent)` — forwards agent events into the cloud event stream

**`HTTPCloudClient`** — connects to a remote coordinator (not yet implemented server-side). Translates `CloudRuntime` calls into HTTP requests and SSE subscriptions.

### `apps/local-api`

HTTP/WebSocket API server. Depends on `packages/cloud` and `@altos/core`.

**Endpoints:**
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check, returns `{ status, mode }` |
| GET | `/api/sessions` | List all sessions |
| POST | `/api/sessions` | Create a new session |
| GET | `/api/sessions/:id` | Get session by ID |
| PATCH | `/api/sessions/:id` | Update session status |
| GET | `/api/sessions/:id/events` | SSE event stream for a session |
| GET | `/api/sessions/:id/tasks` | List tasks for a session |
| GET | `/api/sessions/:id/approvals` | List approval requests for a session |
| GET | `/api/sessions/:id/artifacts` | List artifacts for a session |
| GET | `/api/tasks` | List all tasks |
| PATCH | `/api/tasks/:id` | Update task (complete/fail) |
| GET | `/api/approvals` | List all pending approvals |
| PATCH | `/api/approvals/:id` | Resolve an approval (approve/deny) |
| GET | `/api/workers` | List registered workers |
| GET | `/api/diffs?sessionId=` | Get file patches for a session |
| WS | `/ws?sessionId=` | WebSocket subscription for a session |

### `apps/cloud-worker`

A worker process that polls for queued tasks and executes them via `AgentRuntime`. It forwards all runtime events back to the coordinator via the shared `LocalMockCloudRuntime` singleton.

**Workflow:**
1. Worker starts → registers with coordinator via `CloudRuntime.registerWorker`
2. Polls `CloudRuntime.listTasks()` every 2 seconds for queued tasks
3. When a task is found: marks task as assigned, worker as busy, session as running
4. Creates `AgentRuntime` with a permission handler that creates `CloudApprovalRequest` entries and polls for resolution
5. Subscribes to runtime events via `addEventListener` and forwards them via `emitAgentEvent`
6. On completion, marks task completed, session completed, sets result

### `apps/cli` — new commands

- **`altos serve [--port 3001] [--host localhost]`** — starts the local API server
- **`altos cloud status`** — shows sessions, workers, pending approvals from the local runtime
- **`altos cloud run [--prompt <task>] [--cwd <path>] [--model <model>] [--provider <provider>]`** — creates a session and enqueues a task

## CloudRuntime Interface

```typescript
interface CloudRuntime {
  readonly mode: "local" | "cloud";
  readonly supportsRemote: boolean;

  // Session
  createSession(input: CloudTaskInput): Promise<CloudSession>;
  getSession(id: string): Promise<CloudSession | undefined>;
  listSessions(): Promise<CloudSession[]>;
  updateSessionStatus(id: string, status: CloudSessionStatus): Promise<void>;
  setSessionResult(id: string, result: CloudTaskResult): Promise<void>;

  // Task
  enqueueTask(sessionId: string): Promise<CloudTask>;
  getTask(id: string): Promise<CloudTask | undefined>;
  listTasks(sessionId?: string): Promise<CloudTask[]>;
  assignTask(taskId: string, workerId: string): Promise<void>;
  completeTask(taskId: string, result: { error?: string }): Promise<void>;

  // Worker
  registerWorker(info: Omit<CloudWorker, "startedAt" | "lastHeartbeat">): Promise<CloudWorker>;
  getWorker(id: string): Promise<CloudWorker | undefined>;
  listWorkers(): Promise<CloudWorker[]>;
  heartbeat(workerId: string): Promise<void>;
  setWorkerBusy(workerId: string, sessionId: string, taskId: string): Promise<void>;
  setWorkerIdle(workerId: string): Promise<void>;

  // Artifacts
  addArtifact(data: Omit<CloudArtifact, "id" | "createdAt">): Promise<CloudArtifact>;
  listArtifacts(sessionId: string): Promise<CloudArtifact[]>;

  // Approvals
  createApprovalRequest(req: {...}): Promise<CloudApprovalRequest>;
  getApprovalRequest(id: string): Promise<CloudApprovalRequest | undefined>;
  listApprovalRequests(sessionId?: string): Promise<CloudApprovalRequest[]>;
  resolveApproval(id: string, action: "approve" | "deny" | "expire", decidedBy?: string): Promise<void>;

  // Events
  subscribe(sessionId: string, callback: CloudEventCallback): () => void;
  emit(session: CloudSession, event: CloudEvent): void;
  emitAgentEvent(sessionId: string, agentEvent: unknown): void;
}
```

## Session Lifecycle

```
created → assigned → running ↔ waiting_for_approval → completed
                     ↘ failed
```

## Approval Workflow

```
Worker requests permission → creates CloudApprovalRequest(status=pending)
                          → polls getApprovalRequest() until status != pending
                          → if approved: continues; if denied: fails the tool call
```

The local API exposes approval requests via `GET /api/approvals` and `PATCH /api/approvals/:id` so a human operator can approve or deny from a separate terminal.

## Cloud-Ready Design Decisions

1. **No hosted requirement**: `LocalMockCloudRuntime` is the default; everything works in-process
2. **Event streaming is universal**: SSE (HTTP) and WebSocket both supported, allowing real clients or proxy infra
3. **Single runtime singleton**: `getLocalCloudRuntime()` is lazy and shared; worker and API server can both reference it
4. **Agent events are opaque to cloud layer**: `emitAgentEvent` wraps any `AgentEvent` in a `CloudEvent` without the cloud layer needing to know its structure
5. **Approval is a first-class primitive**: not a side-channel; the runtime explicitly creates `CloudApprovalRequest` records

## Future: Moving to a Hosted Coordinator

When a real hosted coordinator is deployed:

1. Replace `LocalMockCloudRuntime` with `HTTPCloudClient` pointing at the coordinator URL
2. Add auth: pass `apiKey` from config into `CloudCoordinatorConfig`
3. Add session persistence: replace in-memory `Map`s with a database
4. Worker discovery: workers register with a `coordinatorUrl` instead of using the local singleton

The `CloudRuntime` interface is the only contract that needs to be satisfied.
