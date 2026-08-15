import { defineConfig } from 'drizzle-kit';

// The .env lives at the repository root, but drizzle-kit runs from this
// package. Load it explicitly rather than depending on the launch directory.
try {
  process.loadEnvFile(new URL('../../.env', import.meta.url).pathname);
} catch {
  // No .env file — fall back to whatever the environment already provides.
}

const url = process.env['DATABASE_URL'];

if (url === undefined || url.length === 0) {
  throw new Error(
    'DATABASE_URL is not set. Copy .env.example to .env at the repository root, then retry.',
  );
}

export default defineConfig({
  schema: './src/schema/index.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
