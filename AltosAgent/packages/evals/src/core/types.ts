// EvalCase — input to the evaluation system
export interface EvalCase {
  id: string;
  name: string;
  description: string;
  prompt: string;
  fixtureRepo?: string; // path to fixture repo on disk
  timeoutMs: number; // max allowed duration (default: 120000)
  expected: ExpectedOutcome;
  mocks?: ToolMock[];
}

// ExpectedOutcome — what the scenario expects to happen
export interface ExpectedOutcome {
  toolsUsed?: string[]; // tools that should have been called
  toolsNotUsed?: string[]; // tools that should NOT have been called
  filesChanged?: string[]; // file paths that should be modified
  permissionDenied?: boolean; // whether a permission was denied
  dangerousRefused?: boolean; // whether dangerous commands were refused
  messagesCount?: { min?: number; max?: number };
  containsMessage?: string; // assistant output should contain this substring
  errorContains?: string; // if session errors, error should contain this
}

// ToolMock — override a tool's behavior during evaluation
export interface ToolMock {
  toolName: string;
  response?: unknown; // return this response instead of real
  error?: string; // throw this error instead of real
  delayMs?: number; // artificially delay the response
}

// EvalResult — output from running an evaluation
export interface EvalResult {
  caseId: string;
  passed: boolean;
  score: number; // 0–100
  durationMs: number;
  tokenUsage?: TokenUsage;
  runtimeErrors: string[]; // uncaught exceptions during session
  toolErrors: ToolError[];
  permissionEvents: PermissionEvent[];
  outcomeDiff: OutcomeDiff;
  sessionId?: string; // stored session ID for replay
}

// TokenUsage — input/output token counts
export interface TokenUsage {
  input: number;
  output: number;
}

// ToolError — a tool call that failed
export interface ToolError {
  toolName: string;
  error: string;
  at: string; // ISO timestamp
}

// PermissionEvent — a permission request and its decision
export interface PermissionEvent {
  toolName: string;
  riskLevel: string;
  granted: boolean;
  reason?: string;
  at: string;
}

// OutcomeDiff — diff between expected and actual outcome
export interface OutcomeDiff {
  missingTools: string[];
  extraTools: string[];
  missingFiles: string[];
  extraFiles: string[];
  unexpectedPermissionDenial: boolean;
  unexpectedPermissionGrant: boolean;
  unexpectedDangerousRefusal: boolean;
  messageCountOutOfRange: boolean;
}

// RecordedEvent — a single event from a recorded session
export interface RecordedEvent {
  type: string;
  ts: string;
  [key: string]: unknown;
}

// SessionMetadata — metadata for a recorded session
export interface SessionMetadata {
  sessionId: string;
  cwd: string;
  modelConfig: { model?: string; provider?: string };
  createdAt: string;
  completedAt?: string;
  outcome: "success" | "failed" | "error";
  durationMs: number;
  tokenUsage?: TokenUsage;
  permissionsRequested: number;
  permissionsDenied: number;
}

// RecordedSession — a full recorded session (metadata + events)
export interface RecordedSession {
  sessionId: string;
  metadata: SessionMetadata;
  events: RecordedEvent[];
}

// SessionSummary — summary for session listing
export interface SessionSummary {
  sessionId: string;
  createdAt: string;
  outcome: string;
  durationMs: number;
}
