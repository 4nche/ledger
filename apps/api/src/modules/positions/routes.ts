import {
  addTradeSchema,
  apiSuccess,
  createPositionSchema,
  listPositionsQuerySchema,
  paginationMeta,
  updatePositionSchema,
  updateTradeSchema,
  uuidString,
} from '@journal/contracts';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { notFound } from '../../errors';
import { findPositionDetail, listPositions, listSymbols } from './repository';
import {
  addTrade,
  createPosition,
  softDeletePosition,
  softDeleteTrade,
  updatePosition,
  updateTrade,
} from './service';

const idParams = z.object({ id: uuidString });

/** Every mutation returns the recalculated position, so a client never has to guess. */
async function requireDetail(app: FastifyInstance, positionId: string) {
  const detail = await findPositionDetail(app.db, positionId);
  if (detail === null) throw notFound('Position');
  return detail;
}

export async function positionRoutes(app: FastifyInstance): Promise<void> {
  /** Distinct symbols ever traded, for the overview's symbol filter. */
  app.get('/symbols', async () => apiSuccess(await listSymbols(app.db)));

  app.get('/positions', async (request) => {
    const query = listPositionsQuerySchema.parse(request.query);
    const { items, total } = await listPositions(app.db, query);
    return apiSuccess(items, paginationMeta(total, query.page, query.pageSize));
  });

  app.get('/positions/:id', async (request) => {
    const { id } = idParams.parse(request.params);
    return apiSuccess(await requireDetail(app, id));
  });

  app.post('/positions', async (request, reply) => {
    const input = createPositionSchema.parse(request.body);
    const positionId = await createPosition(app.db, input);
    return reply.status(201).send(apiSuccess(await requireDetail(app, positionId)));
  });

  app.patch('/positions/:id', async (request) => {
    const { id } = idParams.parse(request.params);
    const input = updatePositionSchema.parse(request.body);
    await updatePosition(app.db, id, input);
    return apiSuccess(await requireDetail(app, id));
  });

  app.delete('/positions/:id', async (request, reply) => {
    const { id } = idParams.parse(request.params);
    await softDeletePosition(app.db, id);
    return reply.status(204).send();
  });

  app.post('/positions/:id/trades', async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const input = addTradeSchema.parse(request.body);
    await addTrade(app.db, id, input);
    return reply.status(201).send(apiSuccess(await requireDetail(app, id)));
  });

  app.patch('/trades/:id', async (request) => {
    const { id } = idParams.parse(request.params);
    const input = updateTradeSchema.parse(request.body);
    const positionId = await updateTrade(app.db, id, input);
    return apiSuccess(await requireDetail(app, positionId));
  });

  app.delete('/trades/:id', async (request) => {
    const { id } = idParams.parse(request.params);
    const positionId = await softDeleteTrade(app.db, id);
    return apiSuccess(await requireDetail(app, positionId));
  });
}
