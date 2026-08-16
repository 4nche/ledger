import { instantFromLocalDateTime, type ExecutionInput, type PositionSide } from '@journal/domain';
import type { AccountResponse, PositionDetailResponse } from '@journal/contracts';

/**
 * The shape of the position form, and the translation between it and the
 * domain's executions.
 *
 * Kept apart from the component so the assembly rules — which decide what
 * actually gets stored — can be read without wading through JSX.
 */

export const DECIMAL_PATTERN = /^\d+(\.\d+)?$/;

export interface ExecutionRow {
  price: string;
  quantity: string;
  fee: string;
  executedAt: string;
}

export interface PositionFormValues {
  accountId: string;
  symbol: string;
  side: PositionSide;
  initialStopPrice: string;
  notes: string;
  entries: ExecutionRow[];
  exits: ExecutionRow[];
}

export function emptyRow(): ExecutionRow {
  return { price: '', quantity: '', fee: '', executedAt: '' };
}

export function emptyToUndefined(value: string): string | undefined {
  return value.trim() === '' ? undefined : value.trim();
}

function isComplete(row: ExecutionRow): boolean {
  const price = emptyToUndefined(row.price);
  const quantity = emptyToUndefined(row.quantity);
  return (
    price !== undefined &&
    quantity !== undefined &&
    emptyToUndefined(row.executedAt) !== undefined &&
    DECIMAL_PATTERN.test(price) &&
    DECIMAL_PATTERN.test(quantity)
  );
}

/**
 * Builds domain executions from the form, or null when it is not yet complete
 * enough to describe anything.
 *
 * Half-typed rows are skipped rather than treated as errors: a trader adding a
 * third exit should keep seeing the preview for the two that are finished, not
 * watch it blank out until they finish typing.
 */
export function buildExecutions(
  values: PositionFormValues,
  timeZone: string,
): ExecutionInput[] | null {
  const rows = [
    ...values.entries.map((row) => ({ row, type: 'ENTRY' as const })),
    ...values.exits.map((row) => ({ row, type: 'EXIT' as const })),
  ].filter(({ row }) => isComplete(row));

  // Without a single complete entry there is no position to describe.
  if (!rows.some(({ type }) => type === 'ENTRY')) {
    return null;
  }

  try {
    return rows.map(({ row, type }, index) => ({
      id: `row-${index}`,
      type,
      price: row.price.trim(),
      quantity: row.quantity.trim(),
      fee: emptyToUndefined(row.fee) ?? '0',
      executedAt: instantFromLocalDateTime(row.executedAt, timeZone),
      // Only breaks ties between executions sharing a timestamp; the domain
      // sorts by time first.
      createdAt: new Date(index),
    }));
  } catch {
    // A half-typed date is normal while the form is being filled in.
    return null;
  }
}

/** The same executions, shaped for the API. */
export function buildTrades(
  values: PositionFormValues,
  timeZone: string,
): Array<Record<string, string>> | null {
  const executions = buildExecutions(values, timeZone);
  if (executions === null) return null;

  return executions.map((execution) => ({
    type: execution.type,
    price: execution.price,
    quantity: execution.quantity,
    fee: execution.fee,
    executedAt: execution.executedAt.toISOString(),
  }));
}

/** Renders an instant as the wall-clock value a datetime-local input expects. */
function toLocalInput(iso: string, timeZone: string): string {
  const formatted = new Intl.DateTimeFormat('sv-SE', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
  return formatted.replace(' ', 'T');
}

export function buildDefaults(
  existing: PositionDetailResponse | undefined,
  accounts: readonly AccountResponse[],
  timeZone: string,
): PositionFormValues {
  if (existing === undefined) {
    return {
      accountId: accounts[0]?.id ?? '',
      symbol: '',
      side: 'LONG',
      initialStopPrice: '',
      notes: '',
      entries: [emptyRow()],
      exits: [emptyRow()],
    };
  }

  const toRow = (trade: PositionDetailResponse['trades'][number]): ExecutionRow => ({
    price: trade.price,
    quantity: trade.quantity,
    fee: trade.fee,
    executedAt: toLocalInput(trade.executedAt, timeZone),
  });

  const entries = existing.trades.filter((trade) => trade.type === 'ENTRY').map(toRow);
  const exits = existing.trades.filter((trade) => trade.type === 'EXIT').map(toRow);

  return {
    accountId: existing.accountId,
    symbol: existing.symbol,
    side: existing.side,
    initialStopPrice: existing.initialStopPrice ?? '',
    notes: existing.notes ?? '',
    entries: entries.length > 0 ? entries : [emptyRow()],
    exits,
  };
}
