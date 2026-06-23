// @altos/permissions - Policy engine implementation

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import type {
  Policy,
  PolicyConfig,
  PolicyRule,
  PolicyResult,
  RiskCategory,
  ToolPermissionRequest,
  PermissionDecision,
} from "./types.js";
import {
  RICK_CATEGORIES,
  DANGEROUS_PATTERNS,
  PIPE_TO_SHELL_PATTERNS,
  ALWAYS_DENY_PATTERNS,
  DEFAULT_POLICY_RULES,
} from "./constants.js";
import { normalizePathForPattern } from "../utils/path.js";

// Policy engine evaluates permission requests against policies
export class PolicyEngine {
  private policies: Policy[] = [];
  private ruleCache: Map<string, PolicyResult> = new Map();

  constructor() {
    // Initialize with default policy
    this.policies.push(createDefaultPolicy());
  }

  /**
   * Load policy from a file (global or project config)
   */
  async loadPolicy(filePath: string): Promise<Policy | null> {
    try {
      if (!fs.existsSync(filePath)) {
        return null;
      }

      const content = await fs.promises.readFile(filePath, "utf-8");
      const config: PolicyConfig = JSON.parse(content);

      const policy: Policy = {
        id: `policy-${Date.now()}`,
        name: path.basename(path.dirname(filePath)) + "/" + path.basename(filePath),
        source: filePath.includes(".altos/policy.json")
          ? filePath.startsWith(os.homedir())
            ? "global"
            : "project"
          : "default",
        rules: config.rules || [],
        defaults: config.defaults || {},
      };

      return policy;
    } catch (error) {
      console.error(`Failed to load policy from ${filePath}:`, error);
      return null;
    }
  }

  /**
   * Load policies from standard locations
   */
  async loadStandardPolicies(): Promise<void> {
    // Load global policy (~/.altos/policy.json)
    const globalPath = path.join(os.homedir(), ".altos", "policy.json");
    const globalPolicy = await this.loadPolicy(globalPath);
    if (globalPolicy) {
      this.policies.push(globalPolicy);
    }

    // Load project policy (./altos/policy.json)
    const projectPath = path.join(process.cwd(), ".altos", "policy.json");
    const projectPolicy = await this.loadPolicy(projectPath);
    if (projectPolicy) {
      this.policies.push(projectPolicy);
    }
  }

  /**
   * Add a policy to the engine
   */
  addPolicy(policy: Policy): void {
    this.policies.push(policy);
    this.ruleCache.clear(); // Clear cache when policies change
  }

  /**
   * Clear all policies and add only the default
   */
  resetPolicies(): void {
    this.policies = [createDefaultPolicy()];
    this.ruleCache.clear();
  }

  /**
   * Evaluate a permission request
   */
  evaluate(request: ToolPermissionRequest): PolicyResult {
    // Generate cache key
    const cacheKey = this.generateCacheKey(request);
    const cached = this.ruleCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // First check for always-deny patterns (critical safety check)
    const alwaysDenyResult = this.checkAlwaysDenyPatterns(request);
    if (alwaysDenyResult) {
      this.ruleCache.set(cacheKey, alwaysDenyResult);
      return alwaysDenyResult;
    }

    // Check protected paths
    const protectedPathResult = this.checkProtectedPaths(request);
    if (protectedPathResult) {
      this.ruleCache.set(cacheKey, protectedPathResult);
      return protectedPathResult;
    }

    // Check dangerous bash patterns
    const dangerousBashResult = this.checkDangerousBashPatterns(request);
    if (dangerousBashResult) {
      this.ruleCache.set(cacheKey, dangerousBashResult);
      return dangerousBashResult;
    }

    // Check command-specific rules
    const commandResult = this.checkCommandRules(request);
    if (commandResult) {
      this.ruleCache.set(cacheKey, commandResult);
      return commandResult;
    }

    // Check tool-specific rules
    const toolResult = this.checkToolRules(request);
    if (toolResult) {
      this.ruleCache.set(cacheKey, toolResult);
      return toolResult;
    }

    // Check path pattern rules
    const pathResult = this.checkPathRules(request);
    if (pathResult) {
      this.ruleCache.set(cacheKey, pathResult);
      return pathResult;
    }

    // Fall back to risk category defaults
    const categoryResult = this.checkCategoryDefaults(request);
    this.ruleCache.set(cacheKey, categoryResult);
    return categoryResult;
  }

  /**
   * Generate a cache key for a request
   */
  private generateCacheKey(request: ToolPermissionRequest): string {
    const parts = [
      request.toolName,
      request.riskCategory,
      request.path || "",
      request.command || "",
      request.workspaceRoot || "",
    ];
    return parts.join("|");
  }

