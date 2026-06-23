// altos serve command — start the local API server

import { LocalAPIServer } from "@altos/local-api";

export interface ServeOptions {
  port?: number;
  host?: string;
}

export async function runServeCommand(options: ServeOptions = {}): Promise<number> {
  const port = options.port ?? parseInt(process.env.ALTOS_PORT ?? "3001", 10);
  const host = options.host ?? process.env.ALTOS_HOST ?? "localhost";

  console.log(`Starting Altos Local API server on ${host}:${port}...`);
  console.log();
  console.log("Endpoints:");
  console.log(`  GET    /api/health              Health check`);
  console.log(`  GET    /api/sessions             List sessions`);
  console.log(`  POST   /api/sessions             Create session`);
  console.log(`  GET    /api/sessions/:id         Get session`);
  console.log(`  PATCH  /api/sessions/:id         Update session status`);
  console.log(`  GET    /api/sessions/:id/events  SSE event stream`);
  console.log(`  GET    /api/sessions/:id/tasks   List tasks`);
  console.log(`  GET    /api/sessions/:id/approvals  List approvals`);
  console.log(`  GET    /api/sessions/:id/artifacts  List artifacts`);
  console.log(`  GET    /api/tasks                List all tasks`);
  console.log(`  PATCH  /api/tasks/:id             Update task`);
  console.log(`  GET    /api/approvals             List all approvals`);
  console.log(`  PATCH  /api/approvals/:id         Resolve approval (approve|deny)`);
  console.log(`  GET    /api/workers               List workers`);
  console.log(`  GET    /api/diffs?sessionId=      Get session diffs`);
  console.log();
  console.log("WebSocket: ws://localhost:3001/ws?sessionId=<id>");
  console.log();
  console.log("Press Ctrl+C to stop.\n");

  try {
    const server = new LocalAPIServer({ port, host });
    await server.start();

    // Keep alive
    await new Promise(() => {});
  } catch (err) {
    console.error(`Failed to start server: ${err}`);
    return 1;
  }

  return 0;
}
