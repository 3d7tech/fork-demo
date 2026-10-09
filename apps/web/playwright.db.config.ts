import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// Company setup end to end, with a real database (ADR 0007): sign-in by emailed link, setup,
// payroll import, invites, and an employee asking a question. Models are in demo mode.
const PORT = 3101;
const db = (user: string, pw: string) => `postgres://${user}:${pw}@127.0.0.1:5433/fork_e2e`;

export default defineConfig({
  ...base,
  testDir: './e2e-db',
  timeout: 60_000,
  workers: 1,
  globalSetup: './e2e-db/global-setup.ts',
  use: { ...base.use, baseURL: `http://localhost:${PORT}`, locale: 'en-GB' },
  projects: [{ name: 'light', use: { browserName: 'chromium', colorScheme: 'light' } }],
  webServer: {
    command: `pnpm exec next start -p ${PORT}`,
    url: `http://localhost:${PORT}/signin`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      FORK_ANTHROPIC_API_KEY: process.env.FORK_E2E_LIVE ? (process.env.FORK_ANTHROPIC_API_KEY ?? '') : '',
      ANTHROPIC_API_KEY: '',
      FORK_DATABASE_APP_URL: db('fork_app', 'fork_app_dev'),
      FORK_DATABASE_AUTH_URL: db('fork_auth', 'fork_auth_dev'),
      FORK_DEV_OUTBOX: '1',
      FORK_INSECURE_COOKIES: '1',
      FORK_FILES_DIR: '../../.data/e2e-files',
    },
  },
});
