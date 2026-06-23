// altos agent CLI commands

import { SubAgentManager, type SubAgentDefinition } from "@altos/core";

export interface AgentCommandOptions {
  list?: boolean;
  inspect?: string;
  run?: string;
  task?: string;
  cwd?: string;
  json?: boolean;
}

export async function runAgentCommand(cwd: string, options: AgentCommandOptions): Promise<number> {
  // Initialize manager
  const manager = new SubAgentManager();
  // registerBuiltInSubagents(manager); // TODO: add built-in subagents

  if (options.inspect) {
    return cmdInspect(manager, options.inspect, options.json);
  }
  if (options.run) {
    if (!options.task) {
      console.error("Error: --task required when using --run");
      console.error("Usage: altos agent run <name> --task <task-description>");
      return 1;
    }
    return cmdRun(manager, options.run, options.task);
  }
  // Default: list
  return cmdList(manager, options.json);
}

// =============================================================================
// altos agent list
// =============================================================================

async function cmdList(manager: SubAgentManager, asJson?: boolean): Promise<number> {
  const agents = manager.getAllDefinitions();

  if (asJson) {
    console.log(
      JSON.stringify(
        {
          agents: agents.map((a) => ({
            name: a.name,
            description: a.description,
            read_only: a.read_only ?? false,
            memory_scope: a.memory_scope,
            tools_count: a.allowed_tools.length,
          })),
          total: agents.length,
        },
        null,
        2,
      ),
    );
    return 0;
  }

  console.log("\n=== Altos Subagents ===\n");
  if (agents.length === 0) {
    console.log("  No subagents registered.");
  } else {
    for (const agent of agents) {
      const ro = agent.read_only ? " [READ-ONLY]" : " [READ-WRITE]";
      console.log(`  ${agent.name.padEnd(16)} ${agent.description}${ro}`);
    }
  }

  console.log();
  console.log("  Use 'altos agent inspect <name>' for details.");
  console.log("  Use 'altos agent run <name> --task <task>' to run a subagent.");
  console.log();

  return 0;
}

// =============================================================================
// altos agent inspect <name>
// =============================================================================

async function cmdInspect(
  manager: SubAgentManager,
  name: string,
  asJson?: boolean,
): Promise<number> {
  const agent = manager.getDefinition(name);

  if (!agent) {
    console.error(`Subagent not found: ${name}`);
    console.error("\nAvailable subagents:");
    for (const def of manager.getAllDefinitions()) {
      console.error(`  - ${def.name}: ${def.description}`);
    }
    return 1;
  }

  if (asJson) {
    console.log(JSON.stringify(agent, null, 2));
    return 0;
  }

  console.log(`\n=== Subagent: ${agent.name} ===\n`);
  console.log(`Description:  ${agent.description}`);
  console.log(`Mode:         ${agent.read_only ? "READ-ONLY" : "READ-WRITE"}`);
  console.log(`Memory Scope: ${agent.memory_scope}`);

  if (agent.model_preference) {
    console.log("\n--- Model Preference ---");
    if (agent.model_preference.provider)
      console.log(`  Provider: ${agent.model_preference.provider}`);
    if (agent.model_preference.model) console.log(`  Model:    ${agent.model_preference.model}`);
    if (agent.model_preference.temperature)
      console.log(`  Temp:     ${agent.model_preference.temperature}`);
  }

  console.log("\n--- Allowed Tools ---");
  if (agent.allowed_tools.length === 0) {
    console.log("  (none)");
  } else {
    for (const tool of agent.allowed_tools) {
      console.log(`  • ${tool}`);
    }
  }

  console.log("\n--- Permission Profile ---");
  console.log(`  Read:    ${agent.permission_profile.read ? "✓" : "✗"}`);
  console.log(`  Write:   ${agent.permission_profile.write ? "✓" : "✗"}`);
  console.log(`  Execute: ${agent.permission_profile.execute ? "✓" : "✗"}`);
  console.log(`  Network: ${agent.permission_profile.network ? "✓" : "✗"}`);
  if (agent.permission_profile.paths?.length) {
    console.log(`  Paths:   ${agent.permission_profile.paths.join(", ")}`);
  }

  console.log("\n--- System Prompt ---\n");
  console.log(agent.system_prompt);
  console.log();

  return 0;
}

// =============================================================================
// altos agent run <name> --task <task>
// =============================================================================

async function cmdRun(manager: SubAgentManager, name: string, task: string): Promise<number> {
  const agent = manager.getDefinition(name);

  if (!agent) {
    console.error(`Subagent not found: ${name}`);
    console.error("\nAvailable subagents:");
    for (const def of manager.getAllDefinitions()) {
      console.error(`  - ${def.name}: ${def.description}`);
    }
    return 1;
  }

  console.log(`\n=== Running Subagent: ${name} ===\n`);
  console.log(`Task: ${task}\n`);
  console.log(`Mode: ${agent.read_only ? "READ-ONLY" : "READ-WRITE"}`);
  console.log(
    `Tools: ${agent.allowed_tools.slice(0, 5).join(", ")}${agent.allowed_tools.length > 5 ? "..." : ""}`,
  );
  console.log();

  // Spawn the subagent instance
  const instance = await manager.spawn(name, { task });

  console.log(`Spawned instance: ${instance.id}`);
  console.log("\nNote: Actual subagent execution requires integration with the agent runtime.");
  console.log("This CLI command shows the subagent definition and spawns an instance.");
  console.log("\nSubagent Result Structure (when completed):");
  console.log(
    JSON.stringify(
      {
        success: true,
        output: "Subagent output would appear here",
        artifacts: [],
        summary: "Summary of work done",
        durationMs: 1000,
      },
      null,
      2,
    ),
  );

  console.log();
  return 0;
}
