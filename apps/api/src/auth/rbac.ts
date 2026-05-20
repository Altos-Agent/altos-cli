import type { FastifyReply, FastifyRequest } from "fastify";
import type { AuthContext } from "./auth-middleware.js";
import { getSessionIdFromRequest } from "./auth-middleware.js";

export const RoleHierarchy = {
  viewer: 0,
  operator: 1,
  admin: 2,
} as const;

export type OperatorRole = keyof typeof RoleHierarchy;

const REAUTH_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

export const getSessionRole = async (
  context: AuthContext,
  request: FastifyRequest
): Promise<OperatorRole> => {
  const session = await context.sessions.get(getSessionIdFromRequest(request));
  return (session?.role as OperatorRole) ?? "viewer";
};

export const requireRole = async (
  context: AuthContext,
  request: FastifyRequest,
  reply: FastifyReply,
  requiredRole: OperatorRole
): Promise<boolean> => {
  const session = await context.sessions.get(getSessionIdFromRequest(request));
  const role = (session?.role as OperatorRole) ?? "viewer";
  if (RoleHierarchy[role] < RoleHierarchy[requiredRole]) {
    reply.code(403).send({ error: "Insufficient role" });
    return false;
  }
  return true;
};

export const requireReauth = async (
  context: AuthContext,
  request: FastifyRequest,
  reply: FastifyReply
): Promise<boolean> => {
  const session = await context.sessions.get(getSessionIdFromRequest(request));
  if (!session) {
    reply.code(401).send({ error: "Authentication required" });
    return false;
  }
  const now = Date.now();
  const fiveMinAgo = now - REAUTH_WINDOW_MS;
  if (session.lastReauthAt < fiveMinAgo) {
    reply.code(400).send({
      error: "CONFIRMATION_REQUIRED",
      message: "Re-authentication required. Please re-authenticate and try again.",
      requiredReauth: true,
    });
    return false;
  }
  return true;
};

export const requireConfirmation = (
  request: FastifyRequest,
  reply: FastifyReply,
  requiredPhrase: string
): boolean => {
  const confirmValue = (request.body as { confirm?: string })?.confirm;
  if (confirmValue !== requiredPhrase) {
    reply.code(400).send({
      error: "CONFIRMATION_REQUIRED",
      message: `You must confirm with the exact phrase: "${requiredPhrase}"`,
      requiredPhrase,
    });
    return false;
  }
  return true;
};