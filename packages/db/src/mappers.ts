import type { ExecutionInput, PositionSnapshot } from '@journal/domain';
import type { NewPositionRow, NewTradeRow } from './schema/index.js';

/**
 * Turns a domain snapshot into rows. Kept here so the API service, the seed
 * script and any future importer all persist positions identically — there is
 * one place where derived values become columns.
 */

export interface PositionFacts {
  readonly accountId: string;
  readonly symbol: string;
  readonly marketType: string;
  readonly side: 'LONG' | 'SHORT';
  readonly initialStopPrice: string | null;
  readonly notes: string | null;
}

export function toPositionRow(facts: PositionFacts, snapshot: PositionSnapshot): NewPositionRow {
  return {
    accountId: facts.accountId,
    symbol: facts.symbol,
    marketType: facts.marketType,
    side: facts.side,
    initialStopPrice: facts.initialStopPrice,
    notes: facts.notes,

    status: snapshot.status,
    openedAt: snapshot.openedAt,
    closedAt: snapshot.closedAt,
    entryQuantity: snapshot.entryQuantity,
    exitQuantity: snapshot.exitQuantity,
    averageEntryPrice: snapshot.averageEntryPrice,
    averageExitPrice: snapshot.averageExitPrice,
    initialRiskAmount: snapshot.initialRiskAmount,
    initialRiskPct: snapshot.initialRiskPct,
    realizedPnl: snapshot.realizedPnl,
    realizedPnlPct: snapshot.realizedPnlPct,
    rMultiple: snapshot.rMultiple,
    fees: snapshot.fees,
    updatedAt: new Date(),
  };
}

/**
 * Executions become trade rows, with the realized columns attached to the exits
 * that produced them. Entries keep null realized values, which the
 * `trades_realized_pnl_check` constraint enforces independently.
 */
export function toTradeRows(
  positionId: string,
  executions: readonly ExecutionInput[],
  snapshot: PositionSnapshot,
): NewTradeRow[] {
  const realizedByExecution = new Map(
    snapshot.realizedExecutions.map((realized) => [realized.executionId, realized]),
  );

  return executions.map((execution) => {
    const realized = realizedByExecution.get(execution.id);
    return {
      id: execution.id,
      positionId,
      type: execution.type,
      price: execution.price,
      quantity: execution.quantity,
      fee: execution.fee,
      executedAt: execution.executedAt,
      realizedPnl: realized?.realizedPnl ?? null,
      realizedPnlPct: realized?.realizedPnlPct ?? null,
      rMultiple: realized?.rMultiple ?? null,
      averageEntryPrice: realized?.averageEntryPrice ?? null,
      updatedAt: new Date(),
    };
  });
}
