/**
 * Domain types. Decimal values are always canonical decimal *strings* — never
 * JavaScript numbers. See docs/accounting-rules.md §1.
 */

export type PositionSide = 'LONG' | 'SHORT';
export type ExecutionType = 'ENTRY' | 'EXIT';
export type PositionStatus = 'OPEN' | 'CLOSED';
export type MarketType = 'SPOT' | 'PERPETUAL' | 'FUTURES';

/** One raw executed fill. The only kind of fact the journal stores. */
export interface ExecutionInput {
  readonly id: string;
  readonly type: ExecutionType;
  readonly price: string;
  readonly quantity: string;
  readonly fee: string;
  readonly executedAt: Date;
  /** Tie-break for executions sharing an `executedAt`. See rules §4. */
  readonly createdAt: Date;
}

export interface PositionInput {
  readonly side: PositionSide;
  /** The stop as it stood when the position was opened. Null if none was set. */
  readonly initialStopPrice: string | null;
  /** Denominator for every percentage on this position. See rules §8. */
  readonly accountStartingBalance: string;
  readonly executions: readonly ExecutionInput[];
}

/**
 * PnL realized by a single EXIT execution, against the cost basis as it stood
 * at that exit's timestamp. This is the primitive the overview buckets by.
 */
export interface RealizedExecution {
  readonly executionId: string;
  readonly executedAt: Date;
  readonly quantity: string;
  /** Weighted-average entry price at the moment of this exit. */
  readonly averageEntryPrice: string;
  readonly exitPrice: string;
  readonly realizedPnl: string;
  readonly realizedPnlPct: string;
  readonly rMultiple: string | null;
}

export interface PositionSnapshot {
  readonly status: PositionStatus;
  readonly openedAt: Date;
  readonly closedAt: Date | null;
  readonly entryQuantity: string;
  readonly exitQuantity: string;
  readonly openQuantity: string;
  readonly averageEntryPrice: string;
  readonly averageExitPrice: string | null;
  readonly initialRiskAmount: string | null;
  readonly initialRiskPct: string | null;
  readonly realizedPnl: string;
  readonly realizedPnlPct: string;
  readonly rMultiple: string | null;
  /** Total fees paid across every execution, entries included. */
  readonly fees: string;
  readonly realizedExecutions: readonly RealizedExecution[];
}

export type ValidationCode =
  | 'INVALID_DECIMAL'
  | 'NO_EXECUTIONS'
  | 'NO_ENTRY'
  | 'NON_POSITIVE_PRICE'
  | 'NON_POSITIVE_QUANTITY'
  | 'NEGATIVE_FEE'
  | 'EXIT_BEFORE_ENTRY'
  | 'EXIT_EXCEEDS_ENTRY'
  | 'STOP_ON_WRONG_SIDE'
  | 'NON_POSITIVE_STARTING_BALANCE';

export interface ValidationIssue {
  readonly code: ValidationCode;
  readonly message: string;
  /** The offending execution, when the issue is attributable to one. */
  readonly executionId: string | null;
}

export type ReconstructResult =
  | { readonly ok: true; readonly position: PositionSnapshot }
  | { readonly ok: false; readonly issues: readonly ValidationIssue[] };

// --- Reporting -------------------------------------------------------------

export type Period = 'DAY' | 'WEEK' | 'MONTH';

/** The minimum an item needs to be bucketed and summarised. */
export interface RealizedEvent {
  readonly positionId: string;
  readonly executedAt: Date;
  readonly realizedPnl: string;
  readonly rMultiple: string | null;
}

export interface PeriodSummary {
  /** Number of realized events (exit executions), not positions. */
  readonly events: number;
  /** Distinct positions represented, so `events` cannot be misread. */
  readonly positions: number;
  readonly winners: number;
  readonly losers: number;
  /** Realized exactly zero — neither a win nor a loss. */
  readonly scratches: number;
  /** winners / (winners + losers). Null when there are no decided events. */
  readonly winRate: string | null;
  readonly realizedPnl: string;
  /** Sums only events that have an R. Null when none do. */
  readonly totalR: string | null;
  readonly averageR: string | null;
}

export interface PeriodGroup<TItem extends RealizedEvent> {
  /** `2026-08-15` (day), `2026-W33` (ISO week), or `2026-08` (month). */
  readonly key: string;
  readonly period: Period;
  /** UTC instant at which this local period begins. */
  readonly startsAt: Date;
  /** UTC instant at which this local period ends, exclusive. */
  readonly endsAt: Date;
  readonly summary: PeriodSummary;
  readonly items: readonly TItem[];
}
