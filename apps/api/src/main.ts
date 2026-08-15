import { loadConfig } from './config';
import { buildServer } from './server';

/**
 * v1 has no authentication, so the server binds to loopback by default.
 * Exposing it beyond localhost requires adding auth first — see the build
 * spec §1.5.
 */
async function main(): Promise<void> {
  const config = loadConfig();
  const app = await buildServer(config);

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'Shutting down');
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ port: config.API_PORT, host: config.API_HOST });
}

try {
  await main();
} catch (error) {
  console.error('Failed to start API:', error instanceof Error ? error.message : error);
  process.exit(1);
}
