// @altos/tools/shell - Shell/bash execution tool

import { execFile } from "child_process";
import type { ToolDefinition, ToolContext, ToolResult, ToolPermission } from "../index.js";
import { validateBashCommand, maskSecrets, redactEnv, truncateOutput } from "../security.js";

const EXECUTION_TIMEOUT_MS = 300000;

const BASH_SCHEMA = {
  type: "object" as const,
  properties: {
    command: {
      type: "string" as const,
      description: "The bash command to execute",
    },
    cwd: {
      type: "string" as const,
      description: "Working directory for the command (defaults to workspace root)",
    },
    timeout: {
      type: "number" as const,
      description: "Maximum execution time in milliseconds",
      minimum: 1000,
      maximum: EXECUTION_TIMEOUT_MS,
      default: 300000,
    },
    env: {
      type: "object" as const,
      description: "Additional environment variables",
    },
    allow_dangerous: {
      type: "boolean" as const,
      description: "Allow execution of potentially dangerous commands",
      default: false,
    },
  },
  required: ["command"],
  additionalProperties: false,
  description: "Execute a bash command in a sandboxed environment.",
};

const BASH_OUTPUT_SCHEMA = {
  type: "object" as const,
  properties: {
    stdout: { type: "string" as const, description: "Standard output" },
    stderr: { type: "string" as const, description: "Standard error" },
    exitCode: { type: "number" as const, description: "Process exit code" },
    duration: { type: "number" as const, description: "Execution duration in ms" },
    killed: { type: "boolean" as const, description: "Whether the process was killed" },
  },
  required: ["stdout", "stderr", "exitCode"],
  additionalProperties: false,
};

const BASH_PERMISSIONS: ToolPermission[] = [
  { type: "execute", path: "**", reason: "Execute shell commands" },
];

export interface BashConfig {
  workspaceRoots: string[];
  defaultTimeout?: number;
  allowDangerousByDefault?: boolean;
  maxOutputBytes?: number;
}

export function createBashTool(config: BashConfig): ToolDefinition {
  const {
    defaultTimeout = 300000,
    allowDangerousByDefault = false,
    maxOutputBytes = 10 * 1024 * 1024,
  } = config;

  return {
    name: "bash",
    description:
      "Execute a bash command. Dangerous commands (rm, chmod, sudo, etc.) require allow_dangerous=true.",
    inputSchema: BASH_SCHEMA,
    outputSchema: BASH_OUTPUT_SCHEMA,
    riskLevel: "critical",
    requiredPermissions: BASH_PERMISSIONS,
    async execute(params: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
      const startTime = Date.now();
      const command = params.command as string;
      const cwd = (params.cwd as string) ?? context.workspaceRoot ?? context.cwd;
      const timeout = (params.timeout as number) ?? defaultTimeout;
      const extraEnv = (params.env as Record<string, string>) ?? {};
      const allowDangerous = (params.allow_dangerous as boolean) ?? allowDangerousByDefault;

      const validation = validateBashCommand(command, cwd, allowDangerous);
      if (!validation.valid) {
        return { success: false, error: validation.error, duration: Date.now() - startTime };
      }

      const env = { ...redactEnv(process.env as Record<string, string>), ...extraEnv };
      delete (env as Record<string, string>).ORIGINAL_PATH;
      delete (env as Record<string, string>).ORIGINAL_HOME;

      return new Promise((resolve) => {
        const timer = setTimeout(
          () => {
            resolve({
              success: false,
              error: `Command timed out after ${timeout}ms`,
              duration: Date.now() - startTime,
              data: { stdout: "", stderr: "TIMEOUT", exitCode: 124, killed: false },
            });
          },
          Math.min(timeout, EXECUTION_TIMEOUT_MS),
        );

        execFile(
          "bash",
          ["-c", command],
          { cwd, env, maxBuffer: maxOutputBytes },
          (err, stdout, stderr) => {
            clearTimeout(timer);
            const duration = Date.now() - startTime;

            const maskedStdout = maskSecrets(stdout || "");
            const maskedStderr = maskSecrets(stderr || "");
            const combined = maskedStdout + "\n" + maskedStderr;
            const truncation = truncateOutput(combined, maxOutputBytes);

            const halfLimit = Math.floor(maxOutputBytes / 2);
            const truncatedData = truncation.truncated;

            resolve({
              success: err === null && (err as unknown as NodeJS.ErrnoException)?.code !== "ENOENT",
              data: {
                stdout: truncatedData.substring(0, halfLimit),
                stderr: truncatedData.substring(Math.max(0, halfLimit - 100)),
                exitCode: err ? ((err as NodeJS.ErrnoException).code ?? 1) : 0,
                duration,
                killed: false,
              },
              duration,
              truncated: truncation.wasTruncated,
              summary: truncation.wasTruncated
                ? `Command exited (output truncated to ${maxOutputBytes} bytes)`
                : `Command exited with code ${err ? 1 : 0} in ${duration}ms`,
            });
          },
        );
      });
    },
  };
}
