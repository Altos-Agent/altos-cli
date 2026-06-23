// @altos/web-dashboard - API client for local-api

import type {
  CloudSession,
  CloudTask,
  CloudWorker,
  CloudApprovalRequest,
  CloudArtifact,
  CloudEvent,
  ApprovalAction,
} from "./types.js";

const BASE = "http://localhost:3001/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}${body ? ": " + body : ""}`);
  }
  return res.json() as Promise<T>;
}

// ── Sessions ─────────────────────────────────────────────────────

export const api = {
  // Sessions
  listSessions: () => request<CloudSession[]>("/sessions"),

  getSession: (id: string) => request<CloudSession>(`/sessions/${id}`),

  createSession: (input: { prompt: string; cwd?: string }) =>
    request<CloudSession>("/sessions", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  patchSession: (id: string, patch: { status?: string }) =>
    request<CloudSession>(`/sessions/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),

  // Tasks
  listTasks: (sessionId?: string) =>
    request<CloudTask[]>(sessionId ? `/sessions/${sessionId}/tasks` : "/tasks"),

  // Approvals
  listApprovals: (sessionId?: string) =>
    request<CloudApprovalRequest[]>(sessionId ? `/sessions/${sessionId}/approvals` : "/approvals"),

  resolveApproval: (id: string, action: ApprovalAction, decidedBy?: string) =>
    request<CloudApprovalRequest>(`/approvals/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ action, decidedBy }),
    }),

  // Workers
  listWorkers: () => request<CloudWorker[]>("/workers"),

  // Artifacts
  listArtifacts: (sessionId: string) =>
    request<CloudArtifact[]>(`/sessions/${sessionId}/artifacts`),

  // Diffs
  getDiffs: (sessionId: string) =>
    request<{ sessionId: string; patches: CloudArtifact[] }>(
      `/diffs?sessionId=${encodeURIComponent(sessionId)}`,
    ),

  // Health
  health: () => request<{ status: string; mode: string }>("/health"),
};

// ── SSE event stream ─────────────────────────────────────────────

export function createSessionEventSource(
  sessionId: string,
  onEvent: (event: CloudEvent) => void,
  onError?: (err: Event) => void,
): { es: EventSource; unsubscribe: () => void } {
  const es = new EventSource(`http://localhost:3001/api/sessions/${sessionId}/events`);

  // Use generic addEventListener to avoid EventSourceEventMap type mismatch
  // Use generic addEventListener to avoid EventSourceEventMap type mismatch
  es.addEventListener("cloud_event", ((e: MessageEvent) => {
    try {
      const event = JSON.parse(e.data) as CloudEvent;
      onEvent(event);
    } catch {
      // ignore parse errors
    }
  }) as EventListener);

  es.addEventListener("error", (err) => {
    onError?.(err);
  });

  return {
    es,
    unsubscribe: () => {
      es.close();
    },
  };
}
