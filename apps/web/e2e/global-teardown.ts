import { createDatabase, positions, readConnectionString, trades, users } from '@journal/db';
import { eq, inArray, like } from 'drizzle-orm';

/**
 * Removes everything the run created.
 *
 * The trader is not enough: the tests save positions against a real account, so
 * without this they accumulate in the journal and show up in real totals. Test
 * symbols are prefixed `E2E` precisely so they can be identified and removed.
 */
export default async function globalTeardown(): Promise<void> {
  const db = createDatabase({ connectionString: readConnectionString(), maxConnections: 1 });

  try {
    const created = await db
      .select({ id: positions.id })
      .from(positions)
      .where(like(positions.symbol, 'E2E%'));

    if (created.length > 0) {
      const ids = created.map((row) => row.id);
      await db.delete(trades).where(inArray(trades.positionId, ids));
      await db.delete(positions).where(inArray(positions.id, ids));
    }

    const userId = process.env['E2E_USER_ID'];
    if (userId !== undefined) {
      await db.delete(users).where(eq(users.id, userId));
    }
  } finally {
    await db.closeConnection();
  }
}
