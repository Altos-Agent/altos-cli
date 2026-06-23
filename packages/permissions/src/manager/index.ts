// @altos/permissions - Permission manager with approval flow

import * as readline from "readline";
import type {
  PolicyResult,
  ToolPermissionRequest,
  ApprovalPrompt,
  PermissionDecision,
  SessionApproval,
  AuditEntry,
} from "../policy/types.js";
import { PolicyEngine } from "../policy/engine.js";
import { AuditLogger } from "../audit/index.js";
import { createHash } from "../utils/path.js";

// Approval choice from user
export type ApprovalChoice = "allow_once" | "allow_session" | "deny";

/**
 * Permission manager - orchestrates policy evaluation, approval flow, and audit logging
 */
export class PermissionManager {
  private policyEngine: PolicyEngine;
  private auditLogger: AuditLogger;
  private sessionApprovals: Map<string, SessionApproval> = new Map();
  private sessionTimeout: number;
  private maxSessionApprovals: number;
  private sessionApprovalCount: number = 0;

  constructor(options?: {
    policyEngine?: PolicyEngine;
    auditLogger?: AuditLogger;
    sessionTimeout?: number;
    maxSessionApprovals?: number;
  }) {
    this.policyEngine = options?.policyEngine || new PolicyEngine();
    this.auditLogger = options?.auditLogger || new AuditLogger();
    this.sessionTimeout = options?.sessionTimeout || 30 * 60 * 1000; // 30 minutes
    this.maxSessionApprovals = options?.maxSessionApprovals || 100;

    // Clean up expired approvals periodically
    setInterval(() => this.cleanupExpiredApprovals(), 60000);
  }

  /**
   * Load policies from standard locations
   */
  async loadPolicies(): Promise<void> {
    await this.policyEngine.loadStandardPolicies();
  }

  /**
   * Add a custom policy
   */
  addPolicy(policy: Parameters<typeof this.policyEngine.addPolicy>[0]): void {
    this.policyEngine.addPolicy(policy);
  }

  /**
   * Check if a request is already approved in the session
   */
  private getSessionApproval(request: ToolPermissionRequest): SessionApproval | null {
    const key = this.getApprovalKey(request);
    const approval = this.sessionApprovals.get(key);

    if (!approval) {
      return null;
    }

    // Check if expired
    if (approval.expiresAt < Date.now()) {
      this.sessionApprovals.delete(key);
      return null;
    }

    return approval;
  }

  /**
   * Generate approval key for a request
   */
  private getApprovalKey(request: ToolPermissionRequest): string {
    const parts = [
      request.toolName,
      request.riskCategory,
      request.path || "",
      request.pattern || "",
    ];
    return createHash(...parts);
  }

  /**
   * Store a session approval
   */
  private storeSessionApproval(request: ToolPermissionRequest, decision: PermissionDecision): void {
    if (this.sessionApprovalCount >= this.maxSessionApprovals) {
      // Remove oldest approval
      const oldest = [...this.sessionApprovals.entries()].sort(
        (a, b) => a[1].expiresAt - b[1].expiresAt,
      )[0];
      if (oldest) {
        this.sessionApprovals.delete(oldest[0]);
        this.sessionApprovalCount--;
      }
    }

    const key = this.getApprovalKey(request);
    this.sessionApprovals.set(key, {
      key,
      toolName: request.toolName,
      riskCategory: request.riskCategory,
      decision,
      expiresAt: Date.now() + this.sessionTimeout,
      pathPattern: request.path,
    });
    this.sessionApprovalCount++;
  }

  /**
   * Clean up expired session approvals
   */
  private cleanupExpiredApprovals(): void {
    const now = Date.now();
    for (const [key, approval] of this.sessionApprovals.entries()) {
      if (approval.expiresAt < now) {
        this.sessionApprovals.delete(key);
        this.sessionApprovalCount--;
      }
    }
  }

  /**
   * Evaluate a permission request without prompting
   */
  evaluate(request: ToolPermissionRequest): PolicyResult {
    // Check session approvals first
    const sessionApproval = this.getSessionApproval(request);
    if (sessionApproval) {
      return {
        decision: sessionApproval.decision,
        riskLevel: this.getRiskLevel(request),
        reason: "Previously approved in this session",
      };
    }

    // Evaluate against policy
    return this.policyEngine.evaluate(request);
  }

