import { describe, expect, it } from 'vitest';
import { createAccountSchema } from './accounts.js';
import { overviewQuerySchema } from './analytics.js';
import { createPositionSchema, tradeInputSchema } from './positions.js';
import { feeString, instant, priceString, quantityString, timeZoneString } from './primitives.js';
import { listPositionsQuerySchema } from './queries.js';
import { apiFailure, apiSuccess, paginationMeta } from './response.js';

const UUID = '3f8c2b1e-9d4a-4c7b-8e21-5a6f0d7b9c34';

describe('decimal strings', () => {
  it.each(['0.125', '117523.40', '117500'])('accepts %s as a price', (value) => {
    expect(priceString.safeParse(value).success).toBe(true);
  });

  it('rejects JSON numbers outright — the wire format is strings', () => {
    expect(priceString.safeParse(117523.4).success).toBe(false);
    expect(quantityString.safeParse(0.125).success).toBe(false);
  });

  it('rejects exponential notation, which would round-trip badly', () => {
    expect(priceString.safeParse('1.175e5').success).toBe(false);
  });

  it('rejects more precision than the column can hold', () => {
    expect(priceString.safeParse('1.0000000000001').success).toBe(false); // 13dp > 12
    expect(priceString.safeParse('1.000000000001').success).toBe(true); // 12dp
    expect(feeString.safeParse('1.000000001').success).toBe(false); // 9dp > 8
  });

  it('enforces sign', () => {
    expect(priceString.safeParse('0').success).toBe(false);
    expect(priceString.safeParse('-1').success).toBe(false);
    expect(quantityString.safeParse('0').success).toBe(false);
    expect(feeString.safeParse('0').success).toBe(true); // a zero fee is legitimate
    expect(feeString.safeParse('-1').success).toBe(false);
  });

  it('explains itself rather than saying "invalid"', () => {
    const result = priceString.safeParse('abc');
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/decimal string/i);
  });
});

describe('instants and time zones', () => {
  it('parses an ISO timestamp into a Date', () => {
    const parsed = instant.parse('2026-08-15T10:31:00Z');
    expect(parsed).toBeInstanceOf(Date);
    expect(parsed.toISOString()).toBe('2026-08-15T10:31:00.000Z');
  });

  it('rejects a timestamp with no zone information', () => {
    expect(instant.safeParse('2026-08-15 10:31:00').success).toBe(false);
  });

  it('accepts real IANA zones and rejects invented ones', () => {
    expect(timeZoneString.safeParse('Europe/Amsterdam').success).toBe(true);
    expect(timeZoneString.safeParse('UTC').success).toBe(true);
    expect(timeZoneString.safeParse('Mars/Olympus_Mons').success).toBe(false);
  });
});

describe('createPositionSchema', () => {
  const validTrade = {
    type: 'ENTRY' as const,
    price: '117500',
    quantity: '0.1',
    executedAt: '2026-08-15T10:31:00Z',
  };

  it('accepts the spec’s worked example', () => {
    const result = createPositionSchema.safeParse({
      accountId: UUID,
      symbol: 'BTCUSDT',
      side: 'LONG',
      initialStopPrice: '115000',
      trades: [
        validTrade,
        {
          type: 'EXIT',
          price: '120000',
          quantity: '0.1',
          fee: '8.24',
          executedAt: '2026-08-15T15:42:00Z',
        },
      ],
    });
    expect(result.success).toBe(true);
    expect(result.data?.marketType).toBe('PERPETUAL');
    expect(result.data?.trades[0]?.fee).toBe('0');
  });

  it('normalises the symbol to upper case', () => {
    const result = createPositionSchema.parse({
      accountId: UUID,
      symbol: '  btcusdt ',
      side: 'LONG',
      trades: [validTrade],
    });
    expect(result.symbol).toBe('BTCUSDT');
  });

  it('requires at least one execution', () => {
    const result = createPositionSchema.safeParse({
      accountId: UUID,
      symbol: 'BTCUSDT',
      side: 'LONG',
      trades: [],
    });
    expect(result.success).toBe(false);
  });

  it('turns blank notes into null instead of an empty string', () => {
    const result = createPositionSchema.parse({
      accountId: UUID,
      symbol: 'BTCUSDT',
      side: 'LONG',
      notes: '   ',
      trades: [validTrade],
    });
    expect(result.notes).toBeNull();
  });

  it('ignores derived values a client tries to dictate', () => {
    const result = createPositionSchema.parse({
      accountId: UUID,
      symbol: 'BTCUSDT',
      side: 'LONG',
      realizedPnl: '999999',
      rMultiple: '42',
      status: 'CLOSED',
      trades: [validTrade],
    });
    expect(result).not.toHaveProperty('realizedPnl');
    expect(result).not.toHaveProperty('rMultiple');
    expect(result).not.toHaveProperty('status');
  });

  it('rejects an unknown side', () => {
    expect(
      createPositionSchema.safeParse({
        accountId: UUID,
        symbol: 'BTCUSDT',
        side: 'SIDEWAYS',
        trades: [validTrade],
      }).success,
    ).toBe(false);
  });
});

