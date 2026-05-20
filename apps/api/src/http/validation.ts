import type { FastifyReply } from "fastify";
import type { z } from "zod";
import {
  emptyBodySchema,
  idParamsSchema,
  validationErrorMessage
} from "@base-orchestrator/shared";

export class RequestValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(validationErrorMessage);
    this.name = "RequestValidationError";
  }
}

export const parseRequestBody = <TSchema extends z.ZodType>(
  schema: TSchema,
  body: unknown
): z.output<TSchema> => {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new RequestValidationError(
      result.error.issues.map((issue) => issue.message)
    );
  }

  return result.data;
};

export const parseRequestParams = <TSchema extends z.ZodType>(
  schema: TSchema,
  params: unknown
): z.output<TSchema> => {
  const result = schema.safeParse(params);
  if (!result.success) {
    throw new RequestValidationError(
      result.error.issues.map((issue) => issue.message)
    );
  }

  return result.data;
};

export const parseIdParams = (params: unknown) =>
  parseRequestParams(idParamsSchema, params);

export const assertNoRequestBody = (body: unknown) =>
  parseRequestBody(emptyBodySchema, body);

export const handleValidationError = (
  error: unknown,
  reply: FastifyReply
) => {
  if (error instanceof RequestValidationError) {
    return reply.code(400).send({
      error: validationErrorMessage,
      details: error.issues
    });
  }

  return null;
};
