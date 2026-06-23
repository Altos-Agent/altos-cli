// @altos/permissions - Policy constants

import type { RiskCategory, PolicyRule } from "./types.js";

// Risk category definitions with severity levels
export const RICK_CATEGORIES: Record<
  RiskCategory,
  { severity: "low" | "medium" | "high" | "critical"; description: string }
> = {
  read: { severity: "low", description: "Reading files or data" },
  write: { severity: "medium", description: "Writing or modifying files" },
  execute: { severity: "high", description: "Executing code or commands" },
  network: { severity: "high", description: "Network access" },
  credential: { severity: "critical", description: "Access to credentials or secrets" },
  destructive: { severity: "critical", description: "Destructive operations" },
  remote: { severity: "high", description: "Remote operations (git push, API calls)" },
  external_write: { severity: "critical", description: "Writing to external systems" },
};

// Dangerous path patterns (deny by default)
export const DANGEROUS_PATTERNS: RegExp[] = [
  // SSH and credentials
  /^~\/\.ssh\//,
  /^~\/\.ssh$/,
  /^~\/\.aws\//,
  /^~\/\.kube\//,
  /^~\/\.gnupg\//,
  /^~\/\.netrc/,
  /^~\/\.auth/,
  // Environment files
  /^~\/\.env$/,
  /^~\/\.env\./,
  /\.env$/,
  /\.env\.[a-z]+$/,
  // System files
  /^\/etc\/sudoers/,
  /^\/etc\/passwd$/,
  /^\/etc\/group$/,
  /^\/etc\/shadow/,
  /^\/etc\/gshadow/,
  // OS internals
  /^\/System/,
  /^\/Library\/Apple/,
  /^\/Applications\/.*\.app$/,
  // Cloud configs
  /\.aws\/credentials/,
  /\.aws\/config/,
  /\.azure\/.*\.json$/,
  /\.gcloud\/.*\.json$/,
  // Docker
  /\.docker\/config\.json$/,
  // Git credential stores
  /\.git-credentials$/,
  /\.gitconfig$/,
  // Payment/secrets
  /stripe.*\.key$/,
  /paypal.*\.key$/,
  // Private keys
  /-----BEGIN\s+(?:RSA\s+|EC\s+|DSA\s+|OPENSSH\s+)?PRIVATE\s+KEY-----/,
];

// Safe bash commands that don't require elevated scrutiny
export const SAFE_BASH_COMMANDS: Set<string> = new Set([
  "ls",
  "pwd",
  "cd",
  "echo",
  "printf",
  "cat",
  "head",
  "tail",
  "less",
  "more",
  "grep",
  "egrep",
  "fgrep",
  "find",
  "locate",
  "which",
  "whereis",
  "type",
  "whoami",
  "id",
  "date",
  "cal",
  "uptime",
  "hostname",
  "uname",
  "arch",
  "df",
  "du",
  "free",
  "top",
  "ps",
  "pgrep",
  "pidof",
  "kill",
  "pkill",
  "nice",
  "renice",
  "time",
  "timeout",
  "watch",
  "xargs",
  "true",
  "false",
  "test",
  "seq",
  "yes",
  "clear",
  "tty",
  "wc",
  "sort",
  "uniq",
  "tr",
  "cut",
  "paste",
  "join",
  "awk",
  "sed",
  "jq",
  "base64",
  "md5sum",
  "sha256sum",
  "mkdir",
  "touch",
  "ln",
  "cp",
  "mv",
  "rmdir",
  "stat",
  "file",
  "chmod",
  "chown",
  "git",
  "git-status",
  "git-log",
  "git-show",
  "git-diff",
  "git-branch",
  "npm",
  "npx",
  "pnpm",
  "yarn",
  "node",
  "python",
  "python3",
  "ruby",
  "perl",
  "cargo",
  "go",
  "rustc",
  "make",
  "cmake",
  "gcc",
  "g++",
  "clang",
  "clang++",
  "vim",
  "vi",
  "nano",
  "emacs",
  "less",
  "more",
  "most",
]);

// Dangerous bash commands (require ask or deny by default)
export const DANGEROUS_BASH_COMMANDS: Set<string> = new Set([
  "rm",
  "del",
  "rmdir",
  "format",
  "mkfs",
  "dd",
  "fdisk",
  "sfdisk",
  "parted",
  "mount",
  "umount",
  "sudo",
  "su",
  "useradd",
  "userdel",
  "usermod",
  "passwd",
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
  "docker",
  "kubectl",
  "helm",
  "terraform",
  "ansible",
  "vagrant",
]);

