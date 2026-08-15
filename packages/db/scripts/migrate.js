/**
 * Applies pending migrations. Kept as plain JS with no build step so it can run
 * in a container that has only the compiled app and node_modules.
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const url = process.env.DATABASE_URL;

if (!url) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env at the repository root.');
  process.exit(1);
}

const sql = postgres(url, { max: 1 });

try {
  await migrate(drizzle(sql), {
    migrationsFolder: new URL('../migrations', import.meta.url).pathname,
  });
  console.info('Migrations applied.');
} catch (error) {
  console.error('Migration failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await sql.end();
}
