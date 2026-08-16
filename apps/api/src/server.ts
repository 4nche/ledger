import { apiSuccess } from '@journal/contracts';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import Fastify, { type FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import type { Config } from './config';
import { authPlugin } from './plugins/auth';
import { databasePlugin } from './plugins/database';
import { errorHandler } from './plugins/error-handler';
import { accountRoutes } from './modules/accounts/routes';
import { analyticsRoutes } from './modules/analytics/routes';
import { positionRoutes } from './modules/positions/routes';

export async function buildServer(config: Config): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.NODE_ENV === 'test' ? 'silent' : 'info',
      // Financial values are not secrets, but request bodies are noisy and can
      // contain notes; log metadata rather than payloads.
      redact: ['req.headers.authorization', 'req.headers.cookie'],
    },
    // Reject anything absurd before it reaches a handler.
    bodyLimit: 1_048_576,
  });

  await app.register(errorHandler);
  await app.register(sensible);
  await app.register(cors, { origin: config.WEB_ORIGIN, credentials: true });
  await app.register(databasePlugin, { connectionString: config.DATABASE_URL });
  await app.register(authPlugin, { config });

  /** Liveness plus a real database round-trip — a server that cannot reach
   *  PostgreSQL is not healthy, however well it answers HTTP. */
  app.get('/health', async () => {
    await app.db.execute(sql`select 1`);
    return apiSuccess({
      status: 'ok' as const,
      reportingTimeZone: config.REPORTING_TIMEZONE,
    });
  });

  /** Who am I, according to the server that can actually check. */
  app.get('/session', async (request) =>
    apiSuccess({
      trader: request.trader,
      reportingTimeZone: config.REPORTING_TIMEZONE,
    }),
  );

  await app.register(accountRoutes);
  await app.register(positionRoutes);
  await app.register(analyticsRoutes);

  return app;
}
