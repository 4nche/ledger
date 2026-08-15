import {
  apiSuccess,
  createAccountSchema,
  createUserSchema,
  updateAccountSchema,
  uuidString,
  type AccountResponse,
  type UserResponse,
} from '@journal/contracts';
import { accounts, users } from '@journal/db';
import { and, asc, eq, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { notFound } from '../../errors';
import { decimalOut } from '../../shared/decimal';

const idParams = z.object({ id: uuidString });

function serializeAccount(row: typeof accounts.$inferSelect): AccountResponse {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    provider: row.provider,
    accountType: row.accountType,
    currency: row.currency,
    startingBalance: decimalOut(row.startingBalance),
    externalAccountId: row.externalAccountId,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeUser(row: typeof users.$inferSelect): UserResponse {
  return { id: row.id, name: row.name, email: row.email };
}

export async function accountRoutes(app: FastifyInstance): Promise<void> {
  app.get('/users', async () => {
    const rows = await app.db.select().from(users).orderBy(asc(users.name));
    return apiSuccess(rows.map(serializeUser));
  });

  app.post('/users', async (request, reply) => {
    const input = createUserSchema.parse(request.body);
    const [row] = await app.db.insert(users).values(input).returning();
    if (row === undefined) throw notFound('User');
    return reply.status(201).send(apiSuccess(serializeUser(row)));
  });

  app.get('/accounts', async () => {
    const rows = await app.db
      .select()
      .from(accounts)
      .where(isNull(accounts.deletedAt))
      .orderBy(asc(accounts.name));
    return apiSuccess(rows.map(serializeAccount));
  });

  app.post('/accounts', async (request, reply) => {
    const input = createAccountSchema.parse(request.body);
    const [row] = await app.db.insert(accounts).values(input).returning();
    if (row === undefined) throw notFound('Account');
    return reply.status(201).send(apiSuccess(serializeAccount(row)));
  });

  app.patch('/accounts/:id', async (request) => {
    const { id } = idParams.parse(request.params);
    const input = updateAccountSchema.parse(request.body);

    const [row] = await app.db
      .update(accounts)
      .set({ ...input, updatedAt: new Date() })
      .where(and(eq(accounts.id, id), isNull(accounts.deletedAt)))
      .returning();

    if (row === undefined) throw notFound('Account');
    return apiSuccess(serializeAccount(row));
  });
}
