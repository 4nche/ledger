import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index.js';

export type Database = ReturnType<typeof createDatabase>;

export interface DatabaseOptions {
  readonly connectionString: string;
  /** Keep this at 1 for one-shot scripts such as migrations and seeds. */
  readonly maxConnections?: number;
}

/**
 * Fails loudly at startup rather than on the first query, so a misconfigured
 * environment is obvious immediately.
 */
export function readConnectionString(env: NodeJS.ProcessEnv = process.env): string {
  const url = env['DATABASE_URL'];
  if (url === undefined || url.trim().length === 0) {
    throw new Error(
      'DATABASE_URL is not set. Copy .env.example to .env at the repository root and start PostgreSQL with `pnpm db:up`.',
    );
  }
  return url;
}

export function createDatabase(options: DatabaseOptions) {
  const sql = postgres(options.connectionString, {
    max: options.maxConnections ?? 10,
    // Reason about instants only. Formatting into a reporting timezone is the
    // domain layer's job and always takes an explicit zone.
    types: {},
    onnotice: () => {},
  });

  return Object.assign(drizzle(sql, { schema }), { closeConnection: () => sql.end() });
}

export { schema };
