// @altos/cloud - Cloud infrastructure interfaces and local mock runtime
// Optional cloud layer: all cloud functionality is a progressive enhancement
// that does not affect local-only operation.

// =============================================================================
// CloudSession — a session that can run locally or on a remote worker
// =============================================================================

export type CloudSessionStatus =
  | "created"
  | "assigned"
  | "running"
  | "waiting_for_approval"
  | "completed"
  | "failed";

export interface CloudSession {
  id: string;
  workerId?: string;
  status: CloudSessionStatus;
  createdAt: number;
  updatedAt: number;
  input: CloudTaskInput;
  result?: CloudTaskResult;
}

/**
 * Input required to start a cloud task.
 */
export interface CloudTaskInput {
  prompt: string;
  cwd?: string;
  model?: string;
  provider?: string;
  skills?: string[];
  plugins?: string[];
  approvalMode?: "local" | "cloud";
}

// =============================================================================
// CloudTask — a unit of work dispatched to a worker
// =============================================================================

export type CloudTaskStatus =
  | "queued"
  | "assigned"
  | "running"
  | "waiting_for_approval"
  | "completed"
  | "failed";

export interface CloudTask {
  id: string;
  sessionId: string;
  workerId?: string;
  status: CloudTaskStatus;
  queuedAt: number;
  startedAt?: number;
  completedAt?: number;
  error?: string;
}

// =============================================================================
// CloudWorker — a remote execution worker
// =============================================================================

export type WorkerStatus = "idle" | "busy" | "disconnected";

export interface CloudWorker {
  id: string;
  name: string;
  status: WorkerStatus;
  currentSessionId?: string;
  currentTaskId?: string;
  startedAt: number;
  lastHeartbeat: number;
  capabilities: string[];
}

// =============================================================================
// CloudArtifact — output from a completed task
// =============================================================================

export type ArtifactType = "patch" | "file" | "error" | "summary";

export interface CloudArtifact {
  id: string;
  sessionId: string;
  taskId: string;
  type: ArtifactType;
  path?: string;
  content?: string;
  patch?: string;
  summary?: string;
  createdAt: number;
}

// =============================================================================
// CloudApprovalRequest — a permission request needing decision
// =============================================================================

export type ApprovalStatus = "pending" | "approved" | "denied" | "expired";
export type ApprovalAction = "approve" | "deny" | "expire";

export interface CloudApprovalRequest {
  id: string;
  sessionId: string;
  taskId: string;
  permission: string;
  reason?: string;
  toolCallId: string;
  status: ApprovalStatus;
  createdAt: number;
  expiresAt: number;
  decidedAt?: number;
  decidedBy?: string;
}

// =============================================================================
// CloudRuntime — the main interface for cloud operations
// =============================================================================

export type CloudMode = "local" | "cloud";

export interface CloudRuntime {
  readonly mode: CloudMode;
  readonly supportsRemote: boolean;

  // Session management
  createSession(input: CloudTaskInput): Promise<CloudSession>;
  getSession(id: string): Promise<CloudSession | undefined>;
  listSessions(): Promise<CloudSession[]>;
  updateSessionStatus(id: string, status: CloudSessionStatus): Promise<void>;
  setSessionResult(id: string, result: CloudTaskResult): Promise<void>;

  // Task management
  enqueueTask(sessionId: string): Promise<CloudTask>;
  getTask(id: string): Promise<CloudTask | undefined>;
  listTasks(sessionId?: string): Promise<CloudTask[]>;
  assignTask(taskId: string, workerId: string): Promise<void>;
  completeTask(taskId: string, result: { error?: string }): Promise<void>;

  // Worker management
  registerWorker(worker: Omit<CloudWorker, "startedAt" | "lastHeartbeat">): Promise<CloudWorker>;
  getWorker(id: string): Promise<CloudWorker | undefined>;
  listWorkers(): Promise<CloudWorker[]>;
  heartbeat(workerId: string): Promise<void>;
  setWorkerBusy(workerId: string, sessionId: string, taskId: string): Promise<void>;
  setWorkerIdle(workerId: string): Promise<void>;

  // Artifact management
  addArtifact(artifact: Omit<CloudArtifact, "id" | "createdAt">): Promise<CloudArtifact>;
  listArtifacts(sessionId: string): Promise<CloudArtifact[]>;

