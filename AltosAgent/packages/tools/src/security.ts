// @altos/tools - Security utilities: path traversal, secret masking, workspace boundaries

import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// ============================================================================
// Secret Patterns for Masking
// ============================================================================

export const DEFAULT_SECRET_PATTERNS: RegExp[] = [
  // API keys
  /sk-[a-zA-Z0-9]{20,}/g,
  /sk-prod-[a-zA-Z0-9]{20,}/g,
  // GitHub tokens (36 or more chars to handle both classic and fine-grained)
  /ghp_[a-zA-Z0-9]{36,}/g,
  /github_pat_[a-zA-Z0-9_]{22,}/g,
  // AWS keys
  /(?:AKIA|A3T|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}/g,
  // GCP keys
  /[a-zA-Z0-9_-]*\.iam\.gserviceaccount\.com/g,
  // Generic Bearer tokens
  /Bearer\s+[a-zA-Z0-9._-]+/g,
  // Generic API keys in headers/urls
  /api[_-]?key["\s:=]+[a-zA-Z0-9]{10,}/gi,
  // Private keys (multiline - matches from BEGIN to END marker)
  /-----BEGIN\s+(?:RSA\s+|EC\s+|DSA\s+|OPENSSH\s+)?PRIVATE\s+KEY-----[\s\S]*?-----END\s+(?:RSA\s+|EC\s+|DSA\s+|OPENSSH\s+)?PRIVATE\s+KEY-----/g,
  // JWT tokens
  /eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g,
  // Slack tokens
  /xox[baprs]-[0-9]{10,13}-[0-9]{10,13}[a-zA-Z0-9-]*/g,
  // Discord tokens
  /[MN][A-Za-z\\d]{23,}\.[\w-]{6}\.[\w-]{27}/g,
  // Stripe keys
  /sk_live_[a-zA-Z0-9]{24,}/g,
  /sk_test_[a-zA-Z0-9]{24,}/g,
  /rk_live_[a-zA-Z0-9]{24,}/g,
];

// ============================================================================
// Protected Paths - Never allow access
// ============================================================================

export const PROTECTED_PATH_PATTERNS: RegExp[] = [
  // SSH directory
  /(^|\/)\.ssh\//,
  /(^|\/)\.ssh$/,
  // Environment files
  /(^|\/)\.env$/,
  /(^|\/)\.env\./,
  /\.env$/,
  // System directories
  /^\/etc\/sudoers/,
  /^\/etc\/passwd$/,
  /^\/etc\/group$/,
  /^\/etc\/shadow/,
  /^\/etc\/gshadow/,
  // OS internal
  /^\/System/,
  /^\/Library/,
  /^\/Applications\/.*\.app$/,
  // Home directory sensitive files (check after / or at start)
  /(^|\/)\.aws\//,
  /(^|\/)\.kube\//,
  /(^|\/)\.config\/google-authenticator/,
  /(^|\/)\.gnupg\//,
  /(^|\/)\.npm\/_auth/,
  /(^|\/)\.netrc/,
  /(^|\/)\.auth/,
  // Docker/socket files
  /\.sock$/,
  /\.socket$/,
  // Git credential stores
  /\.git-credentials$/,
  /\.gitconfig$/,
  // Cloud credentials
  /\.aws\/credentials/,
  /\.aws\/config/,
  // Azure
  /\.azure\/.*\.json$/,
];

// ============================================================================
// Dangerous Shell Commands (require extra scrutiny)
// ============================================================================

export const DANGEROUS_COMMANDS: Set<string> = new Set([
  "rm",
  "rmdir",
  "del",
  "format",
  "mkfs",
  "dd",
  "fdisk",
  "sfdisk",
  "parted",
  "mount",
  "umount",
  "chmod",
  "chown",
  "chgrp",
  "useradd",
  "userdel",
  "usermod",
  "passwd",
  "su",
  "sudo",
  "kill",
  "killall",
  "pkill",
  "reboot",
  "shutdown",
  "halt",
  "poweroff",
  "init",
  "systemctl",
  "service",
  "iptables",
  "ufw",
  "firewalld",
  "cron",
  "at",
  "crontab",
  "wget",
  "curl",
  "nc",
  "netcat",
  "ncat",
  "socat",
  "telnet",
  "ssh",
  "scp",
  "sftp",
  "rsync",
  "tar",
  "zip",
  "unzip",
  "7z",
  "7za",
  "eval",
  "exec",
  "source",
  "alias",
  "export",
  "declare",
  "typeset",
  "read",
  "printf",
  "base64",
  "openssl",
  "docker",
  "kubectl",
  "helm",
  "terraform",
  "ansible",
  "vagrant",
]);

// ============================================================================
// Security Utilities
// ============================================================================

/**
 * Mask secrets in output text
 */
export function maskSecrets(input: string, extraPatterns?: RegExp[]): string {
  const allPatterns = [...DEFAULT_SECRET_PATTERNS, ...(extraPatterns ?? [])];
  let result = input;
  for (const pattern of allPatterns) {
    result = result.replace(pattern, "[REDACTED]");
  }
  return result;
}

/**
 * Check if a path is protected (never accessible)
 */
export function isProtectedPath(targetPath: string): boolean {
  // Normalize and expand the path first
  const normalized = normalizePath(targetPath);
  for (const pattern of PROTECTED_PATH_PATTERNS) {
    if (pattern.test(normalized)) {
      return true;
    }
  }
  return false;
}

/**
 * Check if a command is considered dangerous
 */
export function isDangerousCommand(command: string): boolean {
  const trimmed = command.trim();
  const parts = trimmed.split(/\s+/);
  const base = path.basename(parts[0], ".exe");
  return DANGEROUS_COMMANDS.has(base.toLowerCase());
}

/**
 * Normalize a path for comparison, resolving symlinks when possible
 */
export function normalizePath(targetPath: string): string {
  // Expand ~ to home directory
  if (targetPath.startsWith("~/") || targetPath === "~") {
    targetPath = targetPath.replace(/^~/, os.homedir());
  }
  // Convert to absolute path and normalize
  if (!path.isAbsolute(targetPath)) {
    targetPath = path.resolve(targetPath);
  }
  // Normalize separators and remove trailing slashes
  const normalized = path.normalize(targetPath).replace(/\\/g, "/").replace(/\/+$/, "");

  // Try to resolve symlinks in the path to detect symlink escapes
  // We only resolve if the path exists, otherwise we can't detect the escape
  try {
    const realPath = fs.realpathSync(normalized);
    return realPath.replace(/\\/g, "/").replace(/\/+$/, "");
  } catch {
    // Path doesn't exist yet (e.g., about to be created), try resolving parent directories
    try {
      const dir = path.dirname(normalized);
      const realDir = fs.realpathSync(dir);
      const base = path.basename(normalized);
      return (realDir.replace(/\\/g, "/") + "/" + base).replace(/\/+$/, "");
    } catch {
      // Neither path nor parent exists, return as-is
      return normalized;
    }
  }
}

/**
 * Check if a path escapes its workspace (path traversal attack)
 */
export function isPathTraversal(targetPath: string, workspaceRoot: string): boolean {
  const normalized = normalizePath(targetPath);
  const normalizedRoot = normalizePath(workspaceRoot);

  // Ensure the path doesn't escape the workspace
  if (!normalized.startsWith(normalizedRoot) && normalized !== normalizedRoot) {
    return true;
  }

  // Check for traversal patterns like ../ or symlinks
  const parts = normalized.substring(normalizedRoot.length).split("/");
  let depth = 0;
  for (const part of parts) {
    if (part === "..") {
      depth--;
      if (depth < 0) {
        return true; // Escaped above workspace
      }
    } else if (part && part !== ".") {
      depth++;
    }
  }

  return false;
}

/**
 * Validate a path is within workspace and not protected
 */
export interface PathValidationResult {
  valid: boolean;
  error?: string;
  normalizedPath?: string;
}

export function validatePath(
  targetPath: string,
  workspaceRoots: string[],
  _requiredPermission: "read" | "write",
): PathValidationResult {
  if (workspaceRoots.length === 0) {
    return { valid: false, error: "No workspace root configured" };
  }

  // Check protected paths first (before normalization - patterns use ~)
  if (isProtectedPath(targetPath)) {
    return { valid: false, error: "Access to this path is denied" };
  }

  // Normalize the path
  const normalized = normalizePath(targetPath);

  // Check against each workspace root
  for (const workspaceRoot of workspaceRoots) {
    if (!isPathTraversal(normalized, workspaceRoot)) {
      return { valid: true, normalizedPath: normalized };
    }
  }

  return { valid: false, error: 'Path "' + targetPath + '" is outside the allowed workspace' };
}

/**
 * Validate a bash command is safe to execute
 */
export interface CommandValidationResult {
  valid: boolean;
  warning?: string;
  error?: string;
}

export function validateBashCommand(
  command: string,
  _workspaceRoot: string,
  allowDangerous: boolean = false,
): CommandValidationResult {
  if (!command || !command.trim()) {
    return { valid: false, error: "Empty command" };
  }

  // Check for dangerous commands
  if (isDangerousCommand(command) && !allowDangerous) {
    return {
      valid: false,
      error: `Dangerous command "${command.trim().split(/\s+/)[0]}" requires explicit approval`,
    };
  }

  // Check for path traversal in the command string
  const normalized = normalizePath(command);
  if (normalized.includes("..")) {
    return { valid: false, error: "Command contains path traversal pattern" };
  }

  // Warn about potentially suspicious patterns
  const trimmed = command.trim();
  if (
    trimmed.includes("&&") ||
    trimmed.includes("||") ||
    trimmed.includes(";") ||
    trimmed.includes("|") ||
    trimmed.includes(">") ||
    trimmed.includes("<")
  ) {
    // These are allowed but should be noted
    return {
      valid: true,
      warning: "Command contains shell operators - ensure each part is intentional",
    };
  }

  return { valid: true };
}

/**
 * Redact sensitive environment variables from output
 */
export function redactEnv(env: Record<string, string>): Record<string, string> {
  const sensitive = [
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "AWS_SESSION_TOKEN",
    "GITHUB_TOKEN",
    "GITHUB_API_KEY",
    "ANTHROPIC_API_KEY",
    "OPENAI_API_KEY",
    "STRIPE_SECRET_KEY",
    "STRIPE_PUBLISHABLE_KEY",
    "DATABASE_URL",
    "REDIS_URL",
    "SECRET_KEY",
    "SECRET_TOKEN",
    "SESSION_SECRET",
    "ENCRYPTION_KEY",
    "PRIVATE_KEY",
    "SSH_KEY",
    "TOKEN",
    "PASSWORD",
    "PASSWD",
    "SECRET",
  ];

  const redacted: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    const upperKey = key.toUpperCase();
    const isSensitive = sensitive.some((s) => upperKey.includes(s) || upperKey === s);
    redacted[key] = isSensitive ? "[REDACTED]" : value;
  }
  return redacted;
}

