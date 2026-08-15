import { z } from 'zod';
import { executionTypeSchema, marketTypeSchema, positionSideSchema } from './enums.js';
import {
  feeString,
  instant,
  optionalText,
  priceString,
  quantityString,
  text,
  uuidString,
} from './primitives.js';

/** One executed fill submitted with a position. */
export const tradeInputSchema = z.object({
  type: executionTypeSchema,
  price: priceString,
  quantity: quantityString,
  fee: feeString.default('0'),
  executedAt: instant,
  externalTradeId: optionalText(200),
  notes: optionalText(2000),
});

const symbolSchema = text('Symbol', 40).toUpperCase();

/**
 * The client submits raw executions only. Every derived value — averages,
 * realized PnL, R, status, timestamps — is computed server-side and any
 * derived value in the request body is ignored.
 */
export const createPositionSchema = z.object({
  accountId: uuidString,
  symbol: symbolSchema,
  marketType: marketTypeSchema.default('PERPETUAL'),
  side: positionSideSchema,
  initialStopPrice: priceString.nullable().default(null),
  notes: optionalText(5000),
  trades: z.array(tradeInputSchema).min(1, { error: 'A position needs at least one execution.' }),
});

/**
 * Editing replaces the full execution set, so the position is always rebuilt
 * from a complete picture rather than patched incrementally.
 */
export const updatePositionSchema = createPositionSchema.omit({ accountId: true }).partial();

export const addTradeSchema = tradeInputSchema;

export const updateTradeSchema = tradeInputSchema.partial();

export type TradeInput = z.infer<typeof tradeInputSchema>;
export type CreatePositionInput = z.infer<typeof createPositionSchema>;
export type UpdatePositionInput = z.infer<typeof updatePositionSchema>;

export interface TradeResponse {
  readonly id: string;
  readonly positionId: string;
  readonly type: 'ENTRY' | 'EXIT';
  readonly price: string;
  readonly quantity: string;
  readonly fee: string;
  readonly executedAt: string;
  readonly externalTradeId: string | null;
  readonly notes: string | null;
  /** Null on entries — only exits realize PnL. */
  readonly realizedPnl: string | null;
  readonly realizedPnlPct: string | null;
  readonly rMultiple: string | null;
  /** Weighted-average entry price at the moment of this exit. Null on entries. */
  readonly averageEntryPrice: string | null;
}

export interface PositionResponse {
  readonly id: string;
  readonly accountId: string;
  readonly accountName: string;
  readonly traderId: string;
  readonly traderName: string;
  readonly symbol: string;
  readonly marketType: string;
  readonly side: 'LONG' | 'SHORT';
  readonly status: 'OPEN' | 'CLOSED';
  readonly openedAt: string;
  readonly closedAt: string | null;
  readonly entryQuantity: string;
  readonly exitQuantity: string;
  readonly openQuantity: string;
  readonly averageEntryPrice: string;
  readonly averageExitPrice: string | null;
  readonly initialStopPrice: string | null;
  readonly initialRiskAmount: string | null;
  readonly initialRiskPct: string | null;
  readonly realizedPnl: string;
  readonly realizedPnlPct: string;
  readonly rMultiple: string | null;
  readonly fees: string;
  readonly notes: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PositionDetailResponse extends PositionResponse {
  readonly trades: readonly TradeResponse[];
}