  // Approval workflow
  createApprovalRequest(req: {
    sessionId: string;
    taskId: string;
    permission: string;
    reason?: string;
    toolCallId: string;
  }): Promise<CloudApprovalRequest>;
  getApprovalRequest(id: string): Promise<CloudApprovalRequest | undefined>;
  listApprovalRequests(sessionId?: string): Promise<CloudApprovalRequest[]>;
  resolveApproval(id: string, action: ApprovalAction, decidedBy?: string): Promise<void>;

  // Event streaming
  subscribe(sessionId: string, callback: CloudEventCallback): () => void;
  emit(session: CloudSession, event: CloudEvent): void;
  emitAgentEvent(sessionId: string, agentEvent: unknown): void;
}

export type CloudEventCallback = (event: CloudEvent) => void;

export type CloudEventType =
  | "session:created"
  | "session:updated"
  | "session:completed"
  | "task:queued"
  | "task:assigned"
  | "task:started"
  | "task:completed"
  | "task:failed"
  | "worker:registered"
  | "worker:heartbeat"
  | "worker:busy"
  | "worker:idle"
  | "approval:created"
  | "approval:resolved"
  | "artifact:created"
  | "event:agent";

export interface CloudEvent {
  id: string;
  sessionId: string;
  type: CloudEventType;
  timestamp: number;
  payload: unknown;
}

// =============================================================================
// Task result structure
// =============================================================================

export interface CloudTaskResult {
  success: boolean;
  summary?: string;
  artifacts?: string[]; // artifact IDs
  error?: string;
  duration: number;
}

// =============================================================================
// Local mock implementation — no external services required
// =============================================================================

import { randomUUID } from "crypto";

function createCloudEvent(sessionId: string, type: CloudEventType, payload: unknown): CloudEvent {
  return {
    id: randomUUID(),
    sessionId,
    type,
    timestamp: Date.now(),
    payload,
  };
}

/**
 * LocalMockCloudRuntime — an in-memory cloud runtime for local development
 * and single-machine usage. All sessions run in the same process via
 * AgentRuntime but are tracked as if they were remote.
 */
export class LocalMockCloudRuntime implements CloudRuntime {
  readonly mode: CloudMode = "local";
  readonly supportsRemote = true;

  private sessions = new Map<string, CloudSession>();
  private tasks = new Map<string, CloudTask>();
  private workers = new Map<string, CloudWorker>();
  private artifacts = new Map<string, CloudArtifact>();
  private approvals = new Map<string, CloudApprovalRequest>();
  private listeners = new Map<string, Set<CloudEventCallback>>();

  async createSession(input: CloudTaskInput): Promise<CloudSession> {
    const session: CloudSession = {
      id: randomUUID(),
      status: "created",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      input,
    };
    this.sessions.set(session.id, session);
    this.emit(session, createCloudEvent(session.id, "session:created", { input }));
    return session;
  }

  async getSession(id: string): Promise<CloudSession | undefined> {
    return this.sessions.get(id);
  }

  async listSessions(): Promise<CloudSession[]> {
    return Array.from(this.sessions.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  async updateSessionStatus(id: string, status: CloudSessionStatus): Promise<void> {
    const session = this.sessions.get(id);
    if (!session) return;
    session.status = status;
    session.updatedAt = Date.now();
    this.emit(session, createCloudEvent(id, "session:updated", { status }));
  }

  async setSessionResult(id: string, result: CloudTaskResult): Promise<void> {
    const session = this.sessions.get(id);
    if (!session) return;
    session.result = result;
    session.updatedAt = Date.now();
    this.emit(session, createCloudEvent(id, "session:completed", { result }));
  }

  async enqueueTask(sessionId: string): Promise<CloudTask> {
    const task: CloudTask = {
      id: randomUUID(),
      sessionId,
      status: "queued",
      queuedAt: Date.now(),
    };
    this.tasks.set(task.id, task);
    const session = this.sessions.get(sessionId);
    if (session) {
      this.emit(session, createCloudEvent(sessionId, "task:queued", { taskId: task.id }));
    }
    return task;
  }

  async getTask(id: string): Promise<CloudTask | undefined> {
    return this.tasks.get(id);
  }

  async listTasks(sessionId?: string): Promise<CloudTask[]> {
    const all = Array.from(this.tasks.values());
    return sessionId ? all.filter((t) => t.sessionId === sessionId) : all;
  }

  async assignTask(taskId: string, workerId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) return;
    task.status = "assigned";
    task.workerId = workerId;
    const session = this.sessions.get(task.sessionId);
    if (session) {
      this.emit(session, createCloudEvent(session.id, "task:assigned", { taskId, workerId }));
    }
  }

  async completeTask(taskId: string, result: { error?: string }): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) return;
    task.status = result.error ? "failed" : "completed";
    task.completedAt = Date.now();
    if (result.error) task.error = result.error;
    const session = this.sessions.get(task.sessionId);
    if (session) {
      const evType = result.error ? "task:failed" : "task:completed";
      this.emit(session, createCloudEvent(session.id, evType, { taskId, error: result.error }));
    }
  }

  async registerWorker(
    info: Omit<CloudWorker, "startedAt" | "lastHeartbeat">,
  ): Promise<CloudWorker> {
    const worker: CloudWorker = {
      ...info,
      startedAt: Date.now(),
      lastHeartbeat: Date.now(),
    };
    this.workers.set(worker.id, worker);
    return worker;
  }

  async getWorker(id: string): Promise<CloudWorker | undefined> {
    return this.workers.get(id);
  }

  async listWorkers(): Promise<CloudWorker[]> {
    return Array.from(this.workers.values());
  }

  async heartbeat(workerId: string): Promise<void> {
    const worker = this.workers.get(workerId);
    if (!worker) return;
    worker.lastHeartbeat = Date.now();
    const session = worker.currentSessionId
      ? this.sessions.get(worker.currentSessionId)
      : undefined;
    if (session) {
      this.emit(session, createCloudEvent(session.id, "worker:heartbeat", { workerId }));
    }
  }

  async setWorkerBusy(workerId: string, sessionId: string, taskId: string): Promise<void> {
    const worker = this.workers.get(workerId);
    if (!worker) return;
    worker.status = "busy";
    worker.currentSessionId = sessionId;
    worker.currentTaskId = taskId;
    const session = this.sessions.get(sessionId);
    if (session) {
      this.emit(session, createCloudEvent(sessionId, "worker:busy", { workerId }));
    }
  }

  async setWorkerIdle(workerId: string): Promise<void> {
    const worker = this.workers.get(workerId);
    if (!worker) return;
    worker.status = "idle";
    worker.currentSessionId = undefined;
    worker.currentTaskId = undefined;
  }

  async addArtifact(data: Omit<CloudArtifact, "id" | "createdAt">): Promise<CloudArtifact> {
    const artifact: CloudArtifact = {
      ...data,
      id: randomUUID(),
      createdAt: Date.now(),
    };
    this.artifacts.set(artifact.id, artifact);
    const session = this.sessions.get(data.sessionId);
    if (session) {
      this.emit(session, createCloudEvent(data.sessionId, "artifact:created", artifact));
    }
    return artifact;
  }

  async listArtifacts(sessionId: string): Promise<CloudArtifact[]> {
    return Array.from(this.artifacts.values()).filter((a) => a.sessionId === sessionId);
  }

  async createApprovalRequest(req: {
    sessionId: string;
    taskId: string;
    permission: string;
    reason?: string;
    toolCallId: string;
  }): Promise<CloudApprovalRequest> {
    const approval: CloudApprovalRequest = {
      id: randomUUID(),
      ...req,
      status: "pending",
      createdAt: Date.now(),
      expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
    };
    this.approvals.set(approval.id, approval);
    const session = this.sessions.get(req.sessionId);
    if (session) {
      this.emit(session, createCloudEvent(req.sessionId, "approval:created", approval));
    }
    return approval;
  }

  async getApprovalRequest(id: string): Promise<CloudApprovalRequest | undefined> {
    return this.approvals.get(id);
  }

  async listApprovalRequests(sessionId?: string): Promise<CloudApprovalRequest[]> {
    const all = Array.from(this.approvals.values());
    return sessionId ? all.filter((a) => a.sessionId === sessionId) : all;
  }

  async resolveApproval(id: string, action: ApprovalAction, decidedBy?: string): Promise<void> {
    const approval = this.approvals.get(id);
    if (!approval) return;
    approval.status =
      action === "expire"
        ? "expired"
        : action === "approve"
          ? "approved"
          : action === "deny"
            ? "denied"
            : action;
    approval.decidedAt = Date.now();
    approval.decidedBy = decidedBy;
    const session = this.sessions.get(approval.sessionId);
    if (session) {
      this.emit(
        session,
        createCloudEvent(approval.sessionId, "approval:resolved", {
          id,
          action: approval.status,
          decidedBy,
        }),
      );
    }
  }

  subscribe(sessionId: string, callback: CloudEventCallback): () => void {
    if (!this.listeners.has(sessionId)) {
      this.listeners.set(sessionId, new Set());
    }
    this.listeners.get(sessionId)!.add(callback);
    return () => {
      this.listeners.get(sessionId)?.delete(callback);
    };
  }

  emit(session: CloudSession, event: CloudEvent): void {
    const subs = this.listeners.get(session.id);
    if (subs) {
      for (const cb of subs) {
        try {
          cb(event);
        } catch {
          // ignore listener errors
        }
      }
    }
  }

  // --- Passthrough: forward an agent event into the cloud event stream ---
  emitAgentEvent(sessionId: string, agentEvent: unknown): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      this.emit(session, createCloudEvent(sessionId, "event:agent", agentEvent));
    }
  }
}

