// altos mcp CLI commands

import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";
import {
  createMCPClientManager,
  loadAllMCPConfigs,
  addMCPServerToConfig,
  removeMCPServerFromConfig,
  getGlobalMCPConfigPath,
  getProjectMCPConfigPath,
  validateMCPServerConfig,
  isServerDangerous,
  type MCPServerConfig,
  type MCPConnectedServer,
} from "@altos/mcp";

export interface MCPCommandOptions {
  list?: boolean;
  add?: string;
  remove?: string;
  inspect?: string;
  tools?: boolean;
  serve?: boolean;
  transport?: "stdio" | "tcp";
  port?: number;
  host?: string;
  json?: boolean;
  project?: boolean; // Add to project config instead of global
  dangerous?: boolean; // Allow dangerous servers
}

interface MCPServerWithSource extends MCPServerConfig {
  source: "global" | "project" | "plugin";
  dangerous: boolean;
}

// =============================================================================
// MCP Command Entry Point
// =============================================================================

export async function runMCPCommand(cwd: string, options: MCPCommandOptions): Promise<number> {
  // --- altos mcp list ---
  if (
    options.list ||
    (!options.add && !options.remove && !options.inspect && !options.tools && !options.serve)
  ) {
    return await cmdList(cwd, options.json);
  }

  // --- altos mcp add <config-file> ---
  if (options.add) {
    return await cmdAdd(cwd, options.add, options.project, options.dangerous, options.json);
  }

  // --- altos mcp remove <server-id> ---
  if (options.remove) {
    return await cmdRemove(cwd, options.remove, options.project, options.json);
  }

  // --- altos mcp inspect <server-id> ---
  if (options.inspect) {
    return await cmdInspect(cwd, options.inspect, options.json);
  }

  // --- altos mcp tools ---
  if (options.tools) {
    return await cmdTools(cwd, options.json);
  }

  // --- altos mcp serve ---
  if (options.serve) {
    await cmdServe(options.transport ?? "stdio", options.port, options.host);
    return 0;
  }

  return await cmdList(cwd, options.json);
}

// =============================================================================
// Command Implementations
// =============================================================================

/**
 * altos mcp list - List all configured MCP servers
 */
async function cmdList(cwd: string, asJson?: boolean): Promise<number> {
  const { servers, globalPath, projectPath, errors } = loadAllMCPConfigs(cwd);

  if (asJson) {
    console.log(
      JSON.stringify(
        {
          servers: servers.map((s) => ({
            ...s,
            dangerous: isServerDangerous(s),
          })),
          globalPath,
          projectPath,
          configPaths: {
            global: getGlobalMCPConfigPath(),
            project: getProjectMCPConfigPath(cwd),
          },
        },
        null,
        2,
      ),
    );
    return 0;
  }

  console.log("\n=== MCP Servers ===\n");
  console.log(`Global config:  ${getGlobalMCPConfigPath()}`);
  console.log(`Project config: ${getProjectMCPConfigPath(cwd)}`);
  console.log();

  if (errors.length > 0) {
    console.log("⚠️  Config errors:");
    for (const err of errors) {
      console.log(`   ${err}`);
    }
    console.log();
  }

  if (servers.length === 0) {
    console.log("  No MCP servers configured.");
    console.log();
    console.log("  Add servers with:");
    console.log("    altos mcp add <config-file>");
    console.log();
    console.log("  Or create a config file at:");
    console.log(`    ${getGlobalMCPConfigPath()}`);
    console.log(`    ${getProjectMCPConfigPath(cwd)}`);
    console.log();
    return 0;
  }

  // Try to connect and get server status
  const manager = createMCPClientManager();
  try {
    await manager.loadServers(cwd);
  } catch {
    // Ignore connection errors for list
  }

  const connectedServers = manager.listServers();
  const serverMap = new Map(connectedServers.map((s) => [s.id, s]));

  for (const server of servers) {
    const connected = serverMap.get(server.id);
    const dangerous = isServerDangerous(server);
    const status = connected
      ? connected.state === "connected"
        ? "\x1b[32m[OK]\x1b[0m"
        : connected.state === "error"
          ? `\x1b[31m[ERR: ${connected.error?.slice(0, 30)}]\x1b[0m`
          : "\x1b[33m[...]\x1b[0m"
      : "\x1b[90m[--]\x1b[0m";

    const toolCount = connected?.tools.length ?? 0;
    const dangerousBadge = dangerous ? " \x1b[31m[DANGEROUS]\x1b[0m" : "";

    console.log(
      `  ${status} ${server.id.padEnd(25)} ${server.name.padEnd(20)} ${toolCount} tools${dangerousBadge}`,
    );
  }

  console.log();
  await manager.shutdown();
  return 0;
}

/**
 * altos mcp add <config-file> - Add an MCP server
 */
