// @altos/sandbox - Policy integration for sandbox execution

// Inline dangerous command constants to avoid circular dependency
// These should stay in sync with @altos/permissions
const DANGEROUS_BASH_COMMANDS: Set<string> = new Set([
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

const ALWAYS_DENY_PATTERNS: RegExp[] = [
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

// ============================================================================
// Policy Types
// ============================================================================

export interface SandboxPolicyResult {
  allowed: boolean;
  reason?: string;
  riskLevel: "low" | "medium" | "high" | "critical";
  requiresNetworkPermission?: boolean;
}

export interface SandboxPolicyConfig {
  allowNetwork?: boolean;
  maxCommandDuration?: number;
  allowedCommands?: Set<string>;
  deniedCommands?: Set<string>;
  requireNetworkPermission?: boolean;
}

// ============================================================================
// Dangerous Command Detection
// ============================================================================

const DANGEROUS_PATTERNS_FOR_SANDBOX: RegExp[] = [
  // Path traversal
  /\.\.\//,
  /\.\.$/,
  /^~\/\.\./,
  // Privilege escalation
  /sudo\s+su/,
  /chmod\s+777/,
  /chmod\s+-R\s+777/,
  // System modification
  /rm\s+-rf\s+\//,
  /mkfs\./,
  /dd\s+if=.*of=\/dev/,
  // Network exfiltration
  /curl.*--data.*\$(.*password|secret|token|key)/i,
  /wget.*-O\s+\/dev\/null/,
  // Shell injection
  /\|\s*sh/,
  /;\s*sh/,
  /\$\([^)]+\)/,
  /`[^`]+`/,
];

const NETWORK_COMMANDS: Set<string> = new Set([
  "curl",
  "wget",
  "nc",
  "netcat",
  "ncat",
  "socat",
  "telnet",
  "ssh",
  "scp",
  "sftp",
  "rsync",
  "nmap",
  "ping",
  "traceroute",
  "tracepath",
  "curl",
  "wget",
]);

// ============================================================================
// Policy Checker
// ============================================================================

export function createSandboxPolicyChecker(config: SandboxPolicyConfig = {}) {
  const { allowNetwork = false, requireNetworkPermission = true } = config;

  return function checkCommandPolicy(command: string): SandboxPolicyResult {
    // Check for always-deny patterns first
    for (const pattern of ALWAYS_DENY_PATTERNS) {
      if (pattern.test(command)) {
        return {
          allowed: false,
          reason: `Command matches blocked pattern: ${pattern.source}`,
          riskLevel: "critical",
        };
      }
    }

    // Check for dangerous sandbox-specific patterns
    for (const pattern of DANGEROUS_PATTERNS_FOR_SANDBOX) {
      if (pattern.test(command)) {
        return {
          allowed: false,
          reason: `Command matches dangerous pattern: ${pattern.source}`,
          riskLevel: "critical",
        };
      }
    }

    // Check if command uses dangerous bash commands
    const words = command.trim().split(/\s+/);
    const baseCommand = words[0];

    if (DANGEROUS_BASH_COMMANDS.has(baseCommand)) {
      // Check if it's a subcommand (e.g., git push)
      const fullCommand = words.slice(0, 2).join(" ");
      if (!DANGEROUS_BASH_COMMANDS.has(fullCommand)) {
        // Allow git, npm, etc. as they may be in the allowedCommands
      } else {
        return {
          allowed: false,
          reason: `Dangerous command '${baseCommand}' is not allowed in sandbox`,
          riskLevel: "high",
        };
      }
    }

    // Check for network commands
    if (NETWORK_COMMANDS.has(baseCommand)) {
      if (!allowNetwork && requireNetworkPermission) {
        return {
          allowed: false,
          reason: `Network command '${baseCommand}' requires network permission`,
          riskLevel: "high",
          requiresNetworkPermission: true,
        };
      }
    }

    // Check custom allowed/denied lists
    if (config.deniedCommands?.has(baseCommand)) {
      return {
        allowed: false,
        reason: `Command '${baseCommand}' is explicitly denied`,
        riskLevel: "high",
      };
    }

    if (config.allowedCommands && !config.allowedCommands.has(baseCommand)) {
      return {
        allowed: false,
        reason: `Command '${baseCommand}' is not in the allowed list`,
        riskLevel: "medium",
      };
    }

    return {
      allowed: true,
      riskLevel: "low",
    };
  };
}

// ============================================================================
// Quick Check Functions
// ============================================================================

export function isNetworkCommand(command: string): boolean {
  const words = command.trim().split(/\s+/);
  const baseCommand = words[0];
  return NETWORK_COMMANDS.has(baseCommand);
}

export function isDangerousCommand(command: string): boolean {
  for (const pattern of ALWAYS_DENY_PATTERNS) {
    if (pattern.test(command)) return true;
  }

  for (const pattern of DANGEROUS_PATTERNS_FOR_SANDBOX) {
    if (pattern.test(command)) return true;
  }

  const words = command.trim().split(/\s+/);
  const baseCommand = words[0];

  if (DANGEROUS_BASH_COMMANDS.has(baseCommand)) {
    const fullCommand = words.slice(0, 2).join(" ");
    if (DANGEROUS_BASH_COMMANDS.has(fullCommand)) {
      return true;
    }
  }

  return false;
}

export function getCommandRiskLevel(command: string): "low" | "medium" | "high" | "critical" {
  // Critical check first
  for (const pattern of ALWAYS_DENY_PATTERNS) {
    if (pattern.test(command)) return "critical";
  }

  // High risk
  if (isNetworkCommand(command)) return "high";

  const words = command.trim().split(/\s+/);
  const baseCommand = words[0];
  if (DANGEROUS_BASH_COMMANDS.has(baseCommand)) return "high";

  // Medium risk - write operations
  const writeCommands = ["mkdir", "touch", "chmod", "chown", "mv", "cp"];
  if (writeCommands.includes(baseCommand)) return "medium";

  // Low risk by default
  return "low";
}

// ============================================================================
// Permission Integration
// ============================================================================

export interface SandboxPermissionRequest {
  command: string;
  workspace: string;
  sandboxType: "local" | "docker" | "podman";
  networkRequested?: boolean;
}

/**
 * Check if a sandbox permission decision should allow the command
 * This integrates with the permissions package
 */
export function shouldAllowSandboxCommand(
  request: SandboxPermissionRequest,
  permissions: {
    allowNetwork?: boolean;
    allowExecute?: boolean;
    allowWrite?: boolean;
  },
): SandboxPolicyResult {
  const policyCheck = createSandboxPolicyChecker({
    allowNetwork: permissions.allowNetwork,
    requireNetworkPermission: false, // We handle this separately
  })(request.command);

  if (!policyCheck.allowed) {
    return policyCheck;
  }

  // Check network permission
  if (request.networkRequested && !permissions.allowNetwork) {
    return {
      allowed: false,
      reason: "Network access requires explicit permission",
      riskLevel: "high",
      requiresNetworkPermission: true,
    };
  }

  // Check execute permission
  if (!permissions.allowExecute) {
    return {
      allowed: false,
      reason: "Command execution requires explicit permission",
      riskLevel: "high",
    };
  }

  return {
    allowed: true,
    riskLevel: policyCheck.riskLevel,
  };
}
