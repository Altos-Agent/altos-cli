// @altos/cli - Main CLI entry point
// Designed for fast startup: version/help skip all heavy imports

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { createInterface } from "readline";

// ============================================================================
// FAST PATH: version and help - minimal import surface
// ============================================================================
// These commands only need VERSION. All heavy packages (AI, MCP, plugins,
// memory, code-index, sandbox) are lazily imported only when needed.

const VERSION = "0.1.0";

// ============================================================================
// Types
// ============================================================================

export interface CLIOptions {
  version?: boolean;
  help?: boolean;
  config?: string;
  command?: string;
  args?: string[];
  print?: string;
  json?: boolean;
  run?: string;
  interactive?: boolean;
  pluginArgs?: string[];
  skillArgs?: string[];
  packageArgs?: string[];
  mcpArgs?: string[];
  agentArgs?: string[];
  sandboxArgs?: string[];
  serveArgs?: string[];
  cloudArgs?: string[];
  sandbox?: boolean;
}

interface DoctorResult {
  os: string;
  nodeVersion: string;
  altosVersion: string;
  providers: {
    id: string;
    name: string;
    configured: boolean;
    envVar: string;
    models: number;
  }[];
  configFiles: {
    path: string;
    exists: boolean;
  }[];
  issues: string[];
}

interface SessionState {
  sessionId: string;
  cwd: string;
  modelConfig: { model?: string; provider?: string };
  createdAt: number;
  lastActivity: number;
  messageCount: number;
  tokenUsage?: { input: number; output: number };
  permissionMode: string;
  status?: string;
}

interface RecoveredSession {
  state: SessionState;
  canResume: boolean;
}

// ============================================================================
// Config Paths
// ============================================================================

function getAltosConfigPaths(): { global: string; local: string } {
  const home = os.homedir();
  const cwd = process.cwd();
  return {
    global: path.join(home, ".altos", "config.json"),
    local: path.join(cwd, ".altos", "config.json"),
  };
}

function getAltosStateDir(): string {
  return path.join(os.homedir(), ".altos", "state");
}

function getSessionStatePath(sessionId: string): string {
  return path.join(getAltosStateDir(), `session_${sessionId}.json`);
}

function getActiveSessionPath(): string {
  return path.join(getAltosStateDir(), "active_session.json");
}

// ============================================================================
// Session Recovery (lightweight - no heavy imports)
// ============================================================================

export function getRecoverableSessions(): RecoveredSession[] {
  const stateDir = getAltosStateDir();
  if (!fs.existsSync(stateDir)) return [];

  const sessions: RecoveredSession[] = [];
  try {
    const files = fs
      .readdirSync(stateDir)
      .filter((f) => f.startsWith("session_") && f.endsWith(".json"));
    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(stateDir, file), "utf-8");
        const state: SessionState = JSON.parse(content);
        const canResume = state.status !== "completed" && state.status !== "failed";
        sessions.push({ state, canResume });
      } catch {
        // Skip corrupted state files
      }
    }
  } catch {
    // State dir doesn't exist
  }
  return sessions;
}

export async function recoverSession(sessionId: string): Promise<RecoveredSession | null> {
  const filePath = getSessionStatePath(sessionId);
  if (!fs.existsSync(filePath)) return null;

  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const state: SessionState = JSON.parse(content);
    return { state, canResume: state.status !== "completed" && state.status !== "failed" };
  } catch {
    return null;
  }
}

export function saveSessionState(state: SessionState): void {
  const stateDir = getAltosStateDir();
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(getSessionStatePath(state.sessionId), JSON.stringify(state, null, 2));
  fs.writeFileSync(
    getActiveSessionPath(),
    JSON.stringify({ sessionId: state.sessionId, savedAt: Date.now() }, null, 2),
  );
}

export function clearActiveSession(): void {
  const activePath = getActiveSessionPath();
  if (fs.existsSync(activePath)) fs.unlinkSync(activePath);
}

export function getActiveSessionId(): string | null {
  const activePath = getActiveSessionPath();
  if (!fs.existsSync(activePath)) return null;
  try {
    const content = fs.readFileSync(activePath, "utf-8");
    const data = JSON.parse(content);
    return data.sessionId ?? null;
  } catch {
    return null;
  }
}

// ============================================================================
// Argument Parsing
// ============================================================================

