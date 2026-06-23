// @altos/mcp - MCP configuration loader

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import type { MCPConfig, MCPServerConfig } from "./types.js";

// =============================================================================
// Config Paths
// =============================================================================

/**
 * Get the global MCP config path (~/.altos/mcp.json)
 */
export function getGlobalMCPConfigPath(): string {
  return path.join(os.homedir(), ".altos", "mcp.json");
}

/**
 * Get the project MCP config path (<cwd>/.altos/mcp.json)
 */
export function getProjectMCPConfigPath(cwd?: string): string {
  return path.join(cwd ?? process.cwd(), ".altos", "mcp.json");
}

/**
 * Get the MCP credentials path (~/.altos/mcp-credentials.json)
 */
export function getMCPCredentialsPath(): string {
  return path.join(os.homedir(), ".altos", "mcp-credentials.json");
}

// =============================================================================
// Config Loading
// =============================================================================

/**
 * Load MCP config from a file path
 */
export function loadMCPConfigFromFile(filePath: string): MCPConfig | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const config = JSON.parse(content) as MCPConfig;
    // Validate basic structure
    if (!config || typeof config !== "object") {
      return null;
    }
    return config;
  } catch {
    return null;
  }
}

/**
 * Merge multiple configs with priority: project > global
 */
export function mergeMCPConfigs(
  globalConfig: MCPConfig | null,
  projectConfig: MCPConfig | null,
): MCPServerConfig[] {
  const serverMap = new Map<string, MCPServerConfig>();

  // Add global servers first
  if (globalConfig?.servers) {
    for (const server of globalConfig.servers) {
      if (server.enabled !== false) {
        serverMap.set(server.id, server);
      }
    }
  }

  // Project config overrides
  if (projectConfig?.servers) {
    for (const server of projectConfig.servers) {
      if (server.enabled !== false) {
        serverMap.set(server.id, server);
      }
    }
  }

  return Array.from(serverMap.values());
}

/**
 * Load all MCP server configs from standard sources
 */
export function loadAllMCPConfigs(cwd?: string): {
  servers: MCPServerConfig[];
  globalPath: string | null;
  projectPath: string | null;
  errors: string[];
} {
  const errors: string[] = [];
  const workDir = cwd ?? process.cwd();

  // Global config (~/.altos/mcp.json)
  const globalPath = getGlobalMCPConfigPath();
  let globalConfig: MCPConfig | null = null;
  if (fs.existsSync(globalPath)) {
    try {
      globalConfig = loadMCPConfigFromFile(globalPath);
    } catch (e) {
      errors.push(`Failed to load global MCP config: ${e}`);
    }
  }

  // Project config (<cwd>/.altos/mcp.json)
  const projectPath = getProjectMCPConfigPath(workDir);
  let projectConfig: MCPConfig | null = null;
  if (fs.existsSync(projectPath)) {
    try {
      projectConfig = loadMCPConfigFromFile(projectPath);
    } catch (e) {
      errors.push(`Failed to load project MCP config: ${e}`);
    }
  }

  // Merge configs
  const servers = mergeMCPConfigs(globalConfig, projectConfig);

  return {
    servers,
    globalPath: fs.existsSync(globalPath) ? globalPath : null,
    projectPath: fs.existsSync(projectPath) ? projectPath : null,
    errors,
  };
}

// =============================================================================
// Credentials
// =============================================================================

interface MCPCredentials {
  [serverId: string]: {
    env?: Record<string, string>;
    tokens?: Record<string, string>;
  };
}

/**
 * Load MCP credentials
 */
export function loadMCPCredentials(): MCPCredentials {
  const credPath = getMCPCredentialsPath();
  if (!fs.existsSync(credPath)) {
    return {};
  }
  try {
    return JSON.parse(fs.readFileSync(credPath, "utf-8"));
  } catch {
    return {};
  }
}

/**
 * Save MCP credentials
 */
export function saveMCPCredentials(credentials: MCPCredentials): void {
  const credPath = getMCPCredentialsPath();
  const dir = path.dirname(credPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(credPath, JSON.stringify(credentials, null, 2), {
    mode: 0o600, // Owner read/write only
  });
}

/**
 * Get credentials for a specific server
 */
export function getServerCredentials(serverId: string): Record<string, string> {
  const credentials = loadMCPCredentials();
  return credentials[serverId]?.env ?? {};
}

// =============================================================================
// Config Writing
// =============================================================================

/**
 * Add or update an MCP server in global config
 */
export function addMCPServerToConfig(
  server: MCPServerConfig,
  target: "global" | "project" = "global",
  cwd?: string,
): void {
  const filePath = target === "global" ? getGlobalMCPConfigPath() : getProjectMCPConfigPath(cwd);

  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });

  const existing = loadMCPConfigFromFile(filePath) ?? { servers: [] };

  // Update or add server
  const idx = existing.servers?.findIndex((s) => s.id === server.id) ?? -1;
  if (idx >= 0) {
    existing.servers![idx] = server;
  } else {
    existing.servers = [...(existing.servers ?? []), server];
  }

  fs.writeFileSync(filePath, JSON.stringify(existing, null, 2), {
    mode: 0o644,
  });
}

/**
 * Remove an MCP server from config
 */
export function removeMCPServerFromConfig(
  serverId: string,
  target: "global" | "project" = "global",
  cwd?: string,
): boolean {
  const filePath = target === "global" ? getGlobalMCPConfigPath() : getProjectMCPConfigPath(cwd);

  if (!fs.existsSync(filePath)) {
    return false;
  }

  const existing = loadMCPConfigFromFile(filePath);
  if (!existing?.servers) {
    return false;
  }

  const newServers = existing.servers.filter((s) => s.id !== serverId);
  if (newServers.length === existing.servers.length) {
    return false; // Not found
  }

  if (newServers.length === 0) {
    fs.unlinkSync(filePath);
  } else {
    existing.servers = newServers;
    fs.writeFileSync(filePath, JSON.stringify(existing, null, 2), {
      mode: 0o644,
    });
  }

  return true;
}

// =============================================================================
// Config Validation
// =============================================================================

/**
 * Validate an MCP server config
 */
export function validateMCPServerConfig(server: MCPServerConfig): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!server.id || typeof server.id !== "string") {
    errors.push("Server must have a valid 'id' string");
  }

  if (!server.command || typeof server.command !== "string") {
    errors.push("Server must have a valid 'command' string");
  }

  if (server.args && !Array.isArray(server.args)) {
    errors.push("Server 'args' must be an array");
  }

  if (server.env && typeof server.env !== "object") {
    errors.push("Server 'env' must be a record of strings");
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Check if a server is marked as dangerous
 */
export function isServerDangerous(server: MCPServerConfig): boolean {
  return server.dangerous === true;
}

/**
 * Get safe servers (non-dangerous)
 */
export function getSafeServers(servers: MCPServerConfig[]): MCPServerConfig[] {
  return servers.filter((s) => !isServerDangerous(s));
}
