import { createDatabase, readConnectionString, users } from '@journal/db';
import { eq } from 'drizzle-orm';

/** Removes the test trader; the session cascades with it. */
export default async function globalTeardown(): Promise<void> {
  const userId = process.env['E2E_USER_ID'];
  if (userId === undefined) return;

  const db = createDatabase({ connectionString: readConnectionString(), maxConnections: 1 });
  try {
    await db.delete(users).where(eq(users.id, userId));
  } finally {
    await db.closeConnection();
  }
}
