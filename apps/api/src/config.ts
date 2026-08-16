import { DEFAULT_REPORTING_TIME_ZONE, timeZoneString } from '@journal/contracts';
import { z } from 'zod';

/**
 * Environment is validated once at startup so a misconfigured deployment fails
 * immediately and loudly, rather than at the first request that needs a value.
 */
const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1, { error: 'DATABASE_URL is required.' }),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  API_HOST: z.string().default('127.0.0.1'),
  REPORTING_TIMEZONE: timeZoneString.default(DEFAULT_REPORTING_TIME_ZONE),
  /** The browser-facing origin. Sessions and CORS are both anchored to it. */
  WEB_ORIGIN: z.url({ error: 'WEB_ORIGIN must be a full URL.' }).default('http://localhost:3000'),

  // --- Authentication ---
  // No defaults: a fallback secret is a published secret, and a missing Google
  // credential should stop the server rather than fail at first sign-in.
  BETTER_AUTH_SECRET: z
    .string()
    .min(32, { error: 'BETTER_AUTH_SECRET must be at least 32 characters.' }),
  GOOGLE_CLIENT_ID: z.string().min(1, { error: 'GOOGLE_CLIENT_ID is required.' }),
  GOOGLE_CLIENT_SECRET: z.string().min(1, { error: 'GOOGLE_CLIENT_SECRET is required.' }),
  /** Comma-separated Google addresses permitted to sign in. */
  ALLOWED_EMAILS: z.string().min(1, {
    error: 'ALLOWED_EMAILS is required — without it nobody can sign in.',
  }),
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = configSchema.safeParse(env);

  if (!result.success) {
    const detail = result.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(
      `Invalid environment configuration:\n${detail}\n\nCopy .env.example to .env at the repository root.`,
    );
  }

  return result.data;
}
