import { apiSuccess, overviewQuerySchema } from '@journal/contracts';
import type { FastifyInstance } from 'fastify';
import { buildOverview } from './service';

export async function analyticsRoutes(app: FastifyInstance): Promise<void> {
  /**
   * Returns the whole filtered range, grouped and summarised server-side.
   * Deliberately unpaginated — see docs/accounting-rules.md §10.
   */
  app.get('/analytics/overview', async (request) => {
    const query = overviewQuerySchema.parse(request.query);
    return apiSuccess(await buildOverview(app.db, query));
  });
}
