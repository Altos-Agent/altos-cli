import type { FastifyInstance } from "fastify";
import type { DbClient } from "../db/client.js";
import {
  createManagementService,
  isManagementError
} from "./management-service.js";

interface IdParams {
  id: string;
}

const handleError = (error: unknown) => {
  if (isManagementError(error)) {
    return {
      statusCode: error.statusCode,
      body: { error: error.message }
    };
  }

  throw error;
};

export const registerManagementRoutes = async (
  server: FastifyInstance,
  db: DbClient
) => {
  const service = createManagementService(db);

  server.get("/api/tokens", async () => await service.listTokens());
  server.post<{ Body: Parameters<typeof service.createToken>[0] }>(
    "/api/tokens",
    async (request, reply) => {
      try {
        return reply.code(201).send(await service.createToken(request.body));
      } catch (error) {
        const handled = handleError(error);
        return reply.code(handled.statusCode).send(handled.body);
      }
    }
  );
  server.patch<{ Params: IdParams; Body: Parameters<typeof service.updateToken>[1] }>(
    "/api/tokens/:id",
    async (request, reply) => {
      try {
        return await service.updateToken(request.params.id, request.body);
      } catch (error) {
        const handled = handleError(error);
        return reply.code(handled.statusCode).send(handled.body);
      }
    }
  );
  server.post<{ Params: IdParams }>("/api/tokens/:id/enable", async (request, reply) => {
    try {
      return await service.setTokenEnabled(request.params.id, true);
    } catch (error) {
      const handled = handleError(error);
      return reply.code(handled.statusCode).send(handled.body);
    }
  });
  server.post<{ Params: IdParams }>("/api/tokens/:id/disable", async (request, reply) => {
    try {
      return await service.setTokenEnabled(request.params.id, false);
    } catch (error) {
      const handled = handleError(error);
      return reply.code(handled.statusCode).send(handled.body);
    }
  });

  server.get("/api/pairs", async () => await service.listPairs());
  server.post<{ Body: Parameters<typeof service.createPair>[0] }>(
    "/api/pairs",
    async (request, reply) => {
      try {
        return reply.code(201).send(await service.createPair(request.body));
      } catch (error) {
        const handled = handleError(error);
        return reply.code(handled.statusCode).send(handled.body);
      }
    }
  );
  server.patch<{ Params: IdParams; Body: Parameters<typeof service.updatePair>[1] }>(
    "/api/pairs/:id",
    async (request, reply) => {
      try {
        return await service.updatePair(request.params.id, request.body);
      } catch (error) {
        const handled = handleError(error);
        return reply.code(handled.statusCode).send(handled.body);
      }
    }
  );
  server.post<{ Params: IdParams }>("/api/pairs/:id/enable", async (request, reply) => {
    try {
      return await service.setPairEnabled(request.params.id, true);
    } catch (error) {
      const handled = handleError(error);
      return reply.code(handled.statusCode).send(handled.body);
    }
  });
  server.post<{ Params: IdParams }>("/api/pairs/:id/disable", async (request, reply) => {
    try {
      return await service.setPairEnabled(request.params.id, false);
    } catch (error) {
      const handled = handleError(error);
      return reply.code(handled.statusCode).send(handled.body);
    }
  });

  server.get("/api/routers", async () => await service.listRouters());
  server.patch<{ Params: IdParams; Body: Parameters<typeof service.updateRouter>[1] }>(
    "/api/routers/:id",
    async (request, reply) => {
      try {
        return await service.updateRouter(request.params.id, request.body);
      } catch (error) {
        const handled = handleError(error);
        return reply.code(handled.statusCode).send(handled.body);
      }
    }
  );
  server.post<{ Params: IdParams }>("/api/routers/:id/enable", async (request, reply) => {
    try {
      return await service.setRouterEnabled(request.params.id, true);
    } catch (error) {
      const handled = handleError(error);
      return reply.code(handled.statusCode).send(handled.body);
    }
  });
  server.post<{ Params: IdParams }>("/api/routers/:id/disable", async (request, reply) => {
    try {
      return await service.setRouterEnabled(request.params.id, false);
    } catch (error) {
      const handled = handleError(error);
      return reply.code(handled.statusCode).send(handled.body);
    }
  });

  server.get<{ Params: IdParams }>(
    "/api/wallets/:id/pair-rules",
    async (request, reply) => {
      try {
        return await service.listWalletPairRules(request.params.id);
      } catch (error) {
        const handled = handleError(error);
        return reply.code(handled.statusCode).send(handled.body);
      }
    }
  );
  server.put<{
    Params: IdParams;
    Body: Parameters<typeof service.putWalletPairRules>[1];
  }>("/api/wallets/:id/pair-rules", async (request, reply) => {
    try {
      return await service.putWalletPairRules(request.params.id, request.body);
    } catch (error) {
      const handled = handleError(error);
      return reply.code(handled.statusCode).send(handled.body);
    }
  });
};
