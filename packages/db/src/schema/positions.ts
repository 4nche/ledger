import { relations, sql } from 'drizzle-orm';
import { check, index, pgTable, text, uuid, varchar } from 'drizzle-orm/pg-core';
import { MARKET_TYPES, POSITION_SIDES, POSITION_STATUSES } from '@journal/contracts';
import {
  moneyColumn,
  notDeleted,
  oneOf,
  priceColumn,
  ratioColumn,
  timestampColumn,
} from './columns';
import { accounts } from './accounts';
import { trades } from './trades';

/**
 * A position is the whole trading idea. Everything below `initial_stop_price`
 * is *derived* from the child trades and is rewritten only by
 * `recalculatePosition`, inside a transaction. Rules §12.
 *
 * Note the quantity vocabulary: `entry_quantity` is the total ever entered and
 * `exit_quantity` the total ever exited — not "currently open". `open_quantity`
 * is generated from the two so it can never drift. Rules §3.
 */
export const positions = pgTable(
  'positions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),

    // --- Raw facts -------------------------------------------------------
    symbol: varchar('symbol', { length: 40 }).notNull(),
    marketType: varchar('market_type', { length: 20 }).notNull(),
    side: varchar('side', { length: 10 }).notNull(),
    /** Never overwritten when a trader later moves their stop. Rules §7. */
    initialStopPrice: priceColumn('initial_stop_price'),
    notes: text('notes'),

    // --- Derived ---------------------------------------------------------
    status: varchar('status', { length: 10 }).notNull(),
    openedAt: timestampColumn('opened_at').notNull(),
    closedAt: timestampColumn('closed_at'),
    entryQuantity: priceColumn('entry_quantity').notNull(),
    exitQuantity: priceColumn('exit_quantity').notNull(),
    openQuantity: priceColumn('open_quantity').generatedAlwaysAs(
      sql`entry_quantity - exit_quantity`,
    ),
    averageEntryPrice: priceColumn('average_entry_price').notNull(),
    averageExitPrice: priceColumn('average_exit_price'),
    initialRiskAmount: moneyColumn('initial_risk_amount'),
    initialRiskPct: ratioColumn('initial_risk_pct'),
    realizedPnl: moneyColumn('realized_pnl').notNull(),
    realizedPnlPct: ratioColumn('realized_pnl_pct').notNull(),
    rMultiple: ratioColumn('r_multiple'),
    fees: moneyColumn('fees').notNull(),

    deletedAt: timestampColumn('deleted_at'),
    createdAt: timestampColumn('created_at').notNull().defaultNow(),
    updatedAt: timestampColumn('updated_at').notNull().defaultNow(),
  },
  (table) => [
    index('positions_account_id_idx').on(table.accountId).where(notDeleted),
    index('positions_symbol_idx').on(table.symbol).where(notDeleted),
    index('positions_opened_at_idx').on(table.openedAt).where(notDeleted),
    index('positions_closed_at_idx').on(table.closedAt).where(notDeleted),
    index('positions_account_opened_at_idx').on(table.accountId, table.openedAt).where(notDeleted),
    index('positions_account_closed_at_idx').on(table.accountId, table.closedAt).where(notDeleted),
    index('positions_symbol_closed_at_idx').on(table.symbol, table.closedAt).where(notDeleted),
    // Drives the Open Positions section, which is small and queried on its own.
    index('positions_open_idx')
      .on(table.accountId)
      .where(sql`status = 'OPEN' and deleted_at is null`),

    check('positions_market_type_check', oneOf(table.marketType, MARKET_TYPES)),
    check('positions_side_check', oneOf(table.side, POSITION_SIDES)),
    check('positions_status_check', oneOf(table.status, POSITION_STATUSES)),
    check('positions_entry_quantity_check', sql`${table.entryQuantity} >= 0`),
    check('positions_exit_quantity_check', sql`${table.exitQuantity} >= 0`),
    check(
      'positions_exit_not_over_entry_check',
      sql`${table.exitQuantity} <= ${table.entryQuantity}`,
    ),
    check(
      'positions_initial_stop_check',
      sql`${table.initialStopPrice} is null or ${table.initialStopPrice} > 0`,
    ),
    // A closed position has a close time and no remaining quantity — and an
    // open one has neither. Stated as equivalences so neither half can drift.
    check(
      'positions_closed_at_check',
      sql`(${table.status} = 'CLOSED') = (${table.closedAt} is not null)`,
    ),
    check(
      'positions_closed_quantity_check',
      sql`${table.status} <> 'CLOSED' or ${table.exitQuantity} = ${table.entryQuantity}`,
    ),
    // R exists exactly when a stop was recorded — null R is never coerced to 0R.
    check(
      'positions_r_multiple_check',
      sql`(${table.initialRiskAmount} is not null) = (${table.rMultiple} is not null)`,
    ),
  ],
);

export const positionsRelations = relations(positions, ({ one, many }) => ({
  account: one(accounts, { fields: [positions.accountId], references: [accounts.id] }),
  trades: many(trades),
}));

export type PositionRow = typeof positions.$inferSelect;
export type NewPositionRow = typeof positions.$inferInsert;
