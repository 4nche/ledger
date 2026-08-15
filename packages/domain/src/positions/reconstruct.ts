import {
  MONEY_SCALE,
  PRICE_SCALE,
  QUANTITY_SCALE,
  RATIO_SCALE,
  ZERO,
  parseDecimal,
  quantise,
  type DecimalValue,
} from '../money/decimal';
import { sortExecutions } from './ordering';
import { validateFields, validateSequence } from './validate';
import type {
  ExecutionInput,
  PositionInput,
  PositionSnapshot,
  ReconstructResult,
  RealizedExecution,
} from '../types';

/**
 * Derives every stored value of a position from its raw executions.
 *
 * Pure and deterministic: the same executions always produce the same
 * snapshot, which is what makes `recalculatePosition` safe to re-run.
 * The rules implemented here are specified in docs/accounting-rules.md.
 */
export function reconstructPosition(input: PositionInput): ReconstructResult {
  const fieldIssues = validateFields(input);
  if (fieldIssues.length > 0) {
    return { ok: false, issues: fieldIssues };
  }

  const ordered = sortExecutions(input.executions);
  const sequenceIssues = validateSequence(input, ordered);
  if (sequenceIssues.length > 0) {
    return { ok: false, issues: sequenceIssues };
  }

  return { ok: true, position: derive(input, ordered) };
}

function derive(input: PositionInput, ordered: readonly ExecutionInput[]): PositionSnapshot {
  const entries = ordered.filter((execution) => execution.type === 'ENTRY');
  const exits = ordered.filter((execution) => execution.type === 'EXIT');
  const startingBalance = parseDecimal(input.accountStartingBalance);

  const entryQuantity = sumQuantities(entries);
  const exitQuantity = sumQuantities(exits);
  const initialRisk = deriveInitialRisk(input, entries, entryQuantity);

  // Walk the executions in order so each exit is priced against the cost basis
  // as it stood at that moment, not the final average. Rules §6.1.
  let runningEntryQuantity = ZERO;
  let runningEntryNotional = ZERO;
  let runningEntryFees = ZERO;
  let realizedPnl = ZERO;
  const realizedExecutions: RealizedExecution[] = [];

  for (const execution of ordered) {
    const price = parseDecimal(execution.price);
    const quantity = parseDecimal(execution.quantity);

    if (execution.type === 'ENTRY') {
      runningEntryQuantity = runningEntryQuantity.plus(quantity);
      runningEntryNotional = runningEntryNotional.plus(price.times(quantity));
      runningEntryFees = runningEntryFees.plus(parseDecimal(execution.fee));
      continue;
    }

    const averageEntry = runningEntryNotional.dividedBy(runningEntryQuantity);
    const entryFeePerUnit = runningEntryFees.dividedBy(runningEntryQuantity);

    const gross =
      input.side === 'LONG'
        ? price.minus(averageEntry).times(quantity)
        : averageEntry.minus(price).times(quantity);

    const net = gross.minus(parseDecimal(execution.fee)).minus(entryFeePerUnit.times(quantity));

    // Quantise each slice to the persisted money scale, then accumulate, so the
    // stored parts always sum exactly to the stored whole.
    const slice = parseDecimal(quantise(net, MONEY_SCALE));
    realizedPnl = realizedPnl.plus(slice);

    realizedExecutions.push({
      executionId: execution.id,
      executedAt: execution.executedAt,
      quantity: quantise(quantity, QUANTITY_SCALE),
      averageEntryPrice: quantise(averageEntry, PRICE_SCALE),
      exitPrice: quantise(price, PRICE_SCALE),
      realizedPnl: quantise(slice, MONEY_SCALE),
      realizedPnlPct: quantise(slice.dividedBy(startingBalance), RATIO_SCALE),
      rMultiple: initialRisk === null ? null : quantise(slice.dividedBy(initialRisk), RATIO_SCALE),
    });
  }

  const isClosed = exitQuantity.equals(entryQuantity);

  // `entries` and `exits` preserve the sorted order, so the first entry is the
  // earliest and the last exit is the latest. A CLOSED position always has exits,
  // since every quantity is positive and at least one entry is required.
  return {
    status: isClosed ? 'CLOSED' : 'OPEN',
    openedAt: expectOne(entries, 'entry').executedAt,
    closedAt: isClosed ? expectOne(exits.slice(-1), 'exit').executedAt : null,
    entryQuantity: quantise(entryQuantity, QUANTITY_SCALE),
    exitQuantity: quantise(exitQuantity, QUANTITY_SCALE),
    openQuantity: quantise(entryQuantity.minus(exitQuantity), QUANTITY_SCALE),
    averageEntryPrice: quantise(weightedAverage(entries), PRICE_SCALE),
    averageExitPrice: exits.length === 0 ? null : quantise(weightedAverage(exits), PRICE_SCALE),
    initialRiskAmount: initialRisk === null ? null : quantise(initialRisk, MONEY_SCALE),
    initialRiskPct:
      initialRisk === null ? null : quantise(initialRisk.dividedBy(startingBalance), RATIO_SCALE),
    realizedPnl: quantise(realizedPnl, MONEY_SCALE),
    realizedPnlPct: quantise(realizedPnl.dividedBy(startingBalance), RATIO_SCALE),
    rMultiple:
      initialRisk === null ? null : quantise(realizedPnl.dividedBy(initialRisk), RATIO_SCALE),
    fees: quantise(sumFees(ordered), MONEY_SCALE),
    realizedExecutions,
  };
}

/**
 * Risk is anchored to the FIRST entry price so that adding to a position never
 * retroactively rewrites the risk of the original decision. Rules §7.
 */
function deriveInitialRisk(
  input: PositionInput,
  entries: readonly ExecutionInput[],
  entryQuantity: DecimalValue,
): DecimalValue | null {
  const firstEntry = entries[0];
  if (input.initialStopPrice === null || firstEntry === undefined) {
    return null;
  }
  const distance = parseDecimal(firstEntry.price).minus(parseDecimal(input.initialStopPrice)).abs();
  return distance.times(entryQuantity);
}

function weightedAverage(executions: readonly ExecutionInput[]): DecimalValue {
  const quantity = sumQuantities(executions);
  const notional = executions.reduce(
    (total, execution) =>
      total.plus(parseDecimal(execution.price).times(parseDecimal(execution.quantity))),
    ZERO,
  );
  return notional.dividedBy(quantity);
}

function sumQuantities(executions: readonly ExecutionInput[]): DecimalValue {
  return executions.reduce(
    (total, execution) => total.plus(parseDecimal(execution.quantity)),
    ZERO,
  );
}

function sumFees(executions: readonly ExecutionInput[]): DecimalValue {
  return executions.reduce((total, execution) => total.plus(parseDecimal(execution.fee)), ZERO);
}

/** Asserts an invariant that validation has already guaranteed. */
function expectOne(executions: readonly ExecutionInput[], label: string): ExecutionInput {
  const execution = executions[0];
  if (execution === undefined) {
    throw new Error(`Invariant violated: expected at least one ${label} after validation.`);
  }
  return execution;
}
