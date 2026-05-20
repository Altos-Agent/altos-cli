import { randomBytes } from "node:crypto";

export interface OperatorSession {
  id: string;
  username: string;
  csrfToken: string;
  expiresAt: number;
}

export interface SessionStore {
  create(username: string): OperatorSession;
  get(sessionId: string | undefined): OperatorSession | null;
  delete(sessionId: string | undefined): void;
}

const sessionTtlMs = 12 * 60 * 60 * 1000;

const randomToken = () => randomBytes(32).toString("base64url");

export const createSessionStore = (): SessionStore => {
  const sessions = new Map<string, OperatorSession>();

  return {
    create(username: string) {
      const session: OperatorSession = {
        id: randomToken(),
        username,
        csrfToken: randomToken(),
        expiresAt: Date.now() + sessionTtlMs,
      };
      sessions.set(session.id, session);
      return session;
    },

    get(sessionId: string | undefined) {
      if (!sessionId) {
        return null;
      }
      const session = sessions.get(sessionId);
      if (!session) {
        return null;
      }
      if (session.expiresAt <= Date.now()) {
        sessions.delete(sessionId);
        return null;
      }
      return session;
    },

    delete(sessionId: string | undefined) {
      if (sessionId) {
        sessions.delete(sessionId);
      }
    },
  };
};