describe('tradeInputSchema', () => {
  it('defaults a missing fee to zero rather than undefined', () => {
    const parsed = tradeInputSchema.parse({
      type: 'EXIT',
      price: '120000',
      quantity: '0.1',
      executedAt: '2026-08-15T15:42:00Z',
    });
    expect(parsed.fee).toBe('0');
    expect(parsed.externalTradeId).toBeNull();
  });
});

describe('createAccountSchema', () => {
  const base = {
    userId: UUID,
    name: 'FTMO Challenge #1',
    provider: 'FTMO',
    accountType: 'PROP_CHALLENGE',
    currency: 'usd',
    startingBalance: '100000',
  };

  it('upper-cases the currency and defaults the account to active', () => {
    const parsed = createAccountSchema.parse(base);
    expect(parsed.currency).toBe('USD');
    expect(parsed.isActive).toBe(true);
  });

  it('rejects a currency that is not a three-letter code', () => {
    expect(createAccountSchema.safeParse({ ...base, currency: 'DOLLAR' }).success).toBe(false);
  });

  it('rejects a zero starting balance, which every percentage divides by', () => {
    expect(createAccountSchema.safeParse({ ...base, startingBalance: '0' }).success).toBe(false);
  });

  it('has no currentBalance field in v1', () => {
    const parsed = createAccountSchema.parse({ ...base, currentBalance: '123' });
    expect(parsed).not.toHaveProperty('currentBalance');
  });
});

describe('query schemas', () => {
  it('coerces pagination from query strings and applies defaults', () => {
    const parsed = listPositionsQuerySchema.parse({ page: '2', pageSize: '25' });
    expect(parsed.page).toBe(2);
    expect(parsed.pageSize).toBe(25);
    expect(parsed.timeZone).toBe('Europe/Amsterdam');
  });

  it('defaults pagination when absent', () => {
    const parsed = listPositionsQuerySchema.parse({});
    expect(parsed.page).toBe(1);
    expect(parsed.pageSize).toBe(50);
  });

  it('caps page size so a client cannot ask for everything', () => {
    expect(listPositionsQuerySchema.safeParse({ pageSize: '10000' }).success).toBe(false);
  });

  it('rejects an inverted date range', () => {
    expect(
      listPositionsQuerySchema.safeParse({ from: '2026-08-31', to: '2026-08-01' }).success,
    ).toBe(false);
    expect(
      listPositionsQuerySchema.safeParse({ from: '2026-08-01', to: '2026-08-31' }).success,
    ).toBe(true);
  });

  it('defaults the overview to daily grouping', () => {
    const parsed = overviewQuerySchema.parse({});
    expect(parsed.period).toBe('DAY');
    expect(parsed.timeZone).toBe('Europe/Amsterdam');
  });

  it('has no pagination on the overview — group totals must see the whole range', () => {
    const parsed = overviewQuerySchema.parse({ page: '2', pageSize: '10' });
    expect(parsed).not.toHaveProperty('page');
    expect(parsed).not.toHaveProperty('pageSize');
  });
});

describe('response envelope', () => {
  it('narrows on success', () => {
    const response = apiSuccess({ id: UUID });
    expect(response.success).toBe(true);
    expect(response.data.id).toBe(UUID);
    expect(response.meta).toBeUndefined();
  });

  it('carries pagination metadata when given', () => {
    const response = apiSuccess([1, 2, 3], paginationMeta(120, 2, 50));
    expect(response.meta).toEqual({ total: 120, page: 2, pageSize: 50, pageCount: 3 });
  });

  it('reports at least one page even when empty', () => {
    expect(paginationMeta(0, 1, 50).pageCount).toBe(1);
  });

  it('carries field-level issues on failure', () => {
    const response = apiFailure('Validation failed', [
      { path: 'trades.0.price', message: 'Price must be greater than zero.', code: 'custom' },
    ]);
    expect(response.success).toBe(false);
    expect(response.issues?.[0]?.path).toBe('trades.0.price');
  });
});