async function cmdAdd(
  cwd: string,
  configFile: string,
  projectScope: boolean | undefined,
  allowDangerous: boolean | undefined,
  asJson: boolean | undefined,
): Promise<number> {
  // Load config from file
  let configData: MCPServerConfig;

  try {
    const content = fs.readFileSync(configFile, "utf-8");
    const parsed = JSON.parse(content);

    // Support both direct server config and wrapped config
    if (parsed.servers) {
      // Full MCP config file
      if (parsed.servers.length === 0) {
        console.error("No servers in config file");
        return 1;
      }
      configData = parsed.servers[0];
    } else if (parsed.id && parsed.command) {
      // Direct server config
      configData = parsed as MCPServerConfig;
    } else {
      console.error("Invalid config format. Expected server config with 'id' and 'command'");
      return 1;
    }
  } catch (err) {
    console.error(`Failed to read config: ${err}`);
    return 1;
  }

  // Generate ID if not provided
  if (!configData.id) {
    configData.id = path.basename(configFile, ".json");
  }

  // Check for dangerous servers
  if (isServerDangerous(configData) && !allowDangerous) {
    console.error(`\x1b[31mError: Server "${configData.id}" is marked as dangerous.\x1b[0m`);
    console.error("These servers can execute arbitrary code on your system.");
    console.error("To add anyway, use: altos mcp add --dangerous");
    console.error();
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const answer = await new Promise<string>((resolve) => {
      rl.question("Add dangerous server anyway? [y/N] ", resolve);
    });
    rl.close();

    if (answer.toLowerCase() !== "y") {
      console.log("Cancelled.");
      return 1;
    }
    configData.dangerous = true;
  }

  // Validate
  const validation = validateMCPServerConfig(configData);
  if (!validation.valid) {
    console.error("Invalid server configuration:");
    for (const err of validation.errors) {
      console.error(`  - ${err}`);
    }
    return 1;
  }

  // Save to config
  const target = projectScope ? "project" : "global";
  addMCPServerToConfig(configData, target, cwd);

  if (asJson) {
    console.log(
      JSON.stringify(
        {
          success: true,
          server: configData,
          target,
          configPath: target === "global" ? getGlobalMCPConfigPath() : getProjectMCPConfigPath(cwd),
        },
        null,
        2,
      ),
    );
    return 0;
  }

  console.log(`✓ Added MCP server: ${configData.id}`);
  console.log(`  Name: ${configData.name}`);
  console.log(`  Command: ${configData.command}`);
  console.log(
    `  Config: ${target === "global" ? getGlobalMCPConfigPath() : getProjectMCPConfigPath(cwd)}`,
  );
  console.log();
  console.log("To connect and list tools, run:");
  console.log(`  altos mcp inspect ${configData.id}`);

  return 0;
}

/**
 * altos mcp remove <server-id> - Remove an MCP server
 */
async function cmdRemove(
  cwd: string,
  serverId: string,
  projectScope: boolean | undefined,
  asJson: boolean | undefined,
): Promise<number> {
  const target = projectScope ? "project" : "global";

  const removed = removeMCPServerFromConfig(serverId, target, cwd);

  if (asJson) {
    console.log(JSON.stringify({ success: removed, serverId, target }, null, 2));
    return removed ? 0 : 1;
  }

  if (removed) {
    console.log(`✓ Removed MCP server: ${serverId}`);
    return 0;
  } else {
    console.error(`Server not found: ${serverId}`);
    return 1;
  }
}

/**
 * altos mcp inspect <server-id> - Inspect an MCP server
 */
async function cmdInspect(cwd: string, serverId: string, asJson?: boolean): Promise<number> {
  const { servers } = loadAllMCPConfigs(cwd);
  const server = servers.find((s) => s.id === serverId);

  if (!server) {
    console.error(`Server not found: ${serverId}`);
    return 1;
  }

  // Connect to get tool list
  const manager = createMCPClientManager();
  try {
    await manager.connectServer(server);
  } catch (err) {
    console.error(`Failed to connect to server: ${err}`);
    return 1;
  }

  const connected = manager.getServer(serverId);
  const tools = manager.getTools();

  if (asJson) {
    console.log(
      JSON.stringify(
        {
          id: server.id,
          name: server.name,
          command: server.command,
          args: server.args,
          enabled: server.enabled,
          dangerous: isServerDangerous(server),
          connection: connected
            ? {
                state: connected.state,
                protocolVersion: connected.protocolVersion,
                connectedAt: connected.connectedAt,
                error: connected.error,
              }
            : null,
          tools: connected?.tools.map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
          })),
        },
        null,
        2,
      ),
    );
    await manager.shutdown();
    return 0;
  }

  console.log(`\n=== MCP Server: ${server.id} ===\n`);
  console.log(`Name:     ${server.name}`);
  console.log(`Command:  ${server.command}`);
  console.log(`Args:     ${server.args?.join(" ") ?? "(none)"}`);
  console.log(`Enabled:  ${server.enabled !== false ? "yes" : "no"}`);
  console.log(`Dangerous: ${isServerDangerous(server) ? "\x1b[31mYES\x1b[0m" : "no"}`);

  console.log("\n--- Connection Status ---");
  if (connected) {
    console.log(`State:           ${connected.state}`);
    console.log(`Protocol Version: ${connected.protocolVersion ?? "unknown"}`);
    if (connected.error) {
      console.log(`Error:            ${connected.error}`);
    }
    if (connected.connectedAt) {
      console.log(`Connected:        ${new Date(connected.connectedAt).toLocaleString()}`);
    }
  } else {
    console.log("Not connected");
  }

  console.log("\n--- Tools ---");
  const mcpTools = connected?.tools ?? [];
  if (mcpTools.length === 0) {
    console.log("  No tools available");
  } else {
    for (const tool of mcpTools) {
      const isWrite = /create|update|edit|delete|remove|add|post|put|patch|send/i.test(tool.name);
      const badge = isWrite ? " \x1b[33m[WRITE]\x1b[0m" : "";
      console.log(`  • ${tool.name}${badge}`);
      if (tool.description) {
        console.log(`    ${tool.description}`);
      }
    }
  }

  console.log();
  await manager.shutdown();
  return 0;
}

