import { randomUUID } from 'node:crypto';
import { accounts, positions, trades, users } from '@journal/db';
import { eq, inArray } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from './config';
import { buildServer } from './server';

/**
 * Integration tests against a real PostgreSQL. They exist because the parts
 * that break in this system are the seams — schema constraints, Zod defaults,
 * transaction ordering — none of which unit tests can reach.
 *
 * Requires `pnpm db:up` and an applied migration.
 */

let app: FastifyInstance;
let accountId: string;
let userId: string;
const createdPositions: string[] = [];

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

async function call(method: Method, url: string, payload?: unknown) {
  const response =
    payload === undefined
      ? await app.inject({ method, url })
      : await app.inject({ method, url, payload: payload as object });
  // 204 responses carry no body to parse.
  const body = response.body.length === 0 ? {} : (response.json() as Record<string, unknown>);
  return { status: response.statusCode, body };
}

function dataOf(body: Record<string, unknown>): Record<string, unknown> {
  return body['data'] as Record<string, unknown>;
}

const ENTRY = {
  type: 'ENTRY',
  price: '117500',
  quantity: '0.1',
  executedAt: '2026-08-15T10:31:00Z',
};
const EXIT = {
  type: 'EXIT',
  price: '120000',
  quantity: '0.1',
  fee: '8.24',
  executedAt: '2026-08-15T15:42:00Z',
};

async function createPosition(overrides: Record<string, unknown> = {}) {
  const result = await call('POST', '/positions', {
    accountId,
    symbol: 'BTCUSDT',
    side: 'LONG',
    initialStopPrice: '115000',
    trades: [ENTRY, EXIT],
    ...overrides,
  });
  if (result.status === 201) {
    createdPositions.push(dataOf(result.body)['id'] as string);
  }
  return result;
}

beforeAll(async () => {
  app = await buildServer({ ...loadConfig(), NODE_ENV: 'test' });

  userId = randomUUID();
  accountId = randomUUID();
  await app.db.insert(users).values({
    id: userId,
    name: 'Integration Tester',
    email: `test-${userId}@example.com`,
  });
  await app.db.insert(accounts).values({
    id: accountId,
    userId,
    name: `Test Account ${accountId}`,
    provider: 'MANUAL',
    accountType: 'PAPER',
    currency: 'USD',
    startingBalance: '100000',
  });
});

afterAll(async () => {
  if (createdPositions.length > 0) {
    await app.db.delete(trades).where(inArray(trades.positionId, createdPositions));
    await app.db.delete(positions).where(inArray(positions.id, createdPositions));
  }
  await app.db.delete(accounts).where(eq(accounts.id, accountId));
  await app.db.delete(users).where(eq(users.id, userId));
  await app.close();
});

describe('GET /health', () => {
  it('reports ok only when the database answers', async () => {
    const { status, body } = await call('GET', '/health');
    expect(status).toBe(200);
    expect(dataOf(body)['status']).toBe('ok');
  });
});