export function parseArgs(argv: string[]): CLIOptions {
  const opts: CLIOptions = {};
  const args = argv.slice(2);

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (arg === "--version" || arg === "-v") {
      opts.version = true;
      i++;
    } else if (arg === "--help" || arg === "-h") {
      opts.help = true;
      i++;
    } else if (arg.startsWith("--config=")) {
      opts.config = arg.split("=")[1];
      i++;
    } else if (arg === "--config" && args[i + 1]) {
      opts.config = args[i + 1];
      i += 2;
    } else if (arg === "-p" && args[i + 1]) {
      opts.print = args[i + 1];
      i += 2;
    } else if (arg === "--json") {
      opts.json = true;
      i++;
    } else if (arg === "--run" && args[i + 1]) {
      opts.run = args[i + 1];
      i += 2;
    } else if (arg === "--sandbox") {
      opts.sandbox = true;
      i++;
    } else if (arg === "run" && args[i + 1] && !opts.command) {
      opts.command = "run";
      opts.args = args.slice(i + 1);
      i += 2;
    } else if (!arg.startsWith("-")) {
      opts.command = arg;
      if (arg === "plugin") {
        opts.pluginArgs = args.slice(i + 1);
        break;
      }
      if (arg === "skill") {
        opts.skillArgs = args.slice(i + 1);
        break;
      }
      if (arg === "package") {
        opts.packageArgs = args.slice(i + 1);
        break;
      }
      if (arg === "agent") {
        opts.agentArgs = args.slice(i + 1);
        break;
      }
      if (arg === "sandbox") {
        opts.sandboxArgs = args.slice(i + 1);
        break;
      }
      if (arg === "serve") {
        opts.serveArgs = args.slice(i + 1);
        break;
      }
      if (arg === "cloud") {
        opts.cloudArgs = args.slice(i + 1);
        break;
      }
      opts.args = args.slice(i + 1);
      break;
    } else {
      i++;
    }
  }

  return opts;
}

// ============================================================================
// Print Version / Help (no heavy imports)
// ============================================================================

function printVersion(): void {
  console.log(`altos v${VERSION}`);
}

function printHelp(): void {
  console.log(`Altos v${VERSION}
Usage: altos [options] [command] [args]

Commands:
  altos              Start interactive REPL
  altos -p "question"  Print mode — ask a question, print answer
  altos run "task"    Run a task non-interactively
  altos models        List available models
  altos config get [key]  Get config value (default: all)
  altos config set <key> <value>  Set config value
  altos doctor        Run diagnostics
  altos context "prompt" [--json] [--evidence]  Show relevant context for a prompt
  altos tools [--list|--show=<name>] [--json]  List or show tool definitions
  altos plugin list|add|remove|inspect|create|grant|deny|revoke  Plugin management
  altos skill list|inspect|run|create  Skill management
  altos package list|add|remove|inspect|create  Package management
  altos mcp list|add|remove|inspect|tools|serve  MCP server management
  altos sandbox status|run                  Sandbox management
  altos serve [--port <n>] [--host <addr>]  Start local API server
  altos cloud status|run                     Cloud session management
  altos eval run [--scenario=<name>] [--json] [--list]  Run eval scenarios
  altos replay <session-id> [--json] [--show-diff]      Replay a recorded session
  altos perf          Show performance metrics and startup timing

Options:
  --version, -v       Print version
  --help, -h          Print help
  --config=<path>     Use config file
  -p "question"       Print mode (with --json for JSON output)
  --json              Output JSON (use with -p)
  --run "task"        Run task non-interactively
  --sandbox           Run in sandboxed mode
`);
}

// ============================================================================
// Lazy Command Loaders
// ============================================================================
// All commands are imported dynamically only when needed.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LazyCommand = () => Promise<(...args: any[]) => Promise<number>>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const commandLoaders: Record<string, LazyCommand> = {
  tools: () => import("./commands/tools.js").then((m) => m.runToolsCommand as any),
  doctor: () => import("./commands/doctor.js").then((m) => m.runDoctorCommand as any),
  models: () => import("./commands/models.js").then((m) => m.runModelsCommand as any),
  config: () => import("./commands/config.js").then((m) => m.runConfigCommand as any),
  context: () => import("./commands/context.js").then((m) => m.runContextCommandCLI as any),
  memory: () => import("./commands/memory.js").then((m) => m.runMemoryCommand as any),
  index: () => import("./commands/index.js").then((m) => m.runIndexCommand as any),
  map: () => import("./commands/map.js").then((m) => m.runMapCommand as any),
  search: () => import("./commands/search.js").then((m) => m.runSearchCommand as any),
  plugin: () => import("./commands/plugins.js").then((m) => m.runPluginCommand as any),
  skill: () => import("./commands/skills.js").then((m) => m.runSkillCommand as any),
  package: () => import("./commands/packages.js").then((m) => m.runPackageCommand as any),
  mcp: () => import("./commands/mcp.js").then((m) => m.runMCPCommand as any),
  agent: () => import("./commands/agents.js").then((m) => m.runAgentCommand as any),
  sandbox: () => import("./commands/sandbox.js").then((m) => m.runSandboxCommand as any),
  serve: () => import("./commands/serve.js").then((m) => m.runServeCommand as any),
  cloud: () => import("./commands/cloud.js").then((m) => m.runCloudCommand as any),
  eval: () => import("./commands/evals.js").then((m) => m.runEvalCommand as any),
  replay: () => import("./commands/replay.js").then((m) => m.runReplayCommand as any),
  perf: () => import("./commands/perf.js").then((m) => m.runPerfCommand as any),
  interactive: () => import("./commands/interactive.js").then((m) => m.runInteractive as any),
  run: () => import("./commands/run.js").then((m) => m.runRunCommand as any),
  print: () => import("./commands/print.js").then((m) => m.runPrintCommand as any),
};

