import { defineConfig } from 'drizzle-kit';

// Generates SQL migrations from src/schema.ts. Row-level security lives in hand-written
// migrations next to them, so it can be read and reviewed as SQL.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema.ts',
  out: './migrations',
});
