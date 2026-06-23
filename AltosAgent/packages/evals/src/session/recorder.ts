import * as fs from "fs";
import * as path from "path";
import type { AgentRuntime } from "@altos/core";
import type { RecordedEvent, SessionMetadata } from "../core/types.js";

/**
 * SessionRecorder wraps an AgentRuntime and writes all events to a JSONL file.
 */
export class SessionRecorder {
  private events: RecordedEvent[] = [];
  private sessionId: string;
  private outputDir: string;
  private cwd: string;
  private startTime: number = 0;
  private fileHandle: fs.promises.FileHandle | null = null;
  private tokenUsage = { input: 0, output: 0 };
  private permissionsRequested = 0;
  private permissionsDenied = 0;

  constructor(_runtime: AgentRuntime, sessionId: string, outputDir: string, cwd: string) {
    this.sessionId = sessionId;
    this.outputDir = outputDir;
    this.cwd = cwd;
  }

  async start(): Promise<void> {
    await fs.promises.mkdir(this.outputDir, { recursive: true });
    const jsonlPath = path.join(this.outputDir, "session.jsonl");
    this.fileHandle = await fs.promises.open(jsonlPath, "w");
    this.startTime = Date.now();
  }

  async record(event: RecordedEvent): Promise<void> {
    this.events.push(event);
    if (this.fileHandle) {
      await this.fileHandle.write(JSON.stringify(event) + "\n");
    }

    if (event.type === "token_usage") {
      const t = event as { input?: number; output?: number };
      if (t.input) this.tokenUsage.input += t.input;
      if (t.output) this.tokenUsage.output += t.output;
    }

    if (event.type === "permission_requested") {
      this.permissionsRequested++;
    }
    if (event.type === "permission_decision") {
      const e = event as { granted?: boolean };
      if (!e.granted) this.permissionsDenied++;
    }
  }

  async stop(outcome: "success" | "failed" | "error", errorMsg?: string): Promise<void> {
    if (this.fileHandle) {
      await this.fileHandle.close();
      this.fileHandle = null;
    }

    const metadata: SessionMetadata = {
      sessionId: this.sessionId,
      cwd: this.cwd,
      modelConfig: {},
      createdAt: new Date(this.startTime).toISOString(),
      completedAt: new Date().toISOString(),
      outcome,
      durationMs: Date.now() - this.startTime,
      tokenUsage: this.tokenUsage,
      permissionsRequested: this.permissionsRequested,
      permissionsDenied: this.permissionsDenied,
    };

    const metadataPath = path.join(this.outputDir, "metadata.json");
    await fs.promises.writeFile(metadataPath, JSON.stringify(metadata, null, 2));

    if (errorMsg) {
      const errorPath = path.join(this.outputDir, "error.txt");
      await fs.promises.writeFile(errorPath, errorMsg);
    }
  }

  getEvents(): RecordedEvent[] {
    return [...this.events];
  }

  getSessionId(): string {
    return this.sessionId;
  }

  getOutputDir(): string {
    return this.outputDir;
  }
}
