import { randomUUID } from 'node:crypto';
import type {
  CreatePositionInput,
  TradeInput,
  UpdatePositionInput,
  UpdateTradeInput,
} from '@journal/contracts';
import {
  accounts,
  positions,
  toPositionRow,
  toTradeRows,
  trades,
  type Database,
  type PositionRow,
} from '@journal/db';
import {
  reconstructPosition,
  type ExecutionInput,
  type PositionSide,
  type PositionSnapshot,
} from '@journal/domain';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { notFound, unprocessable } from '../../errors';

/** The transaction handle Drizzle hands to `db.transaction`. */
export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

type TradeRowShape = typeof trades.$inferSelect;

/**
 * Every mutation here derives the full position *before* writing anything, and
 * writes each row with its derived columns already attached.
 *
 * That ordering is not stylistic. `trades_realized_pnl_check` asserts that a
 * row is an EXIT exactly when it carries realized PnL, and PostgreSQL CHECK
 * constraints are immediate — they cannot be deferred to commit. Inserting a
 * raw exit and filling in its PnL a statement later would be rejected. Deriving
 * first means no row is ever momentarily inconsistent.
 */

function toExecutionInput(row: TradeRowShape): ExecutionInput {
  return {
    id: row.id,
    type: row.type === 'EXIT' ? 'EXIT' : 'ENTRY',
    price: row.price,
    quantity: row.quantity,
    fee: row.fee,
    executedAt: row.executedAt,
    createdAt: row.createdAt,
  };
}

function toNewExecutions(inputs: readonly TradeInput[]): ExecutionInput[] {
  const now = Date.now();
  return inputs.map((input, index) => ({
    id: randomUUID(),
    type: input.type,
    price: input.price,
    quantity: input.quantity,
    fee: input.fee,
    executedAt: input.executedAt,
    // Preserves the order the trader listed them in, which is the only signal
    // available when two executions share a timestamp.
    createdAt: new Date(now + index),
  }));
}

/** The realized columns for one execution — all null unless it is an exit. */
function realizedColumns(snapshot: PositionSnapshot, executionId: string) {
  const realized = snapshot.realizedExecutions.find(
    (candidate) => candidate.executionId === executionId,
  );
  return {
    realizedPnl: realized?.realizedPnl ?? null,
    realizedPnlPct: realized?.realizedPnlPct ?? null,
    rMultiple: realized?.rMultiple ?? null,
    averageEntryPrice: realized?.averageEntryPrice ?? null,
  };
}

async function loadAccountBalance(tx: Tx, accountId: string): Promise<string> {
  const [account] = await tx
    .select({ startingBalance: accounts.startingBalance })
    .from(accounts)
    .where(and(eq(accounts.id, accountId), isNull(accounts.deletedAt)))
    .limit(1);

  if (account === undefined) {
    throw notFound('Account');
  }
  return account.startingBalance;
}

async function loadPosition(tx: Tx, positionId: string): Promise<PositionRow> {
  const [position] = await tx
    .select()
    .from(positions)
    .where(and(eq(positions.id, positionId), isNull(positions.deletedAt)))
    .limit(1);

  if (position === undefined) {
    throw notFound('Position');
  }
  return position;
}

function loadExecutionRows(tx: Tx, positionId: string): Promise<TradeRowShape[]> {
  return tx
    .select()
    .from(trades)
    .where(and(eq(trades.positionId, positionId), isNull(trades.deletedAt)))
    .orderBy(asc(trades.executedAt), asc(trades.createdAt));
}

async function derive(
  tx: Tx,
  position: PositionRow,
  executions: readonly ExecutionInput[],
): Promise<PositionSnapshot> {
  const startingBalance = await loadAccountBalance(tx, position.accountId);
  const result = reconstructPosition({
    side: position.side as PositionSide,
    initialStopPrice: position.initialStopPrice,
    accountStartingBalance: startingBalance,
    executions,
  });

  if (!result.ok) {
    throw unprocessable(result.issues);
  }
  return result.position;
}

async function writeDerived(
  tx: Tx,
  position: PositionRow,
  snapshot: PositionSnapshot,
  executionIds: readonly string[],
): Promise<void> {
  await tx
    .update(positions)
    .set(
      toPositionRow(
        {
          accountId: position.accountId,
          symbol: position.symbol,
          marketType: position.marketType,
          side: position.side as PositionSide,
          initialStopPrice: position.initialStopPrice,
          notes: position.notes,
        },
        snapshot,
      ),
    )
    .where(eq(positions.id, position.id));

  // Rewrite realized columns on every surviving execution — including clearing
  // them on entries, so a trade converted from EXIT to ENTRY cannot keep stale
  // PnL that the constraint would then reject.
  for (const executionId of executionIds) {
    await tx
      .update(trades)
      .set({ ...realizedColumns(snapshot, executionId), updatedAt: new Date() })
      .where(eq(trades.id, executionId));
  }
}

/**
 * The single re-derivation path for a position that already has its executions
 * stored. Idempotent, and the only function permitted to rewrite derived
 * columns. See docs/accounting-rules.md §12.
 *
 * Always call inside a transaction: a half-applied recalculation would leave a
 * position disagreeing with its own trades.
 */
export async function recalculatePosition(tx: Tx, positionId: string): Promise<void> {
  const position = await loadPosition(tx, positionId);
  const rows = await loadExecutionRows(tx, positionId);
  const snapshot = await derive(tx, position, rows.map(toExecutionInput));
  await writeDerived(
    tx,
    position,
    snapshot,
    rows.map((row) => row.id),
  );
}