// ============================================================================
// Output Truncation
// ============================================================================

const DEFAULT_MAX_OUTPUT_BYTES = 1024 * 1024; // 1MB
const DEFAULT_TRUNCATE_THRESHOLD = 100 * 1024; // 100KB

/**
 * Truncate output if it exceeds the threshold
 */
export function truncateOutput(
  output: string,
  _maxBytes: number = DEFAULT_MAX_OUTPUT_BYTES,
  threshold: number = DEFAULT_TRUNCATE_THRESHOLD,
): { truncated: string; wasTruncated: boolean; originalSize: number; truncatedSize: number } {
  const bytes = Buffer.byteLength(output, "utf8");

  if (bytes <= threshold) {
    return { truncated: output, wasTruncated: false, originalSize: bytes, truncatedSize: bytes };
  }

  // Binary search for the right truncation point
  let targetLength = Math.floor((output.length * threshold) / bytes);
  let truncatedBytes = Buffer.byteLength(output.substring(0, targetLength), "utf8");

  // Refine to get as close to threshold as possible without exceeding
  while (truncatedBytes < threshold && targetLength < output.length) {
    targetLength++;
    truncatedBytes = Buffer.byteLength(output.substring(0, targetLength), "utf8");
  }

  // Back off one character to be safe
  while (truncatedBytes > threshold && targetLength > 0) {
    targetLength--;
    truncatedBytes = Buffer.byteLength(output.substring(0, targetLength), "utf8");
  }

  const truncated = output.substring(0, targetLength) + "\n... [output truncated]";
  const finalBytes = Buffer.byteLength(truncated, "utf8");

  return {
    truncated,
    wasTruncated: true,
    originalSize: bytes,
    truncatedSize: finalBytes,
  };
}

