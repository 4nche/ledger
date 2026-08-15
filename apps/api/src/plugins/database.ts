import { createDatabase, type Database } from '@journal/db';
import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';

declare module 'fastify' {
  interface FastifyInstance {
    db: Database;
  }
}

export interface DatabasePluginOptions {
  readonly connectionString: string;
}

export const databasePlugin = fp(async function databasePlugin(
  app: FastifyInstance,
  options: DatabasePluginOptions,
) {
  const db = createDatabase({ connectionString: options.connectionString });
  app.decorate('db', db);
  app.addHook('onClose', async () => {
    await db.closeConnection();
  });
});
