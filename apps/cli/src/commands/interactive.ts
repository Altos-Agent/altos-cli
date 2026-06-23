// altos interactive mode - full REPL
// All heavy imports are lazy (inside the async function body)
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import type { AgentSession } from "@altos/core";
import type { MemoryProvider } from "@altos/memory";

const VERSION = "0.1.0";

function getAltosStateDir(): string {
  return path.join(os.homedir(), ".altos", "state");
}

function getActiveSessionPath(): string {
  return path.join(getAltosStateDir(), "active_session.json");
}

function getSessionStatePath(sessionId: string): string {
  return path.join(getAltosStateDir(), `session_${sessionId}.json`);
}

function readActiveSession(): string | null {
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

function writeActiveSession(sessionId: string): void {
  const stateDir = getAltosStateDir();
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(getActiveSessionPath(), JSON.stringify({ sessionId, savedAt: Date.now() }));
}

function writeSessionState(state: Record<string, unknown>): void {
  const stateDir = getAltosStateDir();
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(getSessionStatePath(state.sessionId as string), JSON.stringify(state, null, 2));
  writeActiveSession(state.sessionId as string);
}

function deleteActiveSession(): void {
  const activePath = getActiveSessionPath();
  if (fs.existsSync(activePath)) fs.unlinkSync(activePath);
}

function readSessionState(sessionId: string): { state: Record<string, unknown>; canResume: boolean } | null {
  const filePath = getSessionStatePath(sessionId);
  if (!fs.existsSync(filePath)) return null;
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const state = JSON.parse(content);
    return { state, canResume: state.status !== "completed" && state.status !== "failed" };
  } catch {
    return null;
  }
}

function readConfiguredMemoryType(): string | null {
  const home = os.homedir();
  const cwd = process.cwd();
  const globalPath = path.join(home, ".altos", "config.json");
  const localPath = path.join(cwd, ".altos", "config.json");
  for (const p of [localPath, globalPath]) {
    if (fs.existsSync(p)) {
      try {
        const config = JSON.parse(fs.readFileSync(p, "utf-8"));
        if (config.memory?.use) return config.memory.use as string;
      } catch {}
    }
  }
  return null;
}

