// @altos/permissions - Permission system
// Permission decisions, risk categories, policy engine, and audit logging

// Core exports
export {
  PermissionManager,
  createPermissionManager,
  type ApprovalChoice,
} from "./manager/index.js";
export { AuditLogger } from "./audit/index.js";
export {
  PolicyEngine,
  createDefaultPolicy,
  mergePolicies,
  loadPolicyFromFile,
} from "./policy/engine.js";

// Policy types and constants
export type {
  PermissionDecision,
  RiskCategory,
  Policy,
  PolicyConfig,
  PolicyRule,
  PolicyResult,
  ToolPermissionRequest,
  ApprovalPrompt,
  AuditEntry,
  SessionApproval,
} from "./policy/types.js";

export {
  RICK_CATEGORIES,
  DANGEROUS_PATTERNS,
  SAFE_BASH_COMMANDS,
  DANGEROUS_BASH_COMMANDS,
  DEFAULT_POLICY_RULES,
} from "./policy/constants.js";

// Utility exports
export {
  normalizePathForPattern,
  isWithinWorkspace,
  getRelativePath,
  expandPath,
  createHash,
} from "./utils/path.js";
