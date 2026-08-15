import type {
  OverviewQuery,
  OverviewResponse,
  PeriodGroupResponse,
  RealizedEventResponse,
} from '@journal/contracts';
import { accounts, positions, trades, users, type Database } from '@journal/db';
import {
  RATIO_SCALE,
  groupByPeriod,
  localDayRange,
  parseDecimal,
  quantise,
  summarize,
  type PeriodSummary,
  type RealizedEvent,
} from '@journal/domain';
import { and, desc, eq, gte, isNull, lt } from 'drizzle-orm';
import { decimalOrNull, decimalOut } from '../../shared/decimal.js';
import { filterConditions } from '../positions/repository.js';

/**
 * A realized event carries everything the row needs plus the shape the domain
 * bucketing functions require. `executedAt` stays a Date until the very end,
 * because bucketing is calendar arithmetic and strings would invite guessing.
 */
interface RealizedEventRecord extends RealizedEvent {
  readonly tradeId: string;
  readonly symbol: string;
  readonly side: 'LONG' | 'SHORT';
  readonly accountId: string;
  readonly accountName: string;
  readonly accountStartingBalance: string;
  readonly traderId: string;
  readonly traderName: string;
  readonly quantity: string;
  readonly averageEntryPrice: string;
  readonly exitPrice: string;
  readonly realizedPnlPct: string;
  readonly holdingSeconds: number;
  readonly closesPosition: boolean;
}

function serializeEvent(event: RealizedEventRecord): RealizedEventResponse {
  return {
    tradeId: event.tradeId,
    positionId: event.positionId,
    executedAt: event.executedAt.toISOString(),
    symbol: event.symbol,
    side: event.side,
    accountId: event.accountId,
    accountName: event.accountName,
    traderId: event.traderId,
    traderName: event.traderName,
    quantity: event.quantity,
    averageEntryPrice: event.averageEntryPrice,
    exitPrice: event.exitPrice,
    realizedPnl: event.realizedPnl,
    realizedPnlPct: event.realizedPnlPct,
    rMultiple: event.rMultiple,
    holdingSeconds: event.holdingSeconds,
    closesPosition: event.closesPosition,
  };
}

function serializeSummary(summary: PeriodSummary) {
  return { ...summary };
}

async function fetchRealizedEvents(
  db: Database,
  query: OverviewQuery,
): Promise<RealizedEventRecord[]> {
  const conditions = filterConditions(query, 'none');
  conditions.push(eq(trades.type, 'EXIT'), isNull(trades.deletedAt));

  // The overview's date range applies to when PnL was *realized*, which is the
  // exit's own timestamp — not the position's open or close. Rules §10.
  const range = localDayRange(query.from ?? null, query.to ?? null, query.timeZone);
  if (range.gte !== null) conditions.push(gte(trades.executedAt, range.gte));
  if (range.lt !== null) conditions.push(lt(trades.executedAt, range.lt));

  const rows = await db
    .select({
      tradeId: trades.id,
      positionId: positions.id,
      executedAt: trades.executedAt,
      quantity: trades.quantity,
      averageEntryPrice: trades.averageEntryPrice,
      exitPrice: trades.price,
      realizedPnl: trades.realizedPnl,
      realizedPnlPct: trades.realizedPnlPct,
      rMultiple: trades.rMultiple,
      symbol: positions.symbol,
      side: positions.side,
      openedAt: positions.openedAt,
      closedAt: positions.closedAt,
      accountId: accounts.id,
      accountName: accounts.name,
      accountStartingBalance: accounts.startingBalance,
      traderId: users.id,
      traderName: users.name,
    })
    .from(trades)
    .innerJoin(positions, eq(positions.id, trades.positionId))
    .innerJoin(accounts, eq(accounts.id, positions.accountId))
    .innerJoin(users, eq(users.id, accounts.userId))
    .where(and(...conditions))
    .orderBy(desc(trades.executedAt));

  return rows.map((row) => ({
    tradeId: row.tradeId,
    positionId: row.positionId,
    executedAt: row.executedAt,
    symbol: row.symbol,
    side: row.side === 'SHORT' ? ('SHORT' as const) : ('LONG' as const),
    accountId: row.accountId,
    accountName: row.accountName,
    accountStartingBalance: row.accountStartingBalance,
    traderId: row.traderId,
    traderName: row.traderName,
    quantity: decimalOut(row.quantity),
    averageEntryPrice: decimalOut(row.averageEntryPrice ?? '0'),
    exitPrice: decimalOut(row.exitPrice),
    realizedPnl: decimalOut(row.realizedPnl ?? '0'),
    realizedPnlPct: decimalOut(row.realizedPnlPct ?? '0'),
    rMultiple: decimalOrNull(row.rMultiple),
    holdingSeconds: Math.round((row.executedAt.getTime() - row.openedAt.getTime()) / 1000),
    closesPosition: row.closedAt !== null && row.closedAt.getTime() === row.executedAt.getTime(),
  }));
}

/**
 * Return as a fraction of starting balance, but only when a single account is
 * in scope. Across accounts there is no single denominator, so the honest
 * answer is "undefined" rather than a number nobody can interpret. Rules §8.
 */
function deriveReturnPct(
  events: readonly RealizedEventRecord[],
  realizedPnl: string,
): string | null {
  const balances = new Map(events.map((event) => [event.accountId, event.accountStartingBalance]));
  if (balances.size !== 1) {
    return null;
  }
  const [startingBalance] = [...balances.values()];
  if (startingBalance === undefined) {
    return null;
  }
  return quantise(parseDecimal(realizedPnl).dividedBy(parseDecimal(startingBalance)), RATIO_SCALE);
}

export async function buildOverview(db: Database, query: OverviewQuery): Promise<OverviewResponse> {
  const events = await fetchRealizedEvents(db, query);
  const groups = groupByPeriod(events, query.period, query.timeZone);
  const totals = summarize(events);

  const groupResponses: PeriodGroupResponse[] = groups.map((group) => ({
    key: group.key,
    period: group.period,
    startsAt: group.startsAt.toISOString(),
    endsAt: group.endsAt.toISOString(),
    summary: serializeSummary(group.summary),
    items: group.items.map(serializeEvent),
  }));

  return {
    period: query.period,
    timeZone: query.timeZone,
    groups: groupResponses,
    totals: serializeSummary(totals),
    returnPct: deriveReturnPct(events, totals.realizedPnl),
  };
}
