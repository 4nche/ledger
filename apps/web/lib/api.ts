import type { ApiResponse, PaginationMeta } from '@journal/contracts';

/**
 * The single door to the API.
 *
 * Requests go to the web app's own origin and Next rewrites `/api/*` to the
 * Fastify service, so there is no CORS in development and no origin to juggle
 * when cookies arrive with authentication.
 *
 * Server components run before any rewrite exists, so they need the absolute
 * URL instead.
 */
const SERVER_BASE_URL = process.env['API_BASE_URL'] ?? 'http://127.0.0.1:4000';

const isServer = typeof window === 'undefined';

export class ApiError extends Error {
  readonly status: number;
  readonly issues: readonly { path: string; message: string; code: string }[];

  constructor(
    status: number,
    message: string,
    issues: readonly { path: string; message: string; code: string }[] = [],
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'ApiError';
    this.status = status;
    this.issues = issues;
  }

  /** Field errors keyed by path, ready to hand to react-hook-form. */
  get fieldErrors(): Record<string, string> {
    return Object.fromEntries(this.issues.map((issue) => [issue.path, issue.message]));
  }
}

export interface Page<TItem> {
  readonly items: readonly TItem[];
  readonly meta: PaginationMeta | undefined;
}

function urlFor(path: string): string {
  const normalised = path.startsWith('/') ? path : `/${path}`;
  return isServer ? `${SERVER_BASE_URL}${normalised}` : `/api${normalised}`;
}

/**
 * Server components call the API directly rather than through the browser, so
 * nothing attaches the caller's credentials for them. Without this the API
 * would answer every server-rendered page with a 401.
 *
 * Both forms are forwarded: the cookie a browser sends, and the bearer token a
 * non-browser client sends.
 */
async function forwardedCredentials(): Promise<Record<string, string>> {
  if (!isServer) return {};

  const { headers } = await import('next/headers');
  const incoming = await headers();
  const forwarded: Record<string, string> = {};

  const cookie = incoming.get('cookie');
  if (cookie !== null) forwarded['cookie'] = cookie;

  const authorization = incoming.get('authorization');
  if (authorization !== null) forwarded['authorization'] = authorization;

  return forwarded;
}

async function request<TData>(path: string, init?: RequestInit): Promise<ApiResponse<TData>> {
  let response: Response;
  const credentials = await forwardedCredentials();

  try {
    response = await fetch(urlFor(path), {
      ...init,
      credentials: 'include',
      headers: {
        ...credentials,
        // Only declare a JSON body when there is one. Fastify rejects an empty
        // body sent with a JSON content-type, which would turn every DELETE
        // into a 400.
        ...(init?.body === undefined ? {} : { 'content-type': 'application/json' }),
        ...init?.headers,
      },
      cache: 'no-store',
    });
  } catch (cause) {
    // A refused connection is the common case in development, and "fetch
    // failed" tells the trader nothing actionable. The original failure is
    // kept as the cause, for whoever debugs it.
    throw new ApiError(0, 'Could not reach the API. Is the API server running?', [], { cause });
  }

  if (response.status === 204) {
    return { success: true, data: undefined as TData };
  }

  const body = (await response.json()) as ApiResponse<TData>;

  if (!body.success) {
    throw new ApiError(response.status, body.error, body.issues ?? []);
  }
  return body;
}

/** Unwraps the envelope, throwing on failure so callers deal in plain data. */
export async function apiGet<TData>(path: string): Promise<TData> {
  const body = await request<TData>(path);
  return (body as { data: TData }).data;
}

/** As `apiGet`, but keeps the pagination metadata alongside the items. */
export async function apiGetPage<TItem>(path: string): Promise<Page<TItem>> {
  const body = await request<TItem[]>(path);
  const success = body as { data: TItem[]; meta?: PaginationMeta };
  return { items: success.data, meta: success.meta };
}

export async function apiSend<TData>(
  method: 'POST' | 'PATCH' | 'DELETE',
  path: string,
  payload?: unknown,
): Promise<TData> {
  const body = await request<TData>(path, {
    method,
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  });
  return (body as { data: TData }).data;
}

/** Builds a query string, dropping empty values so URLs stay readable. */
export function queryString(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value));
    }
  }
  const rendered = search.toString();
  return rendered === '' ? '' : `?${rendered}`;
}
