import { sql, type SQL } from 'drizzle-orm';
import { type AnyPgColumn, numeric, timestamp } from 'drizzle-orm/pg-core';

/**
 * Column shapes shared across tables, so a scale is never chosen ad hoc.
 * The scales match docs/accounting-rules.md §1 and the domain package.
 */

/** Prices and quantities: NUMERIC(30, 12). */
export function priceColumn(name: string) {
  return numeric(name, { precision: 30, scale: 12 });
}

/** Money — PnL, fees, risk, balances: NUMERIC(24, 8). */
export function moneyColumn(name: string) {
  return numeric(name, { precision: 24, scale: 8 });
}

/** Ratios — percentages and R multiples: NUMERIC(16, 8). */
export function ratioColumn(name: string) {
  return numeric(name, { precision: 16, scale: 8 });
}

export function timestampColumn(name: string) {
  return timestamp(name, { withTimezone: true, mode: 'date' });
}

/**
 * Renders `column in ('A', 'B', …)` for a CHECK constraint.
 *
 * Enums are stored as text with a CHECK rather than a native PostgreSQL enum:
 * the provider list will grow as integrations land, and editing a constraint
 * is far less disruptive than altering an enum type in place.
 */
export function oneOf(column: AnyPgColumn, values: readonly string[]): SQL {
  // Must be inlined literals: a CHECK constraint is DDL, and DDL cannot carry
  // bind parameters. Interpolating the values normally would emit `$1, $2, …`
  // and the migration would fail to apply.
  const literals = values.map((value) => `'${value.replaceAll("'", "''")}'`).join(', ');
  return sql`${column} in ${sql.raw(`(${literals})`)}`;
}

/** Rows are soft deleted; every index and query filters on this being null. */
export const notDeleted = sql`deleted_at is null`;
