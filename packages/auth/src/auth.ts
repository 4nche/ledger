import { randomUUID } from 'node:crypto';
import { betterAuth } from 'better-auth';
import { APIError } from 'better-auth/api';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { bearer } from 'better-auth/plugins';
import { authAccounts, authSessions, authVerifications, users, type Database } from '@journal/db';
import { assertUsableAllowlist, isAllowed, parseAllowlist } from './allowlist';

export interface AuthConfig {
  readonly database: Database;
  readonly secret: string;
  /** The browser-facing origin — the web app, not the API. */
  readonly baseUrl: string;
  readonly googleClientId: string;
  readonly googleClientSecret: string;
  readonly allowedEmails: string | undefined;
  readonly production: boolean;
  /** Extra origins permitted to start a sign-in, beyond `baseUrl`. */
  readonly trustedOrigins?: readonly string[];
}

export type Auth = ReturnType<typeof createAuth>;

/**
 * One Better Auth instance, shared by the API (which issues and validates
 * sessions) and the web app (which reads them in server components).
 *
 * Sessions live in the same PostgreSQL as everything else, created by the same
 * migrations, so they can be inspected and revoked with SQL.
 */
export function createAuth(config: AuthConfig) {
  const allowlist = parseAllowlist(config.allowedEmails);
  assertUsableAllowlist(allowlist);

  const denied = (email: string): APIError =>
    new APIError('FORBIDDEN', {
      message: `${email} is not authorised to use this journal.`,
      code: 'NOT_ALLOWLISTED',
    });

  return betterAuth({
    secret: config.secret,
    baseURL: config.baseUrl,
    // The browser reaches the API through the web app's own origin, so the
    // callback URL Google is told about lives under /api/auth.
    basePath: '/api/auth',

    database: drizzleAdapter(config.database, {
      provider: 'pg',
      schema: {
        user: users,
        session: authSessions,
        account: authAccounts,
        verification: authVerifications,
      },
    }),

    advanced: {
      database: {
        // Our id columns are uuid, so ids must be uuids rather than Better
        // Auth's default random strings.
        generateId: () => randomUUID(),
      },
      useSecureCookies: config.production,
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: 'lax',
        secure: config.production,
      },
    },

    trustedOrigins: [config.baseUrl, ...(config.trustedOrigins ?? [])],

    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
      cookieCache: {
        // A short cache keeps most requests off the sessions table without
        // letting a revoked session linger.
        enabled: true,
        maxAge: 60,
      },
    },

    emailAndPassword: { enabled: false },

    // Lets a non-browser client present its session as
    // `Authorization: Bearer <token>` instead of a cookie. The spec anticipates
    // a mobile app and exchange importers calling this API; without it each
    // would need its own, weaker authentication path invented for it.
    plugins: [bearer()],

    socialProviders: {
      google: {
        clientId: config.googleClientId,
        clientSecret: config.googleClientSecret,
      },
    },

    databaseHooks: {
      user: {
        create: {
          // Blocks a first sign-in by anyone not on the list. Without this,
          // authenticating with Google would be enough to get an account.
          before: async (user) => {
            if (!isAllowed(user.email, allowlist)) {
              throw denied(user.email);
            }
            return { data: { ...user, emailVerified: true } };
          },
        },
      },
      session: {
        create: {
          // Checked again on every sign-in, so removing an address from the
          // allowlist locks out an existing user rather than only new ones.
          before: async (session, ctx) => {
            const user = await ctx?.context.internalAdapter.findUserById(session.userId);
            if (user !== null && user !== undefined && !isAllowed(user.email, allowlist)) {
              throw denied(user.email);
            }
            return undefined;
          },
        },
      },
    },
  });
}
