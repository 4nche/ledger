import { relations } from 'drizzle-orm';
import { boolean, pgTable, text, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { timestampColumn } from './columns';
import { accounts } from './accounts';

/**
 * Traders are modelled from day one even though v1 has no authentication, so
 * that ownership never has to be back-filled. See docs/accounting-rules.md §2.
 */
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 120 }).notNull(),
    email: varchar('email', { length: 255 }).notNull(),
    // Required by Better Auth's user model. Google verifies the address before
    // it ever reaches us, so this is true for every row it creates.
    emailVerified: boolean('email_verified').notNull().default(false),
    image: text('image'),
    createdAt: timestampColumn('created_at').notNull().defaultNow(),
    updatedAt: timestampColumn('updated_at').notNull().defaultNow(),
  },
  (table) => [uniqueIndex('users_email_unique').on(table.email)],
);

export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
}));

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