  /**
   * Check for always-deny patterns (critical safety)
   */
  private checkAlwaysDenyPatterns(request: ToolPermissionRequest): PolicyResult | null {
    const command = request.command || "";
    const input = request.inputSummary || "";

    for (const pattern of ALWAYS_DENY_PATTERNS) {
      if (pattern.test(command) || pattern.test(input)) {
        return {
          decision: "deny",
          riskLevel: "critical",
          reason: `Blocked by safety policy: ${this.getAlwaysDenyReason(pattern)}`,
        };
      }
    }

    return null;
  }

  /**
   * Get reason for always-deny pattern
   */
  private getAlwaysDenyReason(pattern: RegExp): string {
    const patternStr = pattern.source;
    if (patternStr.includes("rm\\s+-rf")) return "Recursive force remove";
    if (patternStr.includes("sudo\\s+su")) return "Privilege escalation";
    if (patternStr.includes("curl.*\\|\\s*sh")) return "Pipe to shell";
    if (patternStr.includes("chmod\\s+-R\\s+777")) return "Recursive 777 permissions";
    return "Dangerous pattern detected";
  }

  /**
   * Check protected paths
   */
  private checkProtectedPaths(request: ToolPermissionRequest): PolicyResult | null {
    const targetPath = request.path || "";

    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(targetPath)) {
        return {
          decision: "deny",
          riskLevel: "critical",
          reason: `Protected path pattern matched: ${pattern.source}`,
        };
      }
    }

    return null;
  }

  /**
   * Check dangerous bash command patterns
   */
  private checkDangerousBashPatterns(request: ToolPermissionRequest): PolicyResult | null {
    const command = request.command || "";

    // Check for pipe to shell
    for (const pattern of PIPE_TO_SHELL_PATTERNS) {
      if (pattern.test(command)) {
        return {
          decision: "deny",
          riskLevel: "critical",
          reason: "Pipe-to-shell execution pattern detected and blocked",
        };
      }
    }

    // Check for dangerous commands with recursive flags
    const trimmed = command.trim();
    if (trimmed.startsWith("rm -rf") || trimmed.startsWith("rm -fr")) {
      return {
        decision: "deny",
        riskLevel: "critical",
        reason: "Recursive remove with force flag is blocked",
      };
    }

    // Check for chmod -R 777
    if (/chmod\s+-R\s+777/.test(command)) {
      return {
        decision: "deny",
        riskLevel: "high",
        reason: "Recursive chmod 777 is blocked",
      };
    }

    return null;
  }

  /**
   * Check command-specific rules
   */
  private checkCommandRules(request: ToolPermissionRequest): PolicyResult | null {
    const command = request.command || "";

    // Evaluate rules in priority order (later policies override earlier)
    for (const policy of [...this.policies].reverse()) {
      for (const rule of policy.rules) {
        if (rule.commandPattern && this.matchCommandPattern(command, rule.commandPattern)) {
          return {
            decision: rule.action,
            riskLevel: this.getRiskLevel(request.riskCategory, rule.action),
            reason: rule.reason || `Command matched pattern: ${rule.commandPattern}`,
            matchedRule: rule,
          };
        }
      }
    }

    return null;
  }

  /**
   * Check tool-specific rules
   */
  private checkToolRules(request: ToolPermissionRequest): PolicyResult | null {
    const toolName = request.toolName;

    for (const policy of [...this.policies].reverse()) {
      for (const rule of policy.rules) {
        if (rule.toolNames) {
          for (const pattern of rule.toolNames) {
            if (this.matchToolPattern(toolName, pattern)) {
              return {
                decision: rule.action,
                riskLevel: this.getRiskLevel(request.riskCategory, rule.action),
                reason: rule.reason || `Tool matched pattern: ${pattern}`,
                matchedRule: rule,
              };
            }
          }
        }
      }
    }

    return null;
  }

  /**
   * Check path pattern rules
   */
  private checkPathRules(request: ToolPermissionRequest): PolicyResult | null {
    const targetPath = request.path || "";

    for (const policy of [...this.policies].reverse()) {
      for (const rule of policy.rules) {
        if (rule.pathPattern && targetPath) {
          if (this.matchPathPattern(targetPath, rule.pathPattern)) {
            return {
              decision: rule.action,
              riskLevel: this.getRiskLevel(request.riskCategory, rule.action),
              reason: rule.reason || `Path matched pattern: ${rule.pathPattern}`,
              matchedRule: rule,
            };
          }
        }
      }
    }

    return null;
  }

  /**
   * Check risk category defaults
   */
  private checkCategoryDefaults(request: ToolPermissionRequest): PolicyResult {
    const category = request.riskCategory;
    const categoryInfo = RICK_CATEGORIES[category];

    // Check explicit category rules first
    for (const policy of [...this.policies].reverse()) {
      for (const rule of policy.rules) {
        if (rule.riskCategories && rule.riskCategories.includes(category)) {
          return {
            decision: rule.action,
            riskLevel: this.getRiskLevel(category, rule.action),
            reason: rule.reason || `Category ${category} matched rule`,
            matchedRule: rule,
          };
        }
      }
    }

    // Check defaults
    for (const policy of [...this.policies].reverse()) {
      if (policy.defaults && policy.defaults[category]) {
        const defaultAction = policy.defaults[category]!;
        return {
          decision: defaultAction,
          riskLevel: categoryInfo?.severity || "medium",
          reason: `Default for ${category}: ${defaultAction}`,
        };
      }
    }

    // Safe by default for read, ask for everything else
    const defaultAction: PermissionDecision = category === "read" ? "allow" : "ask";
    return {
      decision: defaultAction,
      riskLevel: categoryInfo?.severity || "medium",
      reason: `Default policy: ${defaultAction} for ${category}`,
    };
  }

  /**
   * Match command against a pattern
   */
  private matchCommandPattern(command: string, pattern: string): boolean {
    try {
      // Convert glob-like patterns to regex
      const regexPattern = pattern.replace(/\*/g, ".*").replace(/\?/g, ".");
      const regex = new RegExp(`^${regexPattern}$`);
      return regex.test(command.trim());
    } catch {
      // If pattern is not a valid regex, do literal match
      return command.includes(pattern);
    }
  }

  /**
   * Match tool name against a pattern (supports wildcards)
   */
  private matchToolPattern(toolName: string, pattern: string): boolean {
    if (pattern === toolName) return true;
    if (pattern.endsWith("*")) {
      const prefix = pattern.slice(0, -1);
      return toolName.startsWith(prefix);
    }
    if (pattern.startsWith("*")) {
      const suffix = pattern.slice(1);
      return toolName.endsWith(suffix);
    }
    return false;
  }

  /**
   * Match path against a pattern
   */
  private matchPathPattern(targetPath: string, pattern: string): boolean {
    const normalized = normalizePathForPattern(targetPath);

    try {
      // Handle home directory shorthand
      const expandedPattern = pattern.replace(/^~\//, os.homedir() + "/");
      const regexPattern = expandedPattern
        .replace(/\*\*/g, ".*")
        .replace(/\*/g, "[^/]*")
        .replace(/\?/g, "[^/]");
      const regex = new RegExp(`^${regexPattern}$`, "i");
      return regex.test(normalized);
    } catch {
      // If pattern is not valid regex, do simple includes check
      return normalized.includes(pattern) || pattern.includes(normalized);
    }
  }

  /**
   * Get risk level based on category and decision
   */
  private getRiskLevel(
    category: RiskCategory,
    decision: PermissionDecision,
  ): "low" | "medium" | "high" | "critical" {
    const categoryInfo = RICK_CATEGORIES[category];
    const baseSeverity = categoryInfo?.severity || "medium";

    // Deny decisions are always at least "high"
    if (decision === "deny") {
      return baseSeverity === "low" ? "high" : baseSeverity;
    }

    return baseSeverity;
  }

  /**
   * Get all loaded policies
   */
  getPolicies(): Policy[] {
    return [...this.policies];
  }

  /**
   * Clear the evaluation cache
   */
  clearCache(): void {
    this.ruleCache.clear();
  }
}