  /**
   * Request permission with approval flow.
   *
   * @param request - The permission request
   * @param interactive - Whether to prompt the user interactively
   * @param askHigh - If true, always prompt the user even if policy would allow.
   *                  Used for MCP external write operations (create_issue, query, etc.)
   *                  which are treated as high-stakes regardless of policy decision.
   */
  async requestPermission(
    request: ToolPermissionRequest,
    interactive: boolean = true,
    askHigh: boolean = false,
  ): Promise<{ granted: boolean; approvalType: "once" | "session" | "denied"; reason: string }> {
    // Check session approvals first
    const sessionApproval = this.getSessionApproval(request);
    if (sessionApproval && !askHigh) {
      await this.logDecision(
        request,
        sessionApproval.decision,
        "session",
        this.getRiskLevel(request),
        "Previously approved in session",
      );
      return {
        granted: sessionApproval.decision === "allow",
        approvalType: "session",
        reason: "Previously approved in this session",
      };
    }

    // Evaluate against policy
    const result = this.policyEngine.evaluate(request);

    // If policy says deny, log and return immediately
    if (result.decision === "deny") {
      await this.logDecision(request, "deny", "denied", result.riskLevel, result.reason);
      return { granted: false, approvalType: "denied", reason: result.reason };
    }

    // If policy says allow and not askHigh, grant immediately
    if (result.decision === "allow" && !askHigh) {
      await this.logDecision(request, "allow", "once", result.riskLevel, result.reason);
      return { granted: true, approvalType: "once", reason: result.reason };
    }

    // askHigh = true (MCP write operations) OR policy says "ask" — need user interaction
    if (!interactive) {
      // Non-interactive mode: deny if it needs asking
      await this.logDecision(
        request,
        "deny",
        "denied",
        result.riskLevel,
        "Non-interactive mode: requires approval",
      );
      return {
        granted: false,
        approvalType: "denied",
        reason: "Requires user approval in interactive mode",
      };
    }

    // Show approval prompt and get user choice
    const prompt = this.createApprovalPrompt(request, result, askHigh);
    const choice = await this.showApprovalPrompt(prompt, askHigh);

    if (choice === "allow_once") {
      await this.logDecision(request, "allow", "once", result.riskLevel, result.reason);
      return { granted: true, approvalType: "once", reason: result.reason };
    }

    if (choice === "allow_session") {
      this.storeSessionApproval(request, "allow");
      await this.logDecision(request, "allow", "session", result.riskLevel, result.reason);
      return { granted: true, approvalType: "session", reason: result.reason };
    }

    // Denied
    await this.logDecision(request, "deny", "denied", result.riskLevel, result.reason);
    return { granted: false, approvalType: "denied", reason: "User denied permission" };
  }

  /**
   * Get risk level for a request
   */
  private getRiskLevel(request: ToolPermissionRequest): "low" | "medium" | "high" | "critical" {
    const result = this.policyEngine.evaluate(request);
    return result.riskLevel;
  }

  /**
   * Create an approval prompt for the user
   * @param askHigh - If true, escalate the risk display for MCP external writes
   */
  private createApprovalPrompt(
    request: ToolPermissionRequest,
    result: PolicyResult,
    askHigh?: boolean,
  ): ApprovalPrompt {
    // Escalate risk display for MCP write operations
    const escalatedRisk: ApprovalPrompt["riskLevel"] = askHigh
      ? result.riskLevel === "low"
        ? "high"
        : result.riskLevel === "medium"
          ? "high"
          : result.riskLevel
      : result.riskLevel;

    return {
      request,
      riskLevel: escalatedRisk,
      policyDecision: result.decision,
      reason: askHigh ? `[MCP EXTERNAL WRITE] ${result.reason}` : result.reason,
      previousApprovals: this.sessionApprovalCount,
    };
  }

