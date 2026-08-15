import type {
  ListPositionsQuery,
  PositionDetailResponse,
  PositionFilters,
  PositionResponse,
  TradeResponse,
} from '@journal/contracts';
import { accounts, positions, trades, users, type Database } from '@journal/db';
import { localDayRange } from '@journal/domain';
import { and, asc, count, desc, eq, gte, isNull, lt, type SQL } from 'drizzle-orm';
import { decimalOrNull, decimalOut } from '../../shared/decimal';

/**
 * Read models. Writes go through the service; nothing here mutates.
 *
 * Note which date each surface filters on: the position list filters by
 * `opened_at` ("when did I have this trade on"), while the overview filters by
 * an exit's `executed_at` ("when did I realize this"). They answer different
 * questions and must not be conflated.
 */

const positionColumns = {
  id: positions.id,
  accountId: positions.accountId,
  accountName: accounts.name,
  traderId: users.id,
  traderName: users.name,
  symbol: positions.symbol,
  marketType: positions.marketType,
  side: positions.side,
  status: positions.status,
  openedAt: positions.openedAt,
  closedAt: positions.closedAt,
  entryQuantity: positions.entryQuantity,
  exitQuantity: positions.exitQuantity,
  openQuantity: positions.openQuantity,
  averageEntryPrice: positions.averageEntryPrice,
  averageExitPrice: positions.averageExitPrice,
  initialStopPrice: positions.initialStopPrice,
  initialRiskAmount: positions.initialRiskAmount,
  initialRiskPct: positions.initialRiskPct,
  realizedPnl: positions.realizedPnl,
  realizedPnlPct: positions.realizedPnlPct,
  rMultiple: positions.rMultiple,
  fees: positions.fees,
  notes: positions.notes,
  createdAt: positions.createdAt,
  updatedAt: positions.updatedAt,
};

type PositionColumns = {
  [K in keyof typeof positionColumns]: K extends 'openedAt' | 'closedAt' | 'createdAt' | 'updatedAt'
    ? Date | null
    : string | null;
};

function serializePosition(row: PositionColumns): PositionResponse {
  return {
    id: String(row.id),
    accountId: String(row.accountId),
    accountName: String(row.accountName),
    traderId: String(row.traderId),
    traderName: String(row.traderName),
    symbol: String(row.symbol),
    marketType: String(row.marketType),
    side: row.side === 'SHORT' ? 'SHORT' : 'LONG',
    status: row.status === 'CLOSED' ? 'CLOSED' : 'OPEN',
    openedAt: (row.openedAt as Date).toISOString(),
    closedAt: row.closedAt === null ? null : (row.closedAt as Date).toISOString(),
    entryQuantity: decimalOut(String(row.entryQuantity)),
    exitQuantity: decimalOut(String(row.exitQuantity)),
    openQuantity: decimalOut(String(row.openQuantity)),
    averageEntryPrice: decimalOut(String(row.averageEntryPrice)),
    averageExitPrice: decimalOrNull(row.averageExitPrice as string | null),
    initialStopPrice: decimalOrNull(row.initialStopPrice as string | null),
    initialRiskAmount: decimalOrNull(row.initialRiskAmount as string | null),
    initialRiskPct: decimalOrNull(row.initialRiskPct as string | null),
    realizedPnl: decimalOut(String(row.realizedPnl)),
    realizedPnlPct: decimalOut(String(row.realizedPnlPct)),
    rMultiple: decimalOrNull(row.rMultiple as string | null),
    fees: decimalOut(String(row.fees)),
    notes: row.notes as string | null,
    createdAt: (row.createdAt as Date).toISOString(),
    updatedAt: (row.updatedAt as Date).toISOString(),
  };
}

function serializeTrade(row: {
  id: string;
  positionId: string;
  type: string;
  price: string;
  quantity: string;
  fee: string;
  executedAt: Date;
  externalTradeId: string | null;
  notes: string | null;
  realizedPnl: string | null;
  realizedPnlPct: string | null;
  rMultiple: string | null;
  averageEntryPrice: string | null;
}): TradeResponse {
  return {
    id: row.id,
    positionId: row.positionId,
    type: row.type === 'EXIT' ? 'EXIT' : 'ENTRY',
    price: decimalOut(row.price),
    quantity: decimalOut(row.quantity),
    fee: decimalOut(row.fee),
    executedAt: row.executedAt.toISOString(),
    externalTradeId: row.externalTradeId,
    notes: row.notes,
    realizedPnl: decimalOrNull(row.realizedPnl),
    realizedPnlPct: decimalOrNull(row.realizedPnlPct),
    rMultiple: decimalOrNull(row.rMultiple),
    averageEntryPrice: decimalOrNull(row.averageEntryPrice),
  };
}

/** Shared filter predicates. `dateColumn` decides which date the range applies to. */
export function filterConditions(query: PositionFilters, dateColumn: 'opened' | 'none'): SQL[] {
  const conditions: SQL[] = [isNull(positions.deletedAt)];

  if (query.accountId !== undefined) conditions.push(eq(positions.accountId, query.accountId));
  if (query.traderId !== undefined) conditions.push(eq(accounts.userId, query.traderId));
  if (query.symbol !== undefined) conditions.push(eq(positions.symbol, query.symbol));
  if (query.side !== undefined) conditions.push(eq(positions.side, query.side));
  if (query.status !== undefined) conditions.push(eq(positions.status, query.status));

  if (dateColumn === 'opened') {
    const range = localDayRange(query.from ?? null, query.to ?? null, query.timeZone);
    if (range.gte !== null) conditions.push(gte(positions.openedAt, range.gte));
    if (range.lt !== null) conditions.push(lt(positions.openedAt, range.lt));
  }

  return conditions;
}

export async function listPositions(
  db: Database,
  query: ListPositionsQuery,
): Promise<{ items: PositionResponse[]; total: number }> {
  const conditions = filterConditions(query, 'opened');

  const rows = await db
    .select(positionColumns)
    .from(positions)
    .innerJoin(accounts, eq(accounts.id, positions.accountId))
    .innerJoin(users, eq(users.id, accounts.userId))
    .where(and(...conditions))
    .orderBy(desc(positions.openedAt))
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize);

  const [totals] = await db
    .select({ value: count() })
    .from(positions)
    .innerJoin(accounts, eq(accounts.id, positions.accountId))
    .where(and(...conditions));

  return {
    items: rows.map((row) => serializePosition(row as PositionColumns)),
    total: totals?.value ?? 0,
  };
}

export async function findPositionDetail(
  db: Database,
  positionId: string,
): Promise<PositionDetailResponse | null> {
  const [row] = await db
    .select(positionColumns)
    .from(positions)
    .innerJoin(accounts, eq(accounts.id, positions.accountId))
    .innerJoin(users, eq(users.id, accounts.userId))
    .where(and(eq(positions.id, positionId), isNull(positions.deletedAt)))
    .limit(1);

  if (row === undefined) {
    return null;
  }

  const executions = await db
    .select()
    .from(trades)
    .where(and(eq(trades.positionId, positionId), isNull(trades.deletedAt)))
    .orderBy(asc(trades.executedAt), asc(trades.createdAt));

  return {
    ...serializePosition(row as PositionColumns),
    trades: executions.map(serializeTrade),
  };
}

/** Distinct symbols across non-deleted positions, alphabetical. */
export async function listSymbols(db: Database): Promise<string[]> {
  const rows = await db
    .selectDistinct({ symbol: positions.symbol })
    .from(positions)
    .where(isNull(positions.deletedAt))
    .orderBy(asc(positions.symbol));

  return rows.map((row) => row.symbol);
}
