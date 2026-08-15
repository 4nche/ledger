/**
 * Integration tests talk to a real PostgreSQL, so they need the same
 * DATABASE_URL the app uses. The .env lives at the repository root.
 */
try {
  process.loadEnvFile(new URL('../../.env', import.meta.url).pathname);
} catch {
  // Already provided by the environment (CI), or genuinely absent — the
  // config validation in loadConfig() will report it clearly either way.
}
