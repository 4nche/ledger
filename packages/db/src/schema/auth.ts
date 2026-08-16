import { relations } from 'drizzle-orm';
import { index, pgTable, text, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { timestampColumn } from './columns';
import { users } from './users';

/**
 * Tables owned by Better Auth.
 *
 * Prefixed `auth_` because Better Auth's default name for OAuth provider links
 * is `account`, which sits one letter away from `accounts` — the trading
 * accounts this whole application is about. Two tables that different by name
 * and that different by meaning is a bug waiting to happen.
 *
 * Better Auth's `user` model maps onto the existing `users` table instead of a
 * table of its own, so a signed-in trader is the same row `accounts.user_id`
 * has always pointed at.
 */

export const authSessions = pgTable(
  'auth_session',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    token: text('token').notNull(),
    expiresAt: timestampColumn('expires_at').notNull(),
    ipAddress: varchar('ip_address', { length: 64 }),
    userAgent: text('user_agent'),
    createdAt: timestampColumn('created_at').notNull().defaultNow(),
    updatedAt: timestampColumn('updated_at').notNull().defaultNow(),
  },
  (table) => [
    // Every authenticated request looks a session up by token, so this index is
    // on the hot path rather than a nicety.
    uniqueIndex('auth_session_token_unique').on(table.token),
    index('auth_session_user_id_idx').on(table.userId),
    index('auth_session_expires_at_idx').on(table.expiresAt),
  ],
);

export const authAccounts = pgTable(
  'auth_account',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** The provider's own identifier for this user, e.g. the Google `sub`. */
    accountId: text('account_id').notNull(),
    providerId: varchar('provider_id', { length: 64 }).notNull(),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestampColumn('access_token_expires_at'),
    refreshTokenExpiresAt: timestampColumn('refresh_token_expires_at'),
    scope: text('scope'),
    /** Unused: this application has no password sign-in, only Google. */
    password: text('password'),
    createdAt: timestampColumn('created_at').notNull().defaultNow(),
    updatedAt: timestampColumn('updated_at').notNull().defaultNow(),
  },
  (table) => [
    // One link per provider identity, so a repeated sign-in updates rather than
    // duplicates.
    uniqueIndex('auth_account_provider_unique').on(table.providerId, table.accountId),
    index('auth_account_user_id_idx').on(table.userId),
  ],
);

export const authVerifications = pgTable(
  'auth_verification',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestampColumn('expires_at').notNull(),
    createdAt: timestampColumn('created_at').notNull().defaultNow(),
    updatedAt: timestampColumn('updated_at').notNull().defaultNow(),
  },
  (table) => [index('auth_verification_identifier_idx').on(table.identifier)],
);

export const authSessionsRelations = relations(authSessions, ({ one }) => ({
  user: one(users, { fields: [authSessions.userId], references: [users.id] }),
}));

export const authAccountsRelations = relations(authAccounts, ({ one }) => ({
  user: one(users, { fields: [authAccounts.userId], references: [users.id] }),
}));

export type AuthSessionRow = typeof authSessions.$inferSelect;
export type AuthAccountRow = typeof authAccounts.$inferSelect;

/** Re-exported under Better Auth's model names for the Drizzle adapter. */
export const authSchema = {
  session: authSessions,
  account: authAccounts,
  verification: authVerifications,
} as const;
