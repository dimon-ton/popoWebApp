import { defineConfig, devices } from '@playwright/test';
import fs from 'fs';
import path from 'path';

// Playwright does not load .env automatically. Keep shell-provided values as
// the priority, while making the documented local test configuration work.
const envFile = path.join(__dirname, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (match && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2].replace(/^(["'])(.*)\1$/, '$2');
    }
  }
}

export default defineConfig({
  testDir: './tests',
  retries: 1,
  workers: 1,
  timeout: 60_000,
  use: {
    baseURL: process.env.WEB_APP_URL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'tests/.auth/auth.json',
      },
      dependencies: ['setup'],
    },
  ],
});
