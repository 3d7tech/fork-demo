import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts'],
    // Starts the local PostgreSQL cluster and builds the migrated template database (ADR 0007).
    globalSetup: ['packages/db/test/global-setup.ts'],
  },
});
