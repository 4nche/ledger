import { z } from 'zod';
import { executionTypeSchema, marketTypeSchema, positionSideSchema } from './enums.js';
import {
  feeString,
  instant,
  nullableText,
  optionalText,
  priceString,
  quantityString,
  text,
  uuidString,
} from './primitives.js';

/**
 * Field shapes are declared *without* defaults, and defaults are added only on
 * the create schemas.
 *
 * This matters: Zod's `.partial()` does not strip a `.default()`, so deriving a
 * patch schema from a defaulted create schema silently reapplies every default
 * to fields the caller never mentioned — a PATCH changing one field would reset
 * the rest. Building patch schemas from the undefaulted fields avoids it.
 */
const tradeFields = {
  type: executionTypeSchema,
  price: priceString,
  quantity: quantityString,
  fee: feeString,
  executedAt: instant,
  externalTradeId: nullableText(200),
  notes: nullableText(2000),
};

/** One executed fill submitted with a position. */
export const tradeInputSchema = z.object({
  ...tradeFields,
  fee: feeString.default('0'),
  externalTradeId: optionalText(200),
  notes: optionalText(2000),
});

const symbolSchema = text('Symbol', 40).toUpperCase();

const positionFields = {
  symbol: symbolSchema,
  marketType: marketTypeSchema,
  side: positionSideSchema,
  initialStopPrice: priceString.nullable(),
  notes: nullableText(5000),
  trades: z.array(tradeInputSchema).min(1, { error: 'A position needs at least one execution.' }),
};

/**
 * The client submits raw executions only. Every derived value — averages,
 * realized PnL, R, status, timestamps — is computed server-side and any
 * derived value in the request body is ignored.
 */
export const createPositionSchema = z.object({
  accountId: uuidString,
  ...positionFields,
  marketType: marketTypeSchema.default('PERPETUAL'),
  initialStopPrice: priceString.nullable().default(null),
  notes: optionalText(5000),
});

/**
 * Supplying `trades` replaces the whole execution set, so the position is
 * always rebuilt from a complete picture rather than patched incrementally.
 * Omitting a field leaves it untouched.
 */
export const updatePositionSchema = z.object(positionFields).partial();

export const addTradeSchema = tradeInputSchema;

/** Omitted fields keep their stored value — no default is reapplied. */
export const updateTradeSchema = z.object(tradeFields).partial();

export type TradeInput = z.infer<typeof tradeInputSchema>;
export type UpdateTradeInput = z.infer<typeof updateTradeSchema>;
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
