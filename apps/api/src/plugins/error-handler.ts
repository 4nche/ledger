import { apiFailure, type ApiIssue } from '@journal/contracts';
import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { ZodError } from 'zod';
import { HttpError } from '../errors';

/** Fastify types the handler's error as `unknown`, so narrow it deliberately. */
function statusCodeOf(error: unknown): number {
  if (typeof error === 'object' && error !== null && 'statusCode' in error) {
    const { statusCode } = error as { statusCode?: unknown };
    if (typeof statusCode === 'number') return statusCode;
  }
  return 500;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Request failed.';
}

function fromZod(error: ZodError): ApiIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
    code: issue.code,
  }));
}

/**
 * Turns every thrown error into the standard failure envelope.
 *
 * Unexpected errors are logged in full server-side but reported to the client
 * as a bare message: internal details are not the caller's business, and stack
 * traces or driver messages leak schema information.
 */
export const errorHandler = fp(function errorHandler(app: FastifyInstance) {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      request.log.info({ issues: error.issues }, 'Request failed validation');
      return reply.status(422).send(apiFailure('Request failed validation.', fromZod(error)));
    }

    if (error instanceof HttpError) {
      request.log.info({ err: error }, 'Request rejected');
      return reply.status(error.statusCode).send(apiFailure(error.message, error.issues));
    }

    // Fastify's own errors (malformed JSON, payload too large) carry a status.
    const status = statusCodeOf(error);
    if (status < 500) {
      return reply.status(status).send(apiFailure(messageOf(error)));
    }

    request.log.error({ err: error }, 'Unhandled error');
    return reply.status(500).send(apiFailure('Internal server error.'));
  });

  app.setNotFoundHandler((request, reply) =>
    reply.status(404).send(apiFailure(`No route for ${request.method} ${request.url}.`)),
  );
});
