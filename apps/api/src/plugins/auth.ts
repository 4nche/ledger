import { createAuth, type Auth } from '@journal/auth';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { HttpError } from '../errors';
import type { Config } from '../config';

declare module 'fastify' {
  interface FastifyInstance {
    auth: Auth;
  }
  interface FastifyRequest {
    /** The signed-in trader. Present on every route except the public ones. */
    trader: { id: string; name: string; email: string };
  }
}

/** Routes reachable without a session. Everything else requires one. */
const PUBLIC_PATHS = new Set(['/health']);

function isPublic(url: string): boolean {
  const path = url.split('?')[0] ?? url;
  // The auth routes themselves must be reachable, or nobody could ever sign in.
  return path.startsWith('/api/auth') || PUBLIC_PATHS.has(path);
}

/** Fastify's incoming headers, as the Web `Headers` Better Auth expects. */
function toWebHeaders(request: FastifyRequest): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) {
      for (const entry of value) headers.append(key, entry);
    } else if (value !== undefined) {
      headers.append(key, value);
    }
  }
  return headers;
}

export interface AuthPluginOptions {
  readonly config: Config;
}

/**
 * The API issues sessions *and* validates them, rather than trusting a header
 * from the web app. That costs a little setup and buys a genuinely protected
 * API — one a future mobile app or exchange importer can call directly without
 * a second, weaker authentication path being invented for it.
 */
export const authPlugin = fp(async function authPlugin(
  app: FastifyInstance,
  options: AuthPluginOptions,
) {
  const { config } = options;

  const auth = createAuth({
    database: app.db,
    secret: config.BETTER_AUTH_SECRET,
    baseUrl: config.WEB_ORIGIN,
    googleClientId: config.GOOGLE_CLIENT_ID,
    googleClientSecret: config.GOOGLE_CLIENT_SECRET,
    allowedEmails: config.ALLOWED_EMAILS,
    production: config.NODE_ENV === 'production',
  });

  app.decorate('auth', auth);

  // Better Auth speaks the Web Fetch API, so requests and responses are
  // translated at this one boundary rather than throughout the app.
  app.route({
    method: ['GET', 'POST', 'OPTIONS'],
    url: '/api/auth/*',
    handler: async (request, reply) => {
      const url = new URL(request.url, config.WEB_ORIGIN);
      const body =
        request.method === 'GET' || request.body === undefined
          ? undefined
          : JSON.stringify(request.body);

      const response = await auth.handler(
        new Request(url.toString(), {
          method: request.method,
          headers: toWebHeaders(request),
          ...(body === undefined ? {} : { body }),
        }),
      );

      reply.status(response.status);
      response.headers.forEach((value: string, key: string) => {
        // set-cookie must be appended, never collapsed into one header.
        if (key.toLowerCase() === 'set-cookie') {
          reply.header('set-cookie', value);
        } else {
          reply.header(key, value);
        }
      });
      return reply.send(response.body === null ? null : await response.text());
    },
  });

  app.addHook('onRequest', async (request) => {
    if (isPublic(request.url)) return;

    const session = await auth.api.getSession({ headers: toWebHeaders(request) });

    if (session === null) {
      throw new HttpError(401, 'Sign in to continue.');
    }

    request.trader = {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
    };
  });
});