// Commands that pipe to shell (high risk)
export const PIPE_TO_SHELL_PATTERNS: RegExp[] = [
  /\|\s*(sh|bash|ksh|csh|tcsh|zsh|python|ruby|perl|node|npm|pnpm|yarn)/i,
  /;\s*(sh|bash|ksh|csh|tcsh|zsh)/i,
  /\|\s*\$\(/,
  /`[^`]+`/,
  /\$\([^)]+\)/,
  /eval\s+/i,
  /exec\s+/i,
];

// High-risk patterns that should always deny
export const ALWAYS_DENY_PATTERNS: RegExp[] = [
  /sudo\s+su/,
  /rm\s+-rf\s+\//,
  /rm\s+-rf\s+\*$/m,
  /chmod\s+-R\s+777/,
  /chown\s+-R\s+root/,
  />\s*\/dev\/sd/,
  /dd\s+if=.*of=\/dev\//,
  /mkfs\.ext4/,
  /fdisk\s+\/dev/,
  /parted\s+\/dev/,
  /curl.*\|\s*sh/,
  /wget.*\|\s*sh/,
  /curl.*-s\s+https?:\/\/.*\|\s*bash/,
  /curl\s+.*\s+\|\s*sh/,
];

// Default policy rules
export const DEFAULT_POLICY_RULES: PolicyRule[] = [
  // Low risk: read within workspace - allow
  {
    action: "allow",
    riskCategories: ["read"],
    reason: "Read operations within workspace are allowed",
  },
  // Medium risk: write within workspace - ask
  {
    action: "ask",
    riskCategories: ["write"],
    reason: "Write operations require user approval",
  },
  // High risk: execute - ask
  {
    action: "ask",
    riskCategories: ["execute"],
    reason: "Execution requires explicit user approval",
  },
  // High risk: network - ask
  {
    action: "ask",
    riskCategories: ["network"],
    reason: "Network access requires explicit user approval",
  },
  // Critical: credential access - deny
  {
    action: "deny",
    riskCategories: ["credential"],
    reason: "Credential access is never allowed without explicit project configuration",
  },
  // Critical: destructive - deny
  {
    action: "deny",
    riskCategories: ["destructive"],
    reason: "Destructive operations are blocked by default",
  },
  // High risk: remote - ask with high scrutiny
  {
    action: "ask",
    riskCategories: ["remote"],
    reason: "Remote operations require explicit approval",
  },
  // Critical: external write - ask with high scrutiny
  {
    action: "ask",
    riskCategories: ["external_write"],
    reason: "External system writes require explicit approval",
  },
  // Protected paths - deny
  {
    action: "deny",
    pathPattern: "^~\\/\\.ssh\\/.*",
    reason: "SSH directory access is protected",
  },
  {
    action: "deny",
    pathPattern: "^~\\/\\.env$",
    reason: "Environment files are protected",
  },
  {
    action: "deny",
    pathPattern: "\\.env$",
    reason: "Environment files are protected",
  },
  {
    action: "deny",
    pathPattern: "\\.env\\.[a-z]+$",
    reason: "Environment files are protected",
  },
  {
    action: "deny",
    pathPattern: "^/etc/passwd$",
    reason: "System files are protected",
  },
  {
    action: "deny",
    pathPattern: "^/etc/shadow",
    reason: "Shadow password file is protected",
  },
  {
    action: "deny",
    pathPattern: "^/System/",
    reason: "System directories are protected",
  },
  // Destructive commands - deny
  {
    action: "deny",
    commandPattern: "rm\\s+-rf",
    reason: "Recursive force remove is blocked",
  },
  {
    action: "deny",
    commandPattern: "sudo\\s+su",
    reason: "Privilege escalation via sudo su is blocked",
  },
  {
    action: "deny",
    commandPattern: "curl.*\\|\\s*sh",
    reason: "Pipe to shell execution is blocked",
  },
  {
    action: "deny",
    commandPattern: "wget.*\\|\\s*sh",
    reason: "Pipe to shell execution is blocked",
  },
  {
    action: "deny",
    commandPattern: "chmod\\s+-R\\s+777",
    reason: "Recursive 777 permissions are blocked",
  },
  // Git operations
  {
    action: "ask",
    commandPattern: "git\\s+push",
    reason: "Git push requires explicit approval",
  },
  {
    action: "ask",
    commandPattern: "git\\s+force-push",
    reason: "Force push requires explicit approval",
  },
  {
    action: "ask",
    commandPattern: "git\\s+rebase\\s+-i",
    reason: "Interactive rebase requires explicit approval",
  },
  // MCP external writes - ask with high scrutiny
  {
    action: "ask",
    toolNames: ["mcp__*"],
    riskCategories: ["external_write"],
    reason: "MCP external writes require explicit approval",
  },
];
