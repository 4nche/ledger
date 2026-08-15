import type { ApiIssue } from '@journal/contracts';
import type { ValidationIssue } from '@journal/domain';

/** An error the client is allowed to see, with a deliberate status code. */
export class HttpError extends Error {
  readonly statusCode: number;
  readonly issues: readonly ApiIssue[] | undefined;

  constructor(statusCode: number, message: string, issues?: readonly ApiIssue[]) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.issues = issues;
  }
}

export function notFound(what: string): HttpError {
  return new HttpError(404, `${what} not found.`);
}

export function badRequest(message: string): HttpError {
  return new HttpError(400, message);
}

/**
 * A well-formed request that describes an impossible position — exits before
 * entries, oversold quantity, a stop on the wrong side. 422 rather than 400,
 * because the syntax was fine and the meaning was not.
 */
export function unprocessable(issues: readonly ValidationIssue[]): HttpError {
  return new HttpError(
    422,
    'The submitted executions do not describe a valid position.',
    issues.map((issue) => ({
      path: issue.executionId === null ? 'trades' : `trades.${issue.executionId}`,
      message: issue.message,
      code: issue.code,
    })),
  );
}