export async function createPosition(db: Database, input: CreatePositionInput): Promise<string> {
  return db.transaction(async (tx) => {
    const startingBalance = await loadAccountBalance(tx, input.accountId);
    const executions = toNewExecutions(input.trades);

    const result = reconstructPosition({
      side: input.side,
      initialStopPrice: input.initialStopPrice,
      accountStartingBalance: startingBalance,
      executions,
    });

    if (!result.ok) {
      throw unprocessable(result.issues);
    }

    const positionId = randomUUID();
    await tx.insert(positions).values({
      id: positionId,
      ...toPositionRow(
        {
          accountId: input.accountId,
          symbol: input.symbol,
          marketType: input.marketType,
          side: input.side,
          initialStopPrice: input.initialStopPrice,
          notes: input.notes,
        },
        result.position,
      ),
    });
    await tx.insert(trades).values(toTradeRows(positionId, executions, result.position));

    return positionId;
  });
}

/**
 * Supplying `trades` replaces the whole execution set. Replaced executions are
 * soft deleted rather than destroyed — raw facts survive edits. Rules §12.
 */
export async function updatePosition(
  db: Database,
  positionId: string,
  input: UpdatePositionInput,
): Promise<void> {
  await db.transaction(async (tx) => {
    const existing = await loadPosition(tx, positionId);

    // Facts the trader can change directly. An omitted field keeps its value.
    const position: PositionRow = {
      ...existing,
      symbol: input.symbol ?? existing.symbol,
      marketType: input.marketType ?? existing.marketType,
      side: input.side ?? existing.side,
      initialStopPrice:
        input.initialStopPrice === undefined ? existing.initialStopPrice : input.initialStopPrice,
      notes: input.notes === undefined ? existing.notes : input.notes,
    };

    if (input.trades === undefined) {
      const rows = await loadExecutionRows(tx, positionId);
      const snapshot = await derive(tx, position, rows.map(toExecutionInput));
      await writeDerived(
        tx,
        position,
        snapshot,
        rows.map((row) => row.id),
      );
      return;
    }

    const now = new Date();
    await tx
      .update(trades)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(eq(trades.positionId, positionId), isNull(trades.deletedAt)));

    const executions = toNewExecutions(input.trades);
    const snapshot = await derive(tx, position, executions);
    await tx.insert(trades).values(toTradeRows(positionId, executions, snapshot));
    await writeDerived(tx, position, snapshot, []);
  });
}

export async function softDeletePosition(db: Database, positionId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await loadPosition(tx, positionId);
    const now = new Date();
    await tx
      .update(positions)
      .set({ deletedAt: now, updatedAt: now })
      .where(eq(positions.id, positionId));
    await tx
      .update(trades)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(eq(trades.positionId, positionId), isNull(trades.deletedAt)));
  });
}

export async function addTrade(
  db: Database,
  positionId: string,
  input: TradeInput,
): Promise<string> {
  return db.transaction(async (tx) => {
    const position = await loadPosition(tx, positionId);
    const rows = await loadExecutionRows(tx, positionId);
    const [addition] = toNewExecutions([input]);
    if (addition === undefined) {
      throw notFound('Trade');
    }

    const snapshot = await derive(tx, position, [...rows.map(toExecutionInput), addition]);

    await tx.insert(trades).values({
      id: addition.id,
      positionId,
      type: addition.type,
      price: addition.price,
      quantity: addition.quantity,
      fee: addition.fee,
      executedAt: addition.executedAt,
      externalTradeId: input.externalTradeId,
      notes: input.notes,
      createdAt: addition.createdAt,
      updatedAt: new Date(),
      ...realizedColumns(snapshot, addition.id),
    });

    await writeDerived(
      tx,
      position,
      snapshot,
      rows.map((row) => row.id),
    );
    return addition.id;
  });
}

async function loadTrade(tx: Tx, tradeId: string): Promise<TradeRowShape> {
  const [trade] = await tx
    .select()
    .from(trades)
    .where(and(eq(trades.id, tradeId), isNull(trades.deletedAt)))
    .limit(1);

  if (trade === undefined) {
    throw notFound('Trade');
  }
  return trade;
}

export async function updateTrade(
  db: Database,
  tradeId: string,
  input: UpdateTradeInput,
): Promise<string> {
  return db.transaction(async (tx) => {
    const trade = await loadTrade(tx, tradeId);
    const position = await loadPosition(tx, trade.positionId);
    const rows = await loadExecutionRows(tx, trade.positionId);

    const patched: TradeRowShape = {
      ...trade,
      type: input.type ?? trade.type,
      price: input.price ?? trade.price,
      quantity: input.quantity ?? trade.quantity,
      fee: input.fee ?? trade.fee,
      executedAt: input.executedAt ?? trade.executedAt,
      notes: input.notes === undefined ? trade.notes : input.notes,
    };

    const executions = rows.map((row) => toExecutionInput(row.id === tradeId ? patched : row));
    const snapshot = await derive(tx, position, executions);

    await tx
      .update(trades)
      .set({
        type: patched.type,
        price: patched.price,
        quantity: patched.quantity,
        fee: patched.fee,
        executedAt: patched.executedAt,
        notes: patched.notes,
        updatedAt: new Date(),
        ...realizedColumns(snapshot, tradeId),
      })
      .where(eq(trades.id, tradeId));

    await writeDerived(
      tx,
      position,
      snapshot,
      rows.filter((row) => row.id !== tradeId).map((row) => row.id),
    );
    return trade.positionId;
  });
}

export async function softDeleteTrade(db: Database, tradeId: string): Promise<string> {
  return db.transaction(async (tx) => {
    const trade = await loadTrade(tx, tradeId);
    const now = new Date();

    await tx.update(trades).set({ deletedAt: now, updatedAt: now }).where(eq(trades.id, tradeId));

    await recalculatePosition(tx, trade.positionId);
    return trade.positionId;
  });
}
