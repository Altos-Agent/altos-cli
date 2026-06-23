import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { AgentRuntime, createLogger, type ToolHandler, type ToolResult } from "@altos/core";

export interface RuntimeFactory {
  create(
    caseId: string,
    fixtureRepo?: string,
    mocks?: ToolMockInput[],
  ): Promise<EvalRuntimeContext>;
  teardown(ctx: EvalRuntimeContext): Promise<void>;
}

export interface EvalRuntimeContext {
  runtime: AgentRuntime;
  sessionId: string;
  cwd: string;
  tempDir?: string;
}

export interface ToolMockInput {
  toolName: string;
  response?: unknown;
  error?: string;
  delayMs?: number;
}

async function copyDir(src: string, dest: string): Promise<void> {
  await fs.promises.mkdir(dest, { recursive: true });
  const entries = await fs.promises.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await fs.promises.copyFile(srcPath, destPath);
    }
  }
}

export function createRuntimeFactory(): RuntimeFactory {
  return {
    async create(caseId, fixtureRepo, mocks = []) {
      const logger = createLogger(`evals:${caseId}`, "warn");

      let tempDir: string | undefined;
      if (fixtureRepo && fs.existsSync(fixtureRepo)) {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `altos-eval-${caseId}-`));
        await copyDir(fixtureRepo, tempDir);
      }

      const effectiveCwd = tempDir ?? process.cwd();

      const runtime = new AgentRuntime({
        cwd: effectiveCwd,
        logger,
        autoPermission: false,
        permissionHandler: async (toolName, _toolCall, reason) => {
          logger.info(`Permission requested: ${toolName} — ${reason ?? "no reason"}`);
          return false;
        },
      });

      const { createAllTools } = await import("@altos/tools");
      const toolRegistry = createAllTools([effectiveCwd]);
      const tools = toolRegistry.listTools();

      for (const tool of tools) {
        const toolHandler: ToolHandler = async (args, context) => {
          const result = await tool.execute(args, {
            ...context,
            sessionId: context.sessionId || "eval",
          });
          return result;
        };
        runtime.registerTool({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema as unknown as Record<string, unknown>,
          handler: toolHandler,
        });
      }

      for (const mock of mocks) {
        const existing = runtime.getTool(mock.toolName);
        if (existing) {
          runtime.registerTool({
            ...existing,
            handler: async (_args, _context) => {
              if (mock.delayMs) await new Promise((r) => setTimeout(r, mock.delayMs));
              if (mock.error) throw new Error(mock.error);
              return {
                success: true,
                data: mock.response ?? { success: true, mocked: true },
                duration: 0,
              } as ToolResult;
            },
          });
        }
      }

      const session = await runtime.startSession({ modelConfig: {} });

      return { runtime, sessionId: session.id, cwd: effectiveCwd, tempDir };
    },

    async teardown(ctx) {
      try {
        await ctx.runtime.close();
      } catch {
        /* ignore */
      }
      if (ctx.tempDir && fs.existsSync(ctx.tempDir)) {
        await fs.promises.rm(ctx.tempDir, { recursive: true }).catch(() => {});
      }
    },
  };
}