describe('POST /positions', () => {
  it('derives every value server-side from the spec worked example', async () => {
    const { status, body } = await createPosition();
    const position = dataOf(body);

    expect(status).toBe(201);
    expect(position['status']).toBe('CLOSED');
    expect(position['realizedPnl']).toBe('241.76');
    expect(position['rMultiple']).toBe('0.96704');
    expect(position['realizedPnlPct']).toBe('0.0024176');
    expect(position['initialRiskAmount']).toBe('250');
    expect(position['averageEntryPrice']).toBe('117500');
  });

  it('ignores derived values supplied by the client', async () => {
    const { body } = await createPosition({ realizedPnl: '999999', rMultiple: '42' });
    expect(dataOf(body)['realizedPnl']).toBe('241.76');
  });

  it('attaches realized PnL to the exit and leaves the entry null', async () => {
    const { body } = await createPosition();
    const executions = dataOf(body)['trades'] as Array<Record<string, unknown>>;
    const entry = executions.find((execution) => execution['type'] === 'ENTRY');
    const exit = executions.find((execution) => execution['type'] === 'EXIT');

    expect(entry?.['realizedPnl']).toBeNull();
    expect(exit?.['realizedPnl']).toBe('241.76');
    expect(exit?.['averageEntryPrice']).toBe('117500');
  });

  it.each([
    ['exit exceeding entry', [ENTRY, { ...EXIT, quantity: '5' }], 'EXIT_EXCEEDS_ENTRY'],
    [
      'an exit before the first entry',
      [{ ...ENTRY, executedAt: '2026-08-15T20:00:00Z' }, EXIT],
      'EXIT_BEFORE_ENTRY',
    ],
  ])('rejects %s with 422', async (_label, tradeSet, code) => {
    const { status, body } = await createPosition({ trades: tradeSet });
    expect(status).toBe(422);
    const issues = body['issues'] as Array<Record<string, unknown>>;
    expect(issues.map((issue) => issue['code'])).toContain(code);
  });

  it('rejects a stop on the wrong side of entry', async () => {
    const { status } = await createPosition({ initialStopPrice: '999999', trades: [ENTRY] });
    expect(status).toBe(422);
  });

  it('rejects a price sent as a JSON number', async () => {
    const { status } = await createPosition({ trades: [{ ...ENTRY, price: 117500 }] });
    expect(status).toBe(422);
  });

  it('404s on an unknown account rather than creating an orphan', async () => {
    const { status } = await createPosition({ accountId: '00000000-0000-4000-8000-000000000000' });
    expect(status).toBe(404);
  });
});

describe('recalculation through the mutation endpoints', () => {
  it('preserves fields the patch does not mention', async () => {
    // Regression: Zod's .partial() kept .default(), so patching the quantity
    // silently reset the fee to "0" and reported 100 instead of 91.76.
    const created = await createPosition();
    const executions = dataOf(created.body)['trades'] as Array<Record<string, unknown>>;
    const exitId = executions.find((execution) => execution['type'] === 'EXIT')?.['id'];

    const { body } = await call('PATCH', `/trades/${String(exitId)}`, { quantity: '0.04' });
    const position = dataOf(body);

    expect(position['fees']).toBe('8.24');
    expect(position['realizedPnl']).toBe('91.76');
    expect(position['status']).toBe('OPEN');
    expect(position['openQuantity']).toBe('0.06');
    expect(position['closedAt']).toBeNull();
  });

  it('adds an exit and keeps slices summing to the position total', async () => {
    // Regression: inserting a raw EXIT tripped trades_realized_pnl_check,
    // because CHECK constraints are immediate and cannot be deferred.
    const created = await createPosition({ trades: [ENTRY, { ...EXIT, quantity: '0.04' }] });
    const positionId = dataOf(created.body)['id'];

    const { status, body } = await call('POST', `/positions/${String(positionId)}/trades`, {
      type: 'EXIT',
      price: '121000',
      quantity: '0.06',
      fee: '1',
      executedAt: '2026-08-15T17:00:00Z',
    });
    const position = dataOf(body);
    const slices = (position['trades'] as Array<Record<string, unknown>>)
      .filter((execution) => execution['type'] === 'EXIT')
      .map((execution) => Number(execution['realizedPnl']));

    expect(status).toBe(201);
    expect(position['status']).toBe('CLOSED');
    expect(position['realizedPnl']).toBe('300.76');
    expect(slices.reduce((total, slice) => total + slice, 0)).toBeCloseTo(300.76, 8);
  });

  it('reopens a position when its closing exit is deleted', async () => {
    const created = await createPosition();
    const executions = dataOf(created.body)['trades'] as Array<Record<string, unknown>>;
    const exitId = executions.find((execution) => execution['type'] === 'EXIT')?.['id'];

    const { body } = await call('DELETE', `/trades/${String(exitId)}`);
    const position = dataOf(body);

    expect(position['status']).toBe('OPEN');
    expect(position['realizedPnl']).toBe('0');
    expect(position['closedAt']).toBeNull();
  });

  it('replaces the whole execution set on PATCH /positions/:id', async () => {
    const created = await createPosition();
    const positionId = dataOf(created.body)['id'];

    const { body } = await call('PATCH', `/positions/${String(positionId)}`, {
      trades: [
        { ...ENTRY, price: '117500', quantity: '2' },
        { ...EXIT, price: '118500', quantity: '2', fee: '0' },
      ],
    });
    const position = dataOf(body);

    expect(position['realizedPnl']).toBe('2000');
    expect((position['trades'] as unknown[]).length).toBe(2);
    // The stop was not mentioned, so it survives.
    expect(position['initialStopPrice']).toBe('115000');
  });

  it('soft deletes a position so it disappears from reads', async () => {
    const created = await createPosition();
    const positionId = String(dataOf(created.body)['id']);

    expect((await call('DELETE', `/positions/${positionId}`)).status).toBe(204);
    expect((await call('GET', `/positions/${positionId}`)).status).toBe(404);

    // The raw rows are still there — the journal never destroys facts.
    const surviving = await app.db.select().from(positions).where(eq(positions.id, positionId));
    expect(surviving).toHaveLength(1);
    expect(surviving[0]?.deletedAt).not.toBeNull();
  });
});

