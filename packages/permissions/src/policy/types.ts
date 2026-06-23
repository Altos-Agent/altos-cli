// @altos/permissions - Policy types

// Permission decisions
export type PermissionDecision = "allow" | "ask" | "deny";

// Risk categories for operations
export type RiskCategory =
  | "read" // Reading files/data
  | "write" // Writing/modifying files
  | "execute" // Executing code or commands
  | "network" // Network access
  | "credential" // Access to credentials/secrets
  | "destructive" // Destructive operations (rm, etc.)
  | "remote" // Remote operations (git push, etc.)
  | "external_write"; // Writing to external systems

// Permission request from tools
export interface ToolPermissionRequest {
  toolName: string;
  riskCategory: RiskCategory;
  path?: string;
  pattern?: string;
  command?: string;
  args?: Record<string, unknown>;
  inputSummary: string;
  diff?: string;
  workspaceRoot?: string;
  timestamp: number;
  sessionId: string;
}

// Approval prompt shown to user
export interface ApprovalPrompt {
  request: ToolPermissionRequest;
  riskLevel: "low" | "medium" | "high" | "critical";
  policyDecision: PermissionDecision;
  reason: string;
  previousApprovals?: number;
}

// Policy rule
export interface PolicyRule {
  action: PermissionDecision;
  riskCategories?: RiskCategory[];
  toolNames?: string[];
  pathPattern?: string;
  commandPattern?: string;
  reason?: string;
}

// Full policy configuration
export interface PolicyConfig {
  version: string;
  rules: PolicyRule[];
  defaults: Partial<Record<RiskCategory, PermissionDecision>>;
  sessionTimeout?: number;
  maxSessionApprovals?: number;
}

// Policy container
export interface Policy {
  id: string;
  name: string;
  source: "default" | "global" | "project" | "session";
  rules: PolicyRule[];
  defaults: Partial<Record<RiskCategory, PermissionDecision>>;
}

// Audit log entry
export interface AuditEntry {
  id: string;
  timestamp: number;
  sessionId: string;
  request: ToolPermissionRequest;
  decision: PermissionDecision;
  approvalType: "once" | "session" | "denied";
  riskLevel: "low" | "medium" | "high" | "critical";
  reason: string;
  userAgent?: string;
  expiresAt?: number;
}

// Session-level approval
export interface SessionApproval {
  key: string; // hash of toolName + path pattern
  toolName: string;
  riskCategory: RiskCategory;
  decision: PermissionDecision;
  expiresAt: number;
  pathPattern?: string;
}

// Policy evaluation result
export interface PolicyResult {
  decision: PermissionDecision;
  riskLevel: "low" | "medium" | "high" | "critical";
  reason: string;
  matchedRule?: PolicyRule;
}
