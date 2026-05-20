import type { FastifyRequest, FastifyReply } from "fastify";
import type { AuthContext } from "./auth-middleware.js";

export const requireRole = async (
  context: AuthContext,
  request: FastifyRequest,
  reply: FastifyReply,
  role: "admin" | "operator"
): Promise<void> => {
  const sessionId = request.headers.cookie?.split(";")
    .find(c => c.trim().startsWith("base_orchestrator_session="))
    ?.split("=")[1]?.trim();

  if (!sessionId) {
    reply.code(401).send({ error: "Authentication required" });
    return;
  }

  const session = await context.sessions.get(sessionId);
  if (!session) {
    reply.code(401).send({ error: "Authentication required" });
    return;
  }

  if (session.role !== role) {
    reply.code(403).send({ error: `Forbidden: requires ${role} role` });
    return;
  }
};

export const requireReauth = async (
  context: AuthContext,
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  const sessionId = request.headers.cookie?.split(";")
    .find(c => c.trim().startsWith("base_orchestrator_session="))
    ?.split("=")[1]?.trim();

  if (!sessionId) {
    reply.code(401).send({ error: "Authentication required" });
    return;
  }

  const session = await context.sessions.get(sessionId);
  if (!session) {
    reply.code(401).send({ error: "Authentication required" });
    return;
  }

  const lastReauthAt = session.lastReauthAt;
  if (!lastReauthAt) {
    reply.code(403).send({ error: "Re-authentication required" });
    return;
  }

  const reauthAgeMs = Date.now() - new Date(lastReauthAt).getTime();
  const reauthWindowMs = 15 * 60 * 1000; // 15 minutes
  if (reauthAgeMs > reauthWindowMs) {
    reply.code(403).send({ error: "Re-authentication required" });
    return;
  }
};

export const requireConfirmation = async (
  context: AuthContext,
  request: FastifyRequest,
  reply: FastifyReply,
  phrase: string
): Promise<void> => {
  const body = request.body as Record<string, unknown> | undefined;
  const confirmPhrase = body?.confirmPhrase as string | undefined;

  if (confirmPhrase !== phrase) {
    reply.code(400).send({ error: `Confirmation phrase required: "${phrase}"` });
    return;
  }
};