// altos memory command - memory provider management
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

function getAltosConfigPaths() {
  const home = os.homedir();
  const cwd = process.cwd();
  return {
    global: path.join(home, ".altos", "config.json"),
    local: path.join(cwd, ".altos", "config.json"),
  };
}

function loadConfig(): { path: string; config: Record<string, unknown> } {
  const paths = getAltosConfigPaths();
  const configPath = fs.existsSync(paths.global)
    ? paths.global
    : fs.existsSync(paths.local)
      ? paths.local
      : paths.global;

  let config: Record<string, unknown> = {};
  if (fs.existsSync(configPath)) {
    try {
      config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    } catch {
      /* ignore */
    }
  }
  return { path: configPath, config };
}

export async function runMemoryCommand(opts: { args: string[] }): Promise<number> {
  const subcmd = opts.args[0] ?? "status";

  if (subcmd === "status") {
    const { path: configPath, config } = loadConfig();
    const provider = (config.memory as Record<string, unknown>)?.use as string | undefined;

    console.log("\n=== Memory Status ===\n");
    console.log(`Current provider: ${provider ?? "not set"}`);
    console.log(`Config file:      ${configPath}`);

    if (provider) {
      console.log("\nAvailable providers:");
      const providers = ["local", "hermes", "memplace", "codegraph"];
      for (const p of providers) {
        const isActive = p === provider;
        console.log(`  ${isActive ? "●" : "○"} ${p}`);
      }
    }

    console.log("\nUse 'altos memory use <provider>' to change provider.");
    console.log();
    return 0;
  }

  if (subcmd === "use") {
    const provider = opts.args[1];
    if (!provider || !["local", "hermes", "memplace", "codegraph"].includes(provider)) {
      console.error("Usage: altos memory use <local|hermes|memplace|codegraph>");
      console.error("\nAvailable providers:");
      console.error("  local     - Local file-based memory (default)");
      console.error("  hermes    - Hermes cloud memory");
      console.error("  memplace  - MemPlace memory service");
      console.error("  codegraph - CodeGraph knowledge graph");
      return 1;
    }

    const { path: configPath, config } = loadConfig();
    if (!config.memory) config.memory = {};
    config.memory = { use: provider };

    try {
      // Ensure directory exists
      const dir = path.dirname(configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
      console.log(`Memory provider set to: ${provider}`);
    } catch (err) {
      console.error(`Failed to save config: ${err}`);
      return 1;
    }
    return 0;
  }

  if (subcmd === "help") {
    console.log(`
altos memory - Memory provider management

Usage:
  altos memory              Show current memory status
  altos memory status       Show detailed memory status
  altos memory use <provider>  Set the memory provider

Available providers:
  local     - Local file-based memory (default)
  hermes    - Hermes cloud memory
  memplace  - MemPlace memory service
  codegraph - CodeGraph knowledge graph

Examples:
  altos memory              # Show current provider
  altos memory status       # Show detailed status
  altos memory use local    # Switch to local memory
  altos memory use hermes   # Switch to Hermes cloud
`);
    return 0;
  }

  console.error(`Unknown subcommand: ${subcmd}`);
  console.error("Use 'altos memory help' for usage.");
  return 1;
}
