import { randomUUID } from 'node:crypto';
import { authSessions, createDatabase, readConnectionString, users } from '@journal/db';
import { eq } from 'drizzle-orm';

/**
 * Creates the session the browser tests run as.
 *
 * Google's consent screen cannot be driven from a test, so the session is
 * created directly and presented as a bearer token — the same mechanism a
 * mobile app or importer would use. No test-only bypass is added to the server,
 * and the tests exercise the real authentication path.
 */
export default async function globalSetup(): Promise<void> {
  const token = process.env['E2E_BEARER'];
  const userId = process.env['E2E_USER_ID'];

  if (token === undefined || userId === undefined) {
    throw new Error('E2E_BEARER and E2E_USER_ID must be set by the Playwright config.');
  }

  const db = createDatabase({ connectionString: readConnectionString(), maxConnections: 1 });

  try {
    await db.delete(users).where(eq(users.id, userId));
    await db.insert(users).values({
      id: userId,
      name: 'E2E Trader',
      email: `e2e-${userId}@example.test`,
      emailVerified: true,
    });
    await db.insert(authSessions).values({
      id: randomUUID(),
      userId,
      token,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
  } finally {
    await db.closeConnection();
  }
}
