import { relations, sql } from 'drizzle-orm';
import { check, index, pgTable, text, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { EXECUTION_TYPES } from '@journal/contracts';
import {
  moneyColumn,
  notDeleted,
  oneOf,
  priceColumn,
  ratioColumn,
  timestampColumn,
} from './columns';
import { positions } from './positions';

/**
 * One executed fill. These are the only raw facts the journal stores, and they
 * are never destroyed — derived values are always rebuilt from them. Rules §12.
 *
 * `account_id`, `symbol` and `side` are deliberately absent: all three are
 * reachable through `position_id`, and `side` is a pure function of the
 * position's side and this row's type.
 *
 * The realized columns are populated on EXIT rows only. They exist because the
 * overview buckets PnL by the exit that realized it, so a partially closed
 * position reports in the period it actually earned. Rules §6.1 and §10.
 */
export const trades = pgTable(
  'trades',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    positionId: uuid('position_id')
      .notNull()
      .references(() => positions.id, { onDelete: 'cascade' }),

    // --- Raw facts -------------------------------------------------------
    type: varchar('type', { length: 10 }).notNull(),
    price: priceColumn('price').notNull(),
    quantity: priceColumn('quantity').notNull(),
    fee: moneyColumn('fee').notNull().default('0'),
    executedAt: timestampColumn('executed_at').notNull(),
    /** Set by future exchange imports; the key to idempotent re-imports. */
    externalTradeId: varchar('external_trade_id', { length: 200 }),
    notes: text('notes'),

    // --- Derived, EXIT rows only -----------------------------------------
    realizedPnl: moneyColumn('realized_pnl'),
    realizedPnlPct: ratioColumn('realized_pnl_pct'),
    rMultiple: ratioColumn('r_multiple'),
    /** Weighted-average entry price at the moment of this exit. */
    averageEntryPrice: priceColumn('average_entry_price'),

    deletedAt: timestampColumn('deleted_at'),
    createdAt: timestampColumn('created_at').notNull().defaultNow(),
    updatedAt: timestampColumn('updated_at').notNull().defaultNow(),
  },
  (table) => [
    index('trades_position_id_idx').on(table.positionId).where(notDeleted),
    index('trades_executed_at_idx').on(table.executedAt).where(notDeleted),
    index('trades_position_executed_at_idx')
      .on(table.positionId, table.executedAt)
      .where(notDeleted),
    // The overview scans exits by time, so give that query its own small index.
    index('trades_exit_executed_at_idx')
      .on(table.executedAt)
      .where(sql`type = 'EXIT' and deleted_at is null`),
    // Makes re-importing the same fill a no-op rather than a duplicate.
    uniqueIndex('trades_position_external_id_unique')
      .on(table.positionId, table.externalTradeId)
      .where(sql`external_trade_id is not null`),

    check('trades_type_check', oneOf(table.type, EXECUTION_TYPES)),
    check('trades_price_check', sql`${table.price} > 0`),
    check('trades_quantity_check', sql`${table.quantity} > 0`),
    check('trades_fee_check', sql`${table.fee} >= 0`),
    // Only exits realize PnL, and every exit realizes some.
    check(
      'trades_realized_pnl_check',
      sql`(${table.type} = 'EXIT') = (${table.realizedPnl} is not null)`,
    ),
  ],
);

export const tradesRelations = relations(trades, ({ one }) => ({
  position: one(positions, { fields: [trades.positionId], references: [positions.id] }),
}));

export type TradeRow = typeof trades.$inferSelect;
export type NewTradeRow = typeof trades.$inferInsert;