  /**
   * Show approval prompt to user (CLI interface)
   * @param askHigh - If true, show a more emphatic warning for MCP write operations
   */
  private async showApprovalPrompt(
    prompt: ApprovalPrompt,
    askHigh?: boolean,
  ): Promise<ApprovalChoice> {
    const { request, riskLevel, reason } = prompt;

    // For MCP external writes, always show maximum visibility warning
    if (askHigh) {
      console.log("\n" + "=".repeat(60));
      console.log("⚠️  HIGH-STAKES MCP EXTERNAL WRITE OPERATION");
      console.log("=".repeat(60));
      console.log("This MCP tool modifies state OUTSIDE of Altos:");
      console.log("  - Creating/updating issues, comments, files, records");
      console.log("  - Sending messages, emails, notifications");
      console.log("  - Database write operations");
      console.log("  - External API modifications");
      console.log("=".repeat(60));
    }

    console.log("\n" + "=".repeat(60));
    console.log("🔐 PERMISSION REQUIRED");
    console.log("=".repeat(60));
    console.log(`\nTool: ${request.toolName}`);
    console.log(`Risk Category: ${request.riskCategory} (${riskLevel})`);
    console.log(`\nAction: ${reason}`);

    if (request.path) {
      console.log(`\nPath: ${request.path}`);
    }

    if (request.command) {
      console.log(`\nCommand: ${request.command}`);
    }

    if (request.inputSummary) {
      console.log(`\nInput Summary: ${request.inputSummary}`);
    }

    if (request.diff) {
      console.log(`\nDiff:\n${request.diff}`);
    }

    console.log(`\nSession Approvals: ${this.sessionApprovalCount}/${this.maxSessionApprovals}`);

    // Show risk level indicator
    const riskIndicator = {
      low: "🟢",
      medium: "🟡",
      high: "🟠",
      critical: "🔴",
    }[riskLevel];
    console.log(`Risk Level: ${riskIndicator} ${riskLevel.toUpperCase()}`);

    console.log("\n" + "-".repeat(60));
    console.log("Choices:");
    console.log("  [a] Allow once");
    console.log("  [s] Allow for session (30 min)");
    console.log("  [d] Deny");
    console.log("-".repeat(60));

    const choice = await this.promptUser("Choose [a/s/d]: ");
    const normalized = choice.toLowerCase().trim();

    if (normalized === "a" || normalized === "allow" || normalized === "1") {
      return "allow_once";
    }
    if (normalized === "s" || normalized === "session" || normalized === "2") {
      return "allow_session";
    }

    return "deny";
  }

  /**
   * Prompt user for input
   */
  private promptUser(question: string): Promise<string> {
    return new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      rl.question(question, (answer) => {
        rl.close();
        resolve(answer);
      });
    });
  }

  /**
   * Log a permission decision
   */
  private async logDecision(
    request: ToolPermissionRequest,
    decision: PermissionDecision,
    approvalType: "once" | "session" | "denied",
    riskLevel: "low" | "medium" | "high" | "critical",
    reason: string,
  ): Promise<void> {
    await this.auditLogger.log(request, decision, approvalType, riskLevel, reason);
  }

  /**
   * Get audit logs
   */
  async getAuditLogs(options?: Parameters<AuditLogger["readLogs"]>[0]): Promise<AuditEntry[]> {
    return this.auditLogger.readLogs(options);
  }

  /**
   * Get audit statistics
   */
  async getAuditStats(options?: Parameters<AuditLogger["getStats"]>[0]) {
    return this.auditLogger.getStats(options);
  }

  /**
   * Get current session approvals
   */
  getSessionApprovals(): SessionApproval[] {
    return [...this.sessionApprovals.values()];
  }

  /**
   * Clear session approvals
   */
  clearSessionApprovals(): void {
    this.sessionApprovals.clear();
    this.sessionApprovalCount = 0;
  }

  /**
   * Get policy engine for direct access
   */
  getPolicyEngine(): PolicyEngine {
    return this.policyEngine;
  }

  /**
   * Shutdown gracefully
   */
  async shutdown(): Promise<void> {
    await this.auditLogger.stop();
  }
}

/**
 * Create a default permission manager
 */
export function createPermissionManager(): PermissionManager {
  return new PermissionManager();
}