/**
 * Create a structured summary of tool output
 */
export function createOutputSummary(
  _toolName: string,
  result: unknown,
  maxBytes: number = DEFAULT_MAX_OUTPUT_BYTES,
): { summary: string; data: unknown; truncated: boolean } {
  if (result === null || result === undefined) {
    return { summary: "null", data: null, truncated: false };
  }

  if (typeof result === "string") {
    const truncated = truncateOutput(result, maxBytes);
    if (truncated.wasTruncated) {
      return {
        summary: `String output (${truncated.originalSize} bytes) - truncated to ${truncated.truncatedSize} bytes`,
        data: truncated.truncated,
        truncated: true,
      };
    }
    return {
      summary: `String output (${truncated.originalSize} bytes)`,
      data: result,
      truncated: false,
    };
  }

  if (Array.isArray(result)) {
    const count = result.length;
    const firstFew = result.slice(0, 3);
    return {
      summary: `Array with ${count} items${count > 3 ? ` (showing first 3)` : ""}`,
      data: count > 3 ? firstFew : result,
      truncated: count > 3,
    };
  }

  if (typeof result === "object") {
    const keys = Object.keys(result as object);
    const count = keys.length;
    const firstFew = keys.slice(0, 5);
    return {
      summary: `Object with ${count} keys${count > 5 ? ` (showing: ${firstFew.join(", ")}, ...)` : ` (${keys.join(", ")})`}`,
      data: result,
      truncated: count > 5,
    };
  }

  return {
    summary: `${typeof result} value`,
    data: result,
    truncated: false,
  };
}