async function loadCommand(name: string) {
  const loader = commandLoaders[name];
  if (!loader) return null;
  return loader();
}

// ============================================================================
// Subcommand Parsers (for commands that have subcommands)
// ============================================================================

function parsePluginArgs(args: string[]) {
  return { subcmd: args[0] ?? "list", rest: args.slice(1) };
}

function parseSkillArgs(args: string[]) {
  return { subcmd: args[0] ?? "list", rest: args.slice(1) };
}

function parseMCPArgs(args: string[]) {
  return { subcmd: args[0] ?? "list", rest: args.slice(1) };
}

function parseAgentArgs(args: string[]) {
  return { subcmd: args[0] ?? "list", rest: args.slice(1) };
}

function parsePackageArgs(args: string[]) {
  return { subcmd: args[0] ?? "list", rest: args.slice(1) };
}

function parseSandboxArgs(args: string[]) {
  return { subcmd: args[0] ?? "status", rest: args.slice(1) };
}

function parseServeArgs(args: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = { port: 3000, host: "localhost" };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--port" && args[i + 1]) {
      result.port = parseInt(args[++i], 10);
    } else if (args[i] === "--host" && args[i + 1]) {
      result.host = args[++i];
    }
  }
  return result;
}

function parseCloudArgs(args: string[]) {
  return { subcmd: args[0] ?? "status", rest: args.slice(1) };
}

function parseEvalArgs(args: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const a of args) {
    if (a.startsWith("--scenario=")) result.scenario = a.split("=")[1];
    else if (a === "--json") result.json = true;
    else if (a === "--list") result.list = true;
  }
  return result;
}

// ============================================================================
// Main Run
// ============================================================================

export async function run(argv: string[]): Promise<number> {
  const opts = parseArgs(argv);

  // FAST PATH: --version and --help need zero heavy imports
  if (opts.version) {
    printVersion();
    return 0;
  }

  if (opts.help) {
    printHelp();
    return 0;
  }

  // Print mode
  if (opts.print !== undefined) {
    const cmd = await loadCommand("print");
    if (!cmd) { console.error("Print command not available"); return 1; }
    return cmd({ question: opts.print, json: opts.json ?? false });
  }

  // Run mode
  if (opts.command === "run" && opts.args?.[0]) {
    const cmd = await loadCommand("run");
    if (!cmd) { console.error("Run command not available"); return 1; }
    return cmd({ task: opts.args[0], sandbox: opts.sandbox ?? false });
  }

  // Interactive mode (no command, or "altos" bare)
  if (!opts.command || opts.command === "interactive") {
    const cmd = await loadCommand("interactive");
    if (!cmd) { console.error("Interactive mode not available"); return 1; }
    return cmd({});
  }

  // Lazy-loaded commands
  const cmd = await loadCommand(opts.command);
  if (!cmd) {
    console.error(`Unknown command: ${opts.command}`);
    console.error("Run 'altos --help' for usage.");
    return 1;
  }

  // Route to command with parsed args
  switch (opts.command) {
    case "plugin":
      return cmd(process.cwd(), parsePluginArgs(opts.pluginArgs ?? []));
    case "skill":
      return cmd(process.cwd(), parseSkillArgs(opts.skillArgs ?? []));
    case "package":
      return cmd(process.cwd(), parsePackageArgs(opts.packageArgs ?? []));
    case "mcp":
      return cmd(process.cwd(), parseMCPArgs(opts.mcpArgs ?? []));
    case "agent":
      return cmd(process.cwd(), parseAgentArgs(opts.agentArgs ?? []));
    case "sandbox":
      return cmd(process.cwd(), parseSandboxArgs(opts.sandboxArgs ?? []));
    case "serve":
      return cmd(parseServeArgs(opts.serveArgs ?? []));
    case "cloud":
      return cmd(parseCloudArgs(opts.cloudArgs ?? []));
    case "eval":
      return cmd(parseEvalArgs(opts.args ?? []));
    case "replay":
      return cmd({ sessionId: opts.args?.[0], json: opts.args?.includes("--json"), showDiff: opts.args?.includes("--show-diff") });
    case "tools":
      return cmd(process.cwd(), {
        list: opts.args?.includes("--list") ?? true,
        show: opts.args?.find((a) => a.startsWith("--show="))?.split("=")[1],
        json: opts.args?.includes("--json") ?? false,
      });
    case "context":
    case "doctor":
    case "models":
    case "config":
    case "memory":
    case "index":
    case "map":
    case "search":
    case "perf":
      return cmd({ args: opts.args ?? [] });
    default:
      return cmd({ args: opts.args ?? [] });
  }
}
