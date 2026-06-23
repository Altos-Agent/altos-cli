// @altos/plugins - Permission validation

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import type {
  PluginManifest,
  PermissionScope,
  PermissionValidationResult,
  UserPermissionGrants,
} from "../index.js";

/**
 * Dangerous permission patterns that are never granted automatically.
 */
const DANGEROUS_SCOPES: PermissionScope[] = [
  "fs:exec",
  "tool:*",
  "hook:*",
  "model:*",
  "mcp:*",
  "skill:*",
];

/**
 * Permission groups that map wildcard scopes to their specific sub-scopes.
 */
const PERMISSION_GROUPS: Record<string, PermissionScope[]> = {
  "tool:*": ["tool:register"],
  "hook:*": [
    "hook:session_start",
    "hook:user_prompt",
    "hook:before_model_call",
    "hook:after_model_call",
    "hook:before_tool_call",
    "hook:after_tool_call",
    "hook:before_file_write",
    "hook:after_file_write",
    "hook:before_compact",
    "hook:session_end",
  ],
  "model:*": ["model:register", "model:call"],
  "mcp:*": ["mcp:register", "mcp:server"],
  "skill:*": ["skill:register"],
  "memory:*": ["memory:read", "memory:write", "memory:search"],
  "config:*": ["config:read", "config:write"],
};

/**
 * Get the path to the user plugin permissions file.
 */
function getPermissionFilePath(): string {
  return path.join(os.homedir(), ".altos", "plugin-permissions.json");
}

/**
 * Load user-granted permission overrides.
 */
export function loadUserGrants(): UserPermissionGrants {
  const filePath = getPermissionFilePath();
  if (!fs.existsSync(filePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return {};
  }
}

/**
 * Save user-granted permission overrides.
 */
export function saveUserGrants(grants: UserPermissionGrants): void {
  const filePath = getPermissionFilePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(grants, null, 2));
}

/**
 * Grant permissions to a plugin.
 */
export function grantPluginPermissions(
  pluginName: string,
  scopes: PermissionScope[],
  grantedBy?: string,
): void {
  const grants = loadUserGrants();
  const existing = grants[pluginName] ?? { granted: [], denied: [] };
  for (const scope of scopes) {
    if (!existing.granted.includes(scope)) {
      existing.granted.push(scope);
    }
    existing.denied = existing.denied.filter((s) => s !== scope);
  }
  existing.grantedAt = Date.now();
  if (grantedBy) existing.grantedBy = grantedBy;
  grants[pluginName] = existing;
  saveUserGrants(grants);
}

/**
 * Deny permissions to a plugin.
 */
export function denyPluginPermissions(pluginName: string, scopes: PermissionScope[]): void {
  const grants = loadUserGrants();
  const existing = grants[pluginName] ?? { granted: [], denied: [] };
  for (const scope of scopes) {
    if (!existing.denied.includes(scope)) {
      existing.denied.push(scope);
    }
    existing.granted = existing.granted.filter((s) => s !== scope);
  }
  grants[pluginName] = existing;
  saveUserGrants(grants);
}

/**
 * Revoke all permissions for a plugin.
 */
export function revokePluginPermissions(pluginName: string): void {
  const grants = loadUserGrants();
  delete grants[pluginName];
  saveUserGrants(grants);
}

/**
 * Get granted/denied scopes for a specific plugin.
 */
export function getPluginGrants(pluginName: string): {
  granted: PermissionScope[];
  denied: PermissionScope[];
} {
  const grants = loadUserGrants();
  return grants[pluginName] ?? { granted: [], denied: [] };
}

/**
 * Check if a scope matches a granted pattern.
 */
function scopeMatches(granted: PermissionScope, requested: PermissionScope): boolean {
  if (granted === requested) return true;
  if (granted.endsWith(":*")) {
    const prefix = granted.slice(0, -1);
    return requested.startsWith(prefix);
  }
  return false;
}

/**
 * Validate a plugin manifest's permissions against the permission system.
 *
 * Rules:
 * - Dangerous permissions (fs:exec, tool:*, etc.) are always denied by default
 * - fs:read, fs:write, net:connect require explicit user grant or config
 * - hook events and tool registrations require explicit user grant
 * - Wildcard scopes expand to their specific sub-scopes
 */
export function validatePluginPermissions(
  manifest: PluginManifest,
  userGrants?: UserPermissionGrants,
): PermissionValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const granted: PermissionScope[] = [];
  const denied: PermissionScope[] = [];

  const pluginGrants = (userGrants ?? loadUserGrants())[manifest.name] ?? {
    granted: [],
    denied: [],
  };

  const permissions = manifest.permissions ?? [];

  for (const perm of permissions) {
    const { scope } = perm;

    const hasGrant = pluginGrants.granted.some((g) => scopeMatches(g, scope));
    const hasDeny = pluginGrants.denied.some((d) => scopeMatches(d, scope));

    if (hasGrant) {
      granted.push(scope);
      continue;
    }

    if (hasDeny) {
      denied.push(scope);
      errors.push(`Permission "${scope}" has been explicitly denied`);
      continue;
    }

    if (DANGEROUS_SCOPES.includes(scope)) {
      denied.push(scope);
      errors.push(
        `Permission "${scope}" is dangerous and requires explicit user grant. ` +
          `Run: altos plugin grant ${manifest.name} "${scope}"`,
      );
      continue;
    }

    const autoGranted: PermissionScope[] = [
      "fs:read",
      "fs:write",
      "net:connect",
      "config:read",
      "config:write",
      "memory:read",
      "memory:write",
      "memory:search",
    ];

    if (autoGranted.includes(scope) || scope.startsWith("memory:") || scope.startsWith("config:")) {
      granted.push(scope);
      continue;
    }

    if (
      scope.startsWith("tool:") ||
      scope.startsWith("hook:") ||
      scope.startsWith("model:") ||
      scope.startsWith("mcp:") ||
      scope.startsWith("skill:")
    ) {
      denied.push(scope);
      warnings.push(
        `Permission "${scope}" requires explicit user grant. ` +
          `Run: altos plugin grant ${manifest.name} "${scope}"`,
      );
      continue;
    }

    denied.push(scope);
    warnings.push(`Unknown permission scope "${scope}" — denied`);
  }

  return { valid: errors.length === 0, errors, warnings, granted, denied };
}

/**
 * Expand wildcard permission scopes to their specific sub-scopes.
 */
export function expandWildcardScopes(scope: PermissionScope): PermissionScope[] {
  return PERMISSION_GROUPS[scope] ?? [scope];
}

/**
 * Check if a scope is a wildcard.
 */
export function isWildcardScope(scope: string): boolean {
  return scope.endsWith(":*");
}