/**
 * Create the default policy
 */
export function createDefaultPolicy(): Policy {
  return {
    id: "default",
    name: "Default Policy",
    source: "default",
    rules: [...DEFAULT_POLICY_RULES],
    defaults: {
      read: "allow",
      write: "ask",
      execute: "ask",
      network: "ask",
      credential: "deny",
      destructive: "deny",
      remote: "ask",
      external_write: "ask",
    },
  };
}

/**
 * Merge multiple policies (later ones override earlier)
 */
export function mergePolicies(policies: Policy[]): Policy {
  const mergedRules: PolicyRule[] = [];
  const mergedDefaults: Record<RiskCategory, PermissionDecision> = {
    read: "allow",
    write: "ask",
    execute: "ask",
    network: "ask",
    credential: "deny",
    destructive: "deny",
    remote: "ask",
    external_write: "ask",
  };

  for (const policy of policies) {
    mergedRules.push(...policy.rules);
    Object.assign(mergedDefaults, policy.defaults);
  }

  return {
    id: "merged",
    name: "Merged Policy",
    source: "default",
    rules: mergedRules,
    defaults: mergedDefaults,
  };
}

/**
 * Load policy from file path
 */
export async function loadPolicyFromFile(filePath: string): Promise<Policy | null> {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }

    const content = await fs.promises.readFile(filePath, "utf-8");
    const config: PolicyConfig = JSON.parse(content);

    return {
      id: `policy-${Date.now()}`,
      name: path.basename(filePath),
      source: filePath.includes(os.homedir()) ? "global" : "project",
      rules: config.rules || [],
      defaults: config.defaults || {},
    };
  } catch (error) {
    console.error(`Failed to load policy from ${filePath}:`, error);
    return null;
  }
}
