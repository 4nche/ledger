import { z } from 'zod';
import { periodSchema } from './enums';
import { positionFiltersSchema } from './queries';

/**
 * The overview returns the *whole* filtered range, grouped and summarised
 * server-side. It is deliberately not paginated: a group total computed from
 * one page of a range that spans several pages would simply be wrong.
 */
export const overviewQuerySchema = positionFiltersSchema
  .extend({ period: periodSchema.default('DAY') })
  .refine((query) => query.from === undefined || query.to === undefined || query.from <= query.to, {
    error: '`from` must not be after `to`.',
    path: ['from'],
  });

export type OverviewQuery = z.infer<typeof overviewQuerySchema>;

/**
 * One row in a period table: PnL realized by a single exit, not a whole
 * position. See docs/accounting-rules.md §10.
 */
export interface RealizedEventResponse {
  readonly tradeId: string;
  readonly positionId: string;
  readonly executedAt: string;
  readonly symbol: string;
  readonly side: 'LONG' | 'SHORT';
  readonly accountId: string;
  readonly accountName: string;
  readonly traderId: string;
  readonly traderName: string;
  readonly quantity: string;
  readonly averageEntryPrice: string;
  readonly exitPrice: string;
  readonly realizedPnl: string;
  readonly realizedPnlPct: string;
  readonly rMultiple: string | null;
  /** Seconds from the position opening to this exit. */
  readonly holdingSeconds: number;
  /** True when this exit closed the position outright. */
  readonly closesPosition: boolean;
}

export interface PeriodSummaryResponse {
  readonly events: number;
  readonly positions: number;
  readonly winners: number;
  readonly losers: number;
  readonly scratches: number;
  readonly winRate: string | null;
  readonly realizedPnl: string;
  readonly totalR: string | null;
  readonly averageR: string | null;
}

export interface PeriodGroupResponse {
  readonly key: string;
  readonly period: 'DAY' | 'WEEK' | 'MONTH';
  readonly startsAt: string;
  readonly endsAt: string;
  readonly summary: PeriodSummaryResponse;
  readonly items: readonly RealizedEventResponse[];
}

export interface OverviewResponse {
  readonly period: 'DAY' | 'WEEK' | 'MONTH';
  readonly timeZone: string;
  readonly groups: readonly PeriodGroupResponse[];
  readonly totals: PeriodSummaryResponse;
  /**
   * Return as a fraction of account starting balance. Null whenever the filter
   * spans more than one account, because there is then no single denominator.
   * See docs/accounting-rules.md §8.
   */
  readonly returnPct: string | null;
}