/**
 * altos mcp tools - List all available MCP tools
 */
async function cmdTools(cwd: string, asJson: boolean | undefined): Promise<number> {
  const { servers } = loadAllMCPConfigs(cwd);

  if (servers.length === 0) {
    if (asJson) {
      console.log(JSON.stringify({ tools: [], servers: 0 }, null, 2));
    } else {
      console.log("No MCP servers configured.");
    }
    return 0;
  }

  // Connect to all servers
  const manager = createMCPClientManager();
  try {
    await manager.loadServers(cwd);
  } catch (err) {
    console.error(`Warning: Some servers failed to connect: ${err}`);
  }

  const servers_list = manager.listServers();
  const allTools = manager.getTools();

  if (asJson) {
    const result: Record<string, unknown>[] = [];
    for (const server of servers_list) {
      for (const tool of server.tools) {
        const wrapper = manager.getTool(`mcp.${server.id}.${tool.name}`);
        const isWrite = wrapper
          ? ((wrapper as unknown as { isWrite?: boolean }).isWrite ?? false)
          : false;
        result.push({
          serverId: server.id,
          serverName: server.name,
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
          isWrite,
        });
      }
    }
    console.log(JSON.stringify({ tools: result, total: result.length }, null, 2));
    return 0;
  }

  console.log(`\n=== MCP Tools (${allTools.length} total) ===\n`);

  for (const server of servers_list) {
    if (server.tools.length === 0) continue;

    console.log(`\n--- ${server.name} (${server.id}) ---\n`);

    for (const tool of server.tools) {
      const wrapper = manager.getTool(`mcp.${server.id}.${tool.name}`);
      const isWrite = wrapper
        ? ((wrapper as unknown as { isWrite?: boolean }).isWrite ?? false)
        : false;
      const badge = isWrite ? " \x1b[33m[WRITE]\x1b[0m" : "";
      console.log(`  ${tool.name}${badge}`);
      if (tool.description) {
        console.log(`    ${tool.description}`);
      }
    }
  }

  console.log();
  await manager.shutdown();
  return 0;
}

/**
 * altos mcp serve - Start MCP server mode
 */
async function cmdServe(
  transport: "stdio" | "tcp" = "stdio",
  port?: number,
  host?: string,
): Promise<number> {
  const { createMCPServer, createStdioMCPServer } = await import("@altos/mcp");

  console.log("\n=== Altos MCP Server ===\n");
  console.log(`Transport: ${transport.toUpperCase()}`);

  if (transport === "tcp") {
    console.log(`Listening on: ${host ?? "127.0.0.1"}:${port ?? 3000}`);
  } else {
    console.log("Mode: Read-only (stdio)");
    console.log("  - repo_map (read repository structure)");
    console.log("  - session_status (read current session)");
    console.log("  - search (search files)");
    console.log("  - run_skill (run a skill)");
    console.log();
    console.log("⚠️  Only safe, read-only tools are exposed by default.");
  }
  console.log();

  if (transport === "stdio") {
    // Use the StdioMCPServer for stdio transport
    const server = createStdioMCPServer();
    server.exposeReadOnlyCapabilities();

    // Start reading from stdin - this blocks
    server.start();

    // Keep process alive - this blocks until the process is killed
    await new Promise<void>((resolve) => {
      process.on("SIGINT", () => {
        server.stop();
        resolve();
      });
      process.on("SIGTERM", () => {
        server.stop();
        resolve();
      });
    });
  } else {
    // Use the TCP server
    const server = createMCPServer(port ?? 3000, host ?? "127.0.0.1");
    server.exposeReadOnlyCapabilities();

    try {
      await server.start();
      console.log("Press Ctrl+C to stop.\n");
    } catch (err) {
      console.error(`Failed to start server: ${err}`);
      return 1;
    }

    // Keep process alive - this blocks until the process is killed
    await new Promise<void>((resolve) => {
      process.on("SIGINT", () => {
        server.stop();
        resolve();
      });
      process.on("SIGTERM", () => {
        server.stop();
        resolve();
      });
    });
  }

  return 0;
}
