// altos cloud command — cloud status and run placeholder

import { getLocalCloudRuntime, type CloudRuntime } from "@altos/cloud";

export interface CloudOptions {
  subcommand?: "status" | "run";
  // run options
  prompt?: string;
  cwd?: string;
  model?: string;
  provider?: string;
}

function runtime(): CloudRuntime {
  return getLocalCloudRuntime();
}

export async function runCloudCommand(options: CloudOptions = {}): Promise<number> {
  const sub = options.subcommand ?? "status";

  switch (sub) {
    case "status":
      return await cmdStatus();
    case "run":
      return await cmdRun(options);
    default:
      console.error("Usage: altos cloud status | run [--prompt <task>] [--cwd <path>]");
      return 1;
  }
}

async function cmdStatus(): Promise<number> {
  const cloud = runtime();

  console.log(`Cloud Mode:  ${cloud.mode}`);
  console.log(`Remote:     ${cloud.supportsRemote ? "supported" : "not supported"}`);
  console.log();

  const [sessions, workers, approvals] = await Promise.all([
    cloud.listSessions(),
    cloud.listWorkers(),
    cloud.listApprovalRequests(),
  ]);

  console.log(`Sessions:   ${sessions.length}`);
  for (const s of sessions.slice(0, 10)) {
    console.log(
      `  ${s.id.slice(0, 8)}…  ${s.status.padEnd(20)} ${new Date(s.createdAt).toLocaleTimeString()}`,
    );
  }
  if (sessions.length > 10) console.log(`  … and ${sessions.length - 10} more`);

  console.log();
  console.log(`Workers:    ${workers.length}`);
  for (const w of workers) {
    const busy = w.status === "busy" ? ` (session: ${w.currentSessionId?.slice(0, 8) ?? "-"})` : "";
    console.log(`  ${w.name}  ${w.status}${busy}`);
  }

  console.log();
  const pending = approvals.filter((a) => a.status === "pending");
  console.log(`Approvals:  ${approvals.length} total, ${pending.length} pending`);

  return 0;
}

async function cmdRun(options: CloudOptions): Promise<number> {
  const cloud = runtime();

  const prompt = options.prompt ?? "Hello, what can you do?";
  const cwd = options.cwd ?? process.cwd();

  console.log(`Creating cloud session...`);
  const session = await cloud.createSession({
    prompt,
    cwd,
    model: options.model,
    provider: options.provider,
  });

  console.log(`Session: ${session.id}`);
  console.log(`Status:  ${session.status}`);
  console.log();

  // Enqueue a task for the session
  const task = await cloud.enqueueTask(session.id);
  console.log(`Task:    ${task.id}`);
  console.log();
  console.log(`Use 'altos cloud status' to monitor progress.`);
  console.log(
    `Use 'curl http://localhost:3001/api/sessions/${session.id}/events' to stream events.`,
  );

  return 0;
}
