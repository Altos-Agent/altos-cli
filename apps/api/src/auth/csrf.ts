import type { FastifyRequest } from "fastify";
import type { OperatorSession } from "./session-store.js";

export const csrfHeaderName = "x-csrf-token";

export const validateCsrfToken = (
  request: FastifyRequest,
  session: OperatorSession,
) => request.headers[csrfHeaderName] === session.csrfToken;

