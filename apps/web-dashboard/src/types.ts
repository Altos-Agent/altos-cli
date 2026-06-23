// @altos/web-dashboard - Shared TypeScript types

export type CloudSessionStatus =
  | "created"
  | "assigned"
  | "running"
  | "waiting_for_approval"
  | "completed"
  | "failed";

export type CloudTaskStatus =
  | "queued"
  | "assigned"
  | "running"
  | "waiting_for_approval"
  | "completed"
  | "failed";

export type ApprovalStatus = "pending" | "approved" | "denied" | "expired";
export type ApprovalAction = "approve" | "deny" | "expire";
export type WorkerStatus = "idle" | "busy" | "disconnected";

export interface CloudTaskInput {
  prompt: string;
  cwd?: string;
  model?: string;
  provider?: string;
  skills?: string[];
  plugins?: string[];
  approvalMode?: "local" | "cloud";
}

export interface CloudSession {
  id: string;
  workerId?: string;
  status: CloudSessionStatus;
  createdAt: number;
  updatedAt: number;
  input: CloudTaskInput;
  result?: CloudTaskResult;
}

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

export interface CloudArtifact {
  id: string;
  sessionId: string;
  taskId: string;
  type: "patch" | "file" | "error" | "summary";
  path?: string;
  content?: string;
  patch?: string;
  summary?: string;
  createdAt: number;
}

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

export interface CloudTaskResult {
  success: boolean;
  summary?: string;
  artifacts?: string[];
  error?: string;
  duration: number;
}

// Dashboard state
export interface DashboardState {
  sessions: CloudSession[];
  approvals: CloudApprovalRequest[];
  workers: CloudWorker[];
  selectedSession: CloudSession | null;
  events: CloudEvent[];
}

// Session event parsed for display
export interface SessionEvent {
  id: string;
  type: "agent" | "tool" | "approval" | "diff" | "error" | "system";
  eventType: string;
  timestamp: number;
  payload: unknown;
  raw: CloudEvent;
}
