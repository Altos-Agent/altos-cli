// Session helpers - lightweight, no heavy imports
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

function getAltosStateDir(): string {
  return path.join(os.homedir(), ".altos", "state");
}

function getSessionStatePath(sessionId: string): string {
  return path.join(getAltosStateDir(), `session_${sessionId}.json`);
}

function getActiveSessionPath(): string {
  return path.join(getAltosStateDir(), "active_session.json");
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

export async function recoverSession(sessionId: string) {
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

export function saveSessionState(state: Record<string, unknown>): void {
  const stateDir = getAltosStateDir();
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(getSessionStatePath(state.sessionId as string), JSON.stringify(state, null, 2));
  fs.writeFileSync(
    getActiveSessionPath(),
    JSON.stringify({ sessionId: state.sessionId, savedAt: Date.now() }, null, 2),
  );
}

export function clearActiveSession(): void {
  const activePath = getActiveSessionPath();
  if (fs.existsSync(activePath)) fs.unlinkSync(activePath);
}
