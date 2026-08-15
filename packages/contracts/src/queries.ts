import { z } from 'zod';
import { positionSideSchema, positionStatusSchema } from './enums';
import { calendarDate, timeZoneString, uuidString } from './primitives';

/**
 * The product's default reporting timezone. Declared here so it is visible and
 * overridable, never inferred from the server's own clock. The domain layer
 * has no default at all — it always demands an explicit zone.
 */
export const DEFAULT_REPORTING_TIME_ZONE = 'Europe/Amsterdam';

/**
 * `from`/`to` are inclusive calendar dates interpreted in `timeZone`, so the
 * range a trader picks means the same thing as the buckets they see.
 */
export const positionFiltersSchema = z.object({
  accountId: uuidString.optional(),
  traderId: uuidString.optional(),
  symbol: z.string().trim().toUpperCase().min(1).max(40).optional(),
  side: positionSideSchema.optional(),
  status: positionStatusSchema.optional(),
  from: calendarDate.optional(),
  to: calendarDate.optional(),
  timeZone: timeZoneString.default(DEFAULT_REPORTING_TIME_ZONE),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export const listPositionsQuerySchema = positionFiltersSchema
  .extend(paginationSchema.shape)
  .refine((query) => query.from === undefined || query.to === undefined || query.from <= query.to, {
    error: '`from` must not be after `to`.',
    path: ['from'],
  });

export type PositionFilters = z.infer<typeof positionFiltersSchema>;
export type ListPositionsQuery = z.infer<typeof listPositionsQuerySchema>;