/**
 * Singleton instance of the local mock cloud runtime.
 * Guarded by a lazy initializer so it is only created when first accessed.
 */
let _localRuntime: LocalMockCloudRuntime | undefined;

export function getLocalCloudRuntime(): CloudRuntime {
  if (!_localRuntime) {
    _localRuntime = new LocalMockCloudRuntime();
  }
  return _localRuntime;
}

// =============================================================================
// HTTP Cloud Client — for connecting to a remote cloud coordinator
// =============================================================================

export interface CloudCoordinatorConfig {
  endpoint: string;
  apiKey?: string;
  orgId?: string;
}

/**
 * HTTPCloudClient connects to a remote CloudCoordinator (e.g. the local-api
 * server) and translates CloudRuntime calls into HTTP/WS requests.
 *
 * This is the client counterpart to LocalCloudRuntime running in a worker.
 */
export class HTTPCloudClient {
  constructor(private config: CloudCoordinatorConfig) {}

  private url(path: string) {
    return `${this.config.endpoint}${path}`;
  }

  async createSession(input: CloudTaskInput): Promise<CloudSession> {
    const res = await fetch(this.url("/api/sessions"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}),
      },
      body: JSON.stringify(input),
    });
    if (!res.ok) throw new Error(`Failed to create session: ${res.statusText}`);
    return res.json() as Promise<CloudSession>;
  }

  async getSession(id: string): Promise<CloudSession | undefined> {
    const res = await fetch(this.url(`/api/sessions/${id}`), {
      headers: this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {},
    });
    if (res.status === 404) return undefined;
    if (!res.ok) throw new Error(`Failed to get session: ${res.statusText}`);
    return res.json() as Promise<CloudSession | undefined>;
  }

  async listSessions(): Promise<CloudSession[]> {
    const res = await fetch(this.url("/api/sessions"), {
      headers: this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {},
    });
    if (!res.ok) throw new Error(`Failed to list sessions: ${res.statusText}`);
    return res.json() as Promise<CloudSession[]>;
  }

  async listTasks(sessionId?: string): Promise<CloudTask[]> {
    const url = sessionId ? this.url(`/api/sessions/${sessionId}/tasks`) : this.url("/api/tasks");
    const res = await fetch(url, {
      headers: this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {},
    });
    if (!res.ok) throw new Error(`Failed to list tasks: ${res.statusText}`);
    return res.json() as Promise<CloudTask[]>;
  }

  async resolveApproval(id: string, action: ApprovalAction, decidedBy?: string): Promise<void> {
    const res = await fetch(this.url(`/api/approvals/${id}`), {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}),
      },
      body: JSON.stringify({ action, decidedBy }),
    });
    if (!res.ok) throw new Error(`Failed to resolve approval: ${res.statusText}`);
  }

  async listApprovals(sessionId?: string): Promise<CloudApprovalRequest[]> {
    const url = sessionId
      ? this.url(`/api/sessions/${sessionId}/approvals`)
      : this.url("/api/approvals");
    const res = await fetch(url, {
      headers: this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {},
    });
    if (!res.ok) throw new Error(`Failed to list approvals: ${res.statusText}`);
    return res.json() as Promise<CloudApprovalRequest[]>;
  }

  /**
   * Subscribe to session events via Server-Sent Events (SSE).
   */
  subscribeSSE(sessionId: string, onEvent: CloudEventCallback): () => void {
    const es = new EventSource(`${this.url(`/api/sessions/${sessionId}/events`)}`);
    es.addEventListener("cloud_event", (e) => {
      try {
        onEvent(JSON.parse((e as MessageEvent).data) as CloudEvent);
      } catch {
        // ignore parse errors
      }
    });
    return () => es.close();
  }
}
