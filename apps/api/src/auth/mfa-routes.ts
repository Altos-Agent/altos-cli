import type { FastifyInstance } from "fastify";
import type { AuthContext } from "./auth-middleware.js";
import { getSessionIdFromRequest } from "./auth-middleware.js";
import { TOTPService } from "./mfa-service.js";
import { generateRecoveryCodes, hashRecoveryCode, encryptTotpSecret, decryptTotpSecret } from "./mfa-service.js";
import type { OperatorRole } from "./rbac.js";

export const registerMfaRoutes = async (server: FastifyInstance, context: AuthContext) => {
  const totpService = new TOTPService({ issuer: context.config.totpIssuer });

  server.post("/api/auth/mfa/setup", async (request, reply) => {
    const session = await context.sessions.get(getSessionIdFromRequest(request));
    if (!session) return reply.code(401).send({ error: "Authentication required" });
    const { secret, otpauthUri, qrCodeBase64 } = totpService.generateSecret();
    const recoveryCodes = generateRecoveryCodes();
    const hashedCodes = await Promise.all(recoveryCodes.map(hashRecoveryCode));
    const pending = {
      totpSecretEncrypted: encryptTotpSecret(secret, context.config.sessionSecret),
      mfaRecoveryCodesHashed: hashedCodes,
      mfaSetupStartedAt: Date.now(),
    };
    await context.sessions.updatePendingMfa?.(session.id, pending);
    return { otpauthUri, qrCodeBase64, recoveryCodes };
  });

  server.post("/api/auth/mfa/verify-setup", async (request, reply) => {
    const session = await context.sessions.get(getSessionIdFromRequest(request));
    if (!session) return reply.code(401).send({ error: "Authentication required" });
    const body = request.body as { totpCode: string };
    if (!body?.totpCode || !/^\d{6}$/.test(body.totpCode)) return reply.code(400).send({ error: "Invalid TOTP code format" });
    const pending = await context.sessions.getPendingMfa?.(session.id);
    if (!pending) return reply.code(400).send({ error: "No MFA setup in progress" });
    const secret = decryptTotpSecret(pending.totpSecretEncrypted, context.config.sessionSecret);
    const valid = await totpService.validateCode(body.totpCode, secret);
    if (!valid) return reply.code(400).send({ error: "Invalid TOTP code" });
    await context.sessions.setMfaEnabled?.(session.id, {
      mfaEnabled: true,
      totpSecretEncrypted: pending.totpSecretEncrypted,
      mfaRecoveryCodesHashed: pending.mfaRecoveryCodesHashed,
      mfaEnabledAt: new Date().toISOString(),
    });
    await context.sessions.deleteAllSessionsForUser(session.username);
    const newSession = await context.sessions.createWithRole?.(session.username, (session.role as OperatorRole) ?? "admin");
    if (newSession) {
      await context.sessions.setMfaEnabled?.(newSession.id, {
        mfaEnabled: true,
        totpSecretEncrypted: pending.totpSecretEncrypted,
        mfaRecoveryCodesHashed: pending.mfaRecoveryCodesHashed,
        mfaEnabledAt: new Date().toISOString(),
      });
    }
    return { mfaEnabled: true };
  });

  server.post("/api/auth/mfa/verify", async (request, reply) => {
    const body = request.body as { tempSessionId: string; totpCode: string };
    if (!body?.tempSessionId || !body?.totpCode) return reply.code(400).send({ error: "tempSessionId and totpCode required" });
    const tempSession = await context.sessions.get(body.tempSessionId);
    if (!tempSession) return reply.code(400).send({ error: "Invalid or expired temp session" });
    const mfaState = await context.sessions.getMfaSettings?.(tempSession.username);
    if (!mfaState?.mfaEnabled) return reply.code(400).send({ error: "MFA not enabled" });
    const secret = decryptTotpSecret(mfaState.totpSecretEncrypted, context.config.sessionSecret);
    const valid = await totpService.validateCode(body.totpCode, secret);
    if (!valid) return reply.code(400).send({ error: "Invalid TOTP code" });
    const session = await context.sessions.createWithRole?.(tempSession.username, (tempSession.role as OperatorRole) ?? "admin");
    if (!session) return reply.code(500).send({ error: "Failed to create session" });
    await context.sessions.setMfaEnabled?.(session.id, mfaState);
    await context.sessions.updateLastReauthAt(session.id);
    const cookie = `base_orchestrator_session=${session.id}; Path=/; HttpOnly; SameSite=Lax`;
    return reply.header("set-cookie", cookie).send({ authenticated: true, username: session.username });
  });

  server.post("/api/auth/mfa/disable", async (request, reply) => {
    const session = await context.sessions.get(getSessionIdFromRequest(request));
    if (!session) return reply.code(401).send({ error: "Authentication required" });
    const body = request.body as { totpCode: string; password: string };
    if (!body?.totpCode || !body?.password) return reply.code(400).send({ error: "totpCode and password required" });
    const { verifyOperatorPassword } = await import("./password.js");
    const validPassword = await verifyOperatorPassword(context.config, session.username, body.password);
    if (!validPassword) return reply.code(401).send({ error: "Invalid password" });
    const mfaState = await context.sessions.getMfaSettings?.(session.username);
    if (mfaState?.totpSecretEncrypted) {
      const secret = decryptTotpSecret(mfaState.totpSecretEncrypted, context.config.sessionSecret);
      const validTotp = await totpService.validateCode(body.totpCode, secret);
      if (!validTotp) return reply.code(400).send({ error: "Invalid TOTP code" });
    }
    await context.sessions.setMfaEnabled?.(session.id, { mfaEnabled: false, totpSecretEncrypted: null, mfaRecoveryCodesHashed: null, mfaEnabledAt: null });
    await context.sessions.deleteAllSessionsForUser(session.username);
    return { mfaEnabled: false };
  });
};