import { AsyncLocalStorage } from "node:async_hooks";
import type { FastifyInstance } from "fastify";

interface RequestContext {
  requestId: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export const getCurrentRequestId = () => storage.getStore()?.requestId ?? null;

export const withRequestContext = <T>(
  requestId: string,
  callback: () => T,
) => storage.run({ requestId }, callback);

export const installRequestContext = (server: FastifyInstance) => {
  server.addHook("onRequest", (request, reply, done) => {
    const requestId = request.id;
    reply.header("x-request-id", requestId);
    storage.enterWith({ requestId });
    done();
  });
};
