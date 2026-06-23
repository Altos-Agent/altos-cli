// altos tools CLI command

import { createAllTools } from "@altos/tools";

export interface ToolsCommandOptions {
  list?: boolean;
  show?: string;
  json?: boolean;
  quiet?: boolean;
}

export async function runToolsCommand(
  workspaceRoot: string,
  options: ToolsCommandOptions,
): Promise<number> {
  const registry = createAllTools([workspaceRoot]);

  if (options.show) {
    const tool = registry.getTool(options.show);
    if (!tool) {
      console.error(`Tool not found: ${options.show}`);
      console.error("Use 'altos tools --list' to see available tools.");
      return 1;
    }

    if (options.json) {
      console.log(
        JSON.stringify(
          {
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
            outputSchema: tool.outputSchema,
            riskLevel: tool.riskLevel,
            requiredPermissions: tool.requiredPermissions,
          },
          null,
          2,
        ),
      );
    } else {
      console.log(`\n=== Tool: ${tool.name} ===\n`);
      console.log(`Description: ${tool.description}`);
      console.log(`Risk Level: ${riskBadge(tool.riskLevel)} (${tool.riskLevel})`);
      console.log("\nInput Schema:");
      console.log(JSON.stringify(tool.inputSchema, null, 2));
      console.log("\nOutput Schema:");
      console.log(JSON.stringify(tool.outputSchema, null, 2));
      if (tool.requiredPermissions.length > 0) {
        console.log("\nRequired Permissions:");
        for (const perm of tool.requiredPermissions) {
          console.log(
            `  - ${perm.type}${perm.path ? ` (${perm.path})` : ""}: ${perm.reason || "no reason"}`,
          );
        }
      } else {
        console.log("\nRequired Permissions: none");
      }
    }
    return 0;
  }

  // List all tools
  const tools = registry.listTools();

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          tools: tools.map((t) => ({
            name: t.name,
            description: t.description,
            riskLevel: t.riskLevel,
            permissions: t.requiredPermissions.map((p) => p.type),
          })),
          total: tools.length,
          workspace: registry.getWorkspaceRoots(),
        },
        null,
        2,
      ),
    );
    return 0;
  }

  if (options.quiet) {
    console.log(`${tools.length} tools`);
    return 0;
  }

  console.log(`\n=== Altos Tools (${tools.length} tools) ===\n`);

  // Group by category
  const fsTools = tools.filter((t) =>
    ["read_file", "write_file", "edit_file", "apply_patch", "list_dir"].includes(t.name),
  );
  const gitTools = tools.filter((t) => t.name.startsWith("git_"));
  const searchTools = tools.filter((t) => ["grep", "find_files"].includes(t.name));
  const shellTools = tools.filter((t) => ["bash"].includes(t.name));
  const otherTools = tools.filter(
    (t) =>
      !fsTools.includes(t) && !gitTools.includes(t) && !searchTools.includes(t) && !shellTools.includes(t),
  );

  if (fsTools.length > 0) {
    console.log("File System:");
    for (const tool of fsTools) {
      const risk = riskBadge(tool.riskLevel);
      console.log(`  ${risk} ${tool.name.padEnd(16)} ${tool.description}`);
    }
    console.log();
  }

  if (gitTools.length > 0) {
    console.log("Git:");
    for (const tool of gitTools) {
      const risk = riskBadge(tool.riskLevel);
      console.log(`  ${risk} ${tool.name.padEnd(16)} ${tool.description}`);
    }
    console.log();
  }

  if (searchTools.length > 0) {
    console.log("Search:");
    for (const tool of searchTools) {
      const risk = riskBadge(tool.riskLevel);
      console.log(`  ${risk} ${tool.name.padEnd(16)} ${tool.description}`);
    }
    console.log();
  }

  if (shellTools.length > 0) {
    console.log("Shell:");
    for (const tool of shellTools) {
      const risk = riskBadge(tool.riskLevel);
      console.log(`  ${risk} ${tool.name.padEnd(16)} ${tool.description}`);
    }
    console.log();
  }

  if (otherTools.length > 0) {
    console.log("Other:");
    for (const tool of otherTools) {
      const risk = riskBadge(tool.riskLevel);
      console.log(`  ${risk} ${tool.name.padEnd(16)} ${tool.description}`);
    }
    console.log();
  }

  console.log("Risk Levels: [LOW] [MED] [HIGH] [CRIT]");
  console.log(`\nWorkspace: ${registry.getWorkspaceRoots().join(", ")}`);
  console.log("\nUse 'altos tools --show <name>' for detailed info.");
  console.log("Use 'altos tools --json' for machine-readable output.");
  console.log("Use 'altos tools --quiet' to show only tool count.");

  return 0;
}

function riskBadge(risk: string): string {
  switch (risk) {
    case "low":
      return "[LOW ]";
    case "medium":
      return "[MED ]";
    case "high":
      return "[HIGH]";
    case "critical":
      return "[CRIT]";
    default:
      return "[????]";
  }
}
