import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    setupFiles: ['./vitest.setup.ts'],
    // Integration tests share one PostgreSQL database, so they must not
    // interleave writes.
    fileParallelism: false,
  },
});