export async function runInteractive(_opts: Record<string, unknown>): Promise<number> {
  const { createLogger, AgentRuntime } = await import("@altos/core");
  const { getDefaultRegistry } = await import("@altos/ai");
  const { getMemoryProvider } = await import("@altos/memory");
  const { createInterface } = await import("readline");
  const { createAllTools } = await import("@altos/tools");

  const logger = createLogger("altos:interactive", "info");
  const registry = getDefaultRegistry();
  const providers = registry.listProviders();

  const activeId = readActiveSession();
  if (activeId) {
    const recovered = readSessionState(activeId);
    if (recovered && recovered.canResume) {
      console.log(
        `\n[Recovered session ${recovered.state.sessionId} from ${new Date((recovered.state.lastActivity as number)).toLocaleString()}]\n`,
      );
    }
  }

  if (providers.length === 0) {
    console.error("No providers registered. Run 'altos doctor' for diagnostics.");
    return 1;
  }

  const provider = providers[0];
  const model = provider.listModels()[0];

  const runtime = new AgentRuntime({
    cwd: process.cwd(),
    logger,
    autoPermission: false,
    permissionHandler: async (name, _toolCall, reason) => {
      console.log(`\n⚠ Permission required: ${name}`);
      if (reason) console.log(`  Reason: ${reason}`);
      return false;
    },
  });

  const toolRegistry = await createAllTools([process.cwd()]);
  const tools = toolRegistry.listTools();
  for (const tool of tools) {
    runtime.registerTool({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema as unknown as Record<string, unknown>,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      handler: tool.execute as any,
    });
  }

  let session: AgentSession;
  if (activeId) {
    const recovered = readSessionState(activeId);
    if (recovered && recovered.canResume) {
      session = await runtime.startSession({
        id: recovered.state.sessionId as string,
        cwd: recovered.state.cwd as string,
        modelConfig: recovered.state.modelConfig as { model?: string; provider?: string },
      });
    } else {
      session = await runtime.startSession({
        modelConfig: { model: model.id, provider: provider.id },
      });
    }
  } else {
    session = await runtime.startSession({
      modelConfig: { model: model.id, provider: provider.id },
    });
  }

  let memoryProvider: MemoryProvider | null = null;
  try {
    const memoryType = readConfiguredMemoryType();
    if (memoryType) {
      memoryProvider = await getMemoryProvider(memoryType as Parameters<typeof getMemoryProvider>[0], process.cwd());
    }
  } catch (err) {
    console.warn("Memory provider initialization failed:", err);
  }

  console.log(`
╔══════════════════════════════════════════╗
║  Altos v${VERSION} — Interactive Mode         ║
╠══════════════════════════════════════════╣
║  Type /help for commands                  ║
║  Press Ctrl+C to pause                    ║
╚══════════════════════════════════════════╝
  `);

  const ctx = {
    sessionId: session.id,
    model: model.id,
    provider: provider.id,
    cwd: process.cwd(),
    permissionMode: "ask",
    memoryAdapter: memoryProvider,
    runtime,
    session,
    tokenUsage: undefined as { input: number; output: number } | undefined,
  };

  let isExiting = false;

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "altos> ",
  });

  const saveInterval = setInterval(() => {
    if (!isExiting) {
      writeSessionState({
        sessionId: session.id,
        cwd: session.cwd,
        modelConfig: session.modelConfig,
        createdAt: session.createdAt,
        lastActivity: Date.now(),
        messageCount: session.getEventCount(),
        permissionMode: ctx.permissionMode,
        tokenUsage: ctx.tokenUsage,
        status: session.status,
      });
    }
  }, 30000);

  process.on("SIGINT", () => {
    if (isExiting) {
      process.exit(130);
    }
    isExiting = true;
    console.log("\n\n[Interrupted] Type /exit to quit, or /resume to continue...");
  });

  rl.on("line", async (line: string) => {
    if (isExiting && line.trim() !== "/resume" && line.trim() !== "/exit") {
      if (line.trim() === "") { rl.prompt(); return; }
      console.log("Type /resume or /exit");
      rl.prompt();
      return;
    }

    const input = line.trim();
    if (!input) { rl.prompt(); return; }
    isExiting = false;

    if (input.startsWith("/")) {
      const [cmdName, ...cmdArgs] = input.slice(1).split(/\s+/);
      if (cmdName === "help") {
        console.log(`
=== Altos Commands ===
/help              Show this help
/model             Show current model and provider
/tools [--list|--show=<name>]  List or show tools
/permissions       Show current permission mode and recent decisions
/memory            Show memory adapter and recent entries
/compact           Manually trigger context compaction
/exit              Exit Altos
        `);
      } else if (cmdName === "exit") {
        isExiting = true;
        console.log("Goodbye!");
        clearInterval(saveInterval);
        writeSessionState({
          sessionId: session.id, cwd: session.cwd, modelConfig: session.modelConfig,
          createdAt: session.createdAt, lastActivity: Date.now(), messageCount: session.getEventCount(),
          permissionMode: ctx.permissionMode, tokenUsage: ctx.tokenUsage, status: "completed",
        });
        deleteActiveSession();
        rl.close();
        await runtime.close();
        return;
      } else if (cmdName === "model") {
        const reg = getDefaultRegistry();
        const prov = reg.getProvider(ctx.provider);
        const models = prov?.listModels() ?? [];
        const current = models.find((m) => m.id === ctx.model);
        console.log(`\n=== Model ===\nProvider: ${prov?.name ?? ctx.provider}\nModel: ${current?.name ?? ctx.model}\n`);
      } else if (cmdName === "doctor") {
        const { runDoctorCommand } = await import("./doctor.js");
        await runDoctorCommand({ args: [] });
      } else if (cmdName === "compact") {
        console.log("\n[Compacting session context...]");
        const budgetStatus = runtime.getBudgetStatus(session.id);
        console.log(`  Budget status: ${budgetStatus.level} (${(budgetStatus.usageRatio * 100).toFixed(1)}% used)`);
        const compacted = await runtime.compactSession(session.id);
        if (compacted) {
          const newStatus = runtime.getBudgetStatus(session.id);
          console.log(`  Compaction complete. New budget: ${(newStatus.usageRatio * 100).toFixed(1)}% used`);
        } else {
          console.log("  Nothing to compact or compaction skipped.");
        }
      } else {
        console.log(`Unknown command: /${cmdName}`);
      }
      rl.prompt();
      return;
    }

    process.stdout.write("\n");

    try {
      await runtime.appendUserMessage(session.id, input);

      let done = false;
      let iterations = 0;
      const maxIterations = 50;

      while (!done && iterations < maxIterations) {
        const result = await runtime.executeIteration(session.id, (delta) => {
          process.stdout.write(delta);
        });
        done = result.done;
        iterations++;
      }

      process.stdout.write("\n");
    } catch (err) {
      console.error(`\nError: ${err}`);
    }

    rl.prompt();
  });

  rl.on("close", async () => {
    clearInterval(saveInterval);
    writeSessionState({
      sessionId: session.id, cwd: session.cwd, modelConfig: session.modelConfig,
      createdAt: session.createdAt, lastActivity: Date.now(), messageCount: session.getEventCount(),
      permissionMode: ctx.permissionMode, tokenUsage: ctx.tokenUsage, status: session.status,
    });
    await runtime.close();
  });

  return 0;
}
