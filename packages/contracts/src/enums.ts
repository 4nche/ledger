import { z } from 'zod';

/**
 * Stored as text with a CHECK constraint rather than a PostgreSQL enum type,
 * because this list will grow as integrations are added and altering a native
 * enum is far more painful than editing a constraint.
 */
export const PROVIDERS = [
  'MANUAL',
  'FTMO',
  'THE5ERS',
  'BYBIT',
  'BINANCE',
  'HYPERLIQUID',
  'OTHER',
] as const;

export const ACCOUNT_TYPES = ['PERSONAL', 'PROP_CHALLENGE', 'PROP_FUNDED', 'PAPER'] as const;

/** v1 supports linear contracts only. See docs/accounting-rules.md §11. */
export const MARKET_TYPES = ['SPOT', 'PERPETUAL', 'FUTURES'] as const;

export const POSITION_SIDES = ['LONG', 'SHORT'] as const;
export const POSITION_STATUSES = ['OPEN', 'CLOSED'] as const;
export const EXECUTION_TYPES = ['ENTRY', 'EXIT'] as const;
export const PERIODS = ['DAY', 'WEEK', 'MONTH'] as const;

export const providerSchema = z.enum(PROVIDERS);
export const accountTypeSchema = z.enum(ACCOUNT_TYPES);
export const marketTypeSchema = z.enum(MARKET_TYPES);
export const positionSideSchema = z.enum(POSITION_SIDES);
export const positionStatusSchema = z.enum(POSITION_STATUSES);
export const executionTypeSchema = z.enum(EXECUTION_TYPES);
export const periodSchema = z.enum(PERIODS);

export type Provider = (typeof PROVIDERS)[number];
export type AccountType = (typeof ACCOUNT_TYPES)[number];