describe('GET /analytics/overview', () => {
  it('buckets a realized exit by the reporting timezone, not UTC', async () => {
    await createPosition({
      trades: [
        { ...ENTRY, executedAt: '2026-08-15T18:00:00Z' },
        { ...EXIT, executedAt: '2026-08-15T22:40:00Z' }, // 16 Aug 00:40 in Amsterdam
      ],
    });

    const amsterdam = await call(
      'GET',
      `/analytics/overview?period=DAY&accountId=${accountId}&timeZone=Europe/Amsterdam`,
    );
    const utc = await call(
      'GET',
      `/analytics/overview?period=DAY&accountId=${accountId}&timeZone=UTC`,
    );

    const keysIn = (body: Record<string, unknown>) =>
      (dataOf(body)['groups'] as Array<Record<string, unknown>>).map((group) => group['key']);

    expect(keysIn(amsterdam.body)).toContain('2026-08-16');
    expect(keysIn(utc.body)).not.toContain('2026-08-16');
  });

  it('excludes an open position’s unrealized portion from the totals', async () => {
    const { body } = await call('GET', `/analytics/overview?accountId=${accountId}`);
    const totals = dataOf(body)['totals'] as Record<string, unknown>;
    // Every event counted is an exit; entries never appear.
    expect(Number(totals['events'])).toBeGreaterThan(0);
  });

  it('defines return % for one account and leaves it null across accounts', async () => {
    const single = await call('GET', `/analytics/overview?accountId=${accountId}`);
    expect(dataOf(single.body)['returnPct']).not.toBeNull();

    const all = await call('GET', '/analytics/overview');
    expect(dataOf(all.body)['returnPct']).toBeNull();
  });

  it('rejects an unknown time zone rather than falling back silently', async () => {
    const { status } = await call('GET', '/analytics/overview?timeZone=Mars/Base');
    expect(status).toBe(422);
  });

  it('is not paginated — group totals must see the whole range', async () => {
    const { body } = await call('GET', '/analytics/overview?page=2&pageSize=1');
    expect(body['meta']).toBeUndefined();
  });
});

describe('GET /positions', () => {
  it('paginates and reports totals', async () => {
    const { body } = await call('GET', `/positions?accountId=${accountId}&pageSize=2`);
    const meta = body['meta'] as Record<string, unknown>;
    expect((body['data'] as unknown[]).length).toBeLessThanOrEqual(2);
    expect(Number(meta['total'])).toBeGreaterThan(0);
    expect(meta['pageSize']).toBe(2);
  });

  it('rejects an inverted date range', async () => {
    const { status } = await call('GET', '/positions?from=2026-08-31&to=2026-08-01');
    expect(status).toBe(422);
  });
});

describe('error envelope', () => {
  it('404s an unknown route in the standard shape', async () => {
    const { status, body } = await call('GET', '/nope');
    expect(status).toBe(404);
    expect(body['success']).toBe(false);
    expect(typeof body['error']).toBe('string');
  });

  it('422s a malformed uuid in the path', async () => {
    const { status } = await call('GET', '/positions/not-a-uuid');
    expect(status).toBe(422);
  });
});
