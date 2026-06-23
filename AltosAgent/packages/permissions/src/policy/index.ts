// @altos/permissions - Policy exports
export { PolicyEngine, createDefaultPolicy, mergePolicies, loadPolicyFromFile } from "./engine.js";
export {
  RICK_CATEGORIES,
  DANGEROUS_PATTERNS,
  SAFE_BASH_COMMANDS,
  DANGEROUS_BASH_COMMANDS,
  DEFAULT_POLICY_RULES,
} from "./constants.js";
export type {
  Policy,
  PolicyConfig,
  PolicyRule,
  PolicyResult,
  RiskCategory,
  PermissionDecision,
  ToolPermissionRequest,
  ApprovalPrompt,
  AuditEntry,
  SessionApproval,
} from "./types.js";
