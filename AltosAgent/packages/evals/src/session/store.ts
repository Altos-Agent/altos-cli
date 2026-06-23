import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import type {
  RecordedEvent,
  RecordedSession,
  SessionMetadata,
  SessionSummary,
} from "../core/types.js";

/**
 * SessionStore manages reading and writing recorded sessions to disk.
 * Default base directory: ~/.altos/sessions/
 */
export class SessionStore {
  private baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir ?? path.join(os.homedir(), ".altos", "sessions");
  }

  private sessionDir(sessionId: string): string {
    return path.join(this.baseDir, sessionId);
  }

  async save(sessionId: string, metadata: SessionMetadata, events: RecordedEvent[]): Promise<void> {
    const dir = this.sessionDir(sessionId);
    await fs.promises.mkdir(dir, { recursive: true });

    await Promise.all([
      fs.promises.writeFile(path.join(dir, "metadata.json"), JSON.stringify(metadata, null, 2)),
      fs.promises.writeFile(
        path.join(dir, "session.jsonl"),
        events.map((e) => JSON.stringify(e)).join("\n"),
      ),
    ]);
  }

  async load(sessionId: string): Promise<RecordedSession> {
    const dir = this.sessionDir(sessionId);

    const [metadataRaw, jsonlRaw] = await Promise.all([
      fs.promises.readFile(path.join(dir, "metadata.json"), "utf-8"),
      fs.promises.readFile(path.join(dir, "session.jsonl"), "utf-8"),
    ]);

    const metadata: SessionMetadata = JSON.parse(metadataRaw);
    const events: RecordedEvent[] = jsonlRaw
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as RecordedEvent);

    return { sessionId, metadata, events };
  }

  async list(): Promise<SessionSummary[]> {
    if (!fs.existsSync(this.baseDir)) return [];

    const entries = await fs.promises.readdir(this.baseDir, { withFileTypes: true });
    const summaries: SessionSummary[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        const metaPath = path.join(this.baseDir, entry.name, "metadata.json");
        const raw = await fs.promises.readFile(metaPath, "utf-8");
        const m: SessionMetadata = JSON.parse(raw);
        summaries.push({
          sessionId: m.sessionId,
          createdAt: m.createdAt,
          outcome: m.outcome,
          durationMs: m.durationMs,
        });
      } catch {
        // Skip corrupted session dirs
      }
    }

    return summaries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async delete(sessionId: string): Promise<void> {
    const dir = this.sessionDir(sessionId);
    if (fs.existsSync(dir)) {
      await fs.promises.rm(dir, { recursive: true });
    }
  }

  getPath(sessionId: string): string {
    return this.sessionDir(sessionId);
  }
}
