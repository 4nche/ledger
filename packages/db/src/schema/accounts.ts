import { relations, sql } from 'drizzle-orm';
import { boolean, check, index, pgTable, uuid, varchar } from 'drizzle-orm/pg-core';
import { ACCOUNT_TYPES, PROVIDERS } from '@journal/contracts';
import { moneyColumn, oneOf, timestampColumn } from './columns';
import { users } from './users';
import { positions } from './positions';

/**
 * An account belongs to exactly one trader, which is why positions carry no
 * trader of their own — the two can never disagree. Rules §2.
 *
 * There is no `current_balance` in v1: a hand-maintained balance drifts, and
 * every percentage is taken against `starting_balance` instead. Rules §8.
 */
export const accounts = pgTable(
  'accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    name: varchar('name', { length: 120 }).notNull(),
    provider: varchar('provider', { length: 20 }).notNull(),
    accountType: varchar('account_type', { length: 20 }).notNull(),
    currency: varchar('currency', { length: 3 }).notNull(),
    startingBalance: moneyColumn('starting_balance').notNull(),
    externalAccountId: varchar('external_account_id', { length: 200 }),
    isActive: boolean('is_active').notNull().default(true),
    deletedAt: timestampColumn('deleted_at'),
    createdAt: timestampColumn('created_at').notNull().defaultNow(),
    updatedAt: timestampColumn('updated_at').notNull().defaultNow(),
  },
  (table) => [
    index('accounts_user_id_idx').on(table.userId),
    check('accounts_provider_check', oneOf(table.provider, PROVIDERS)),
    check('accounts_account_type_check', oneOf(table.accountType, ACCOUNT_TYPES)),
    check('accounts_currency_check', sql`${table.currency} ~ '^[A-Z]{3}$'`),
    // Every percentage divides by this, so zero would be a division by zero.
    check('accounts_starting_balance_check', sql`${table.startingBalance} > 0`),
  ],
);

export const accountsRelations = relations(accounts, ({ one, many }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
  positions: many(positions),
}));

export type AccountRow = typeof accounts.$inferSelect;
export type NewAccountRow = typeof accounts.$inferInsert;
