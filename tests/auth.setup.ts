/**
 * US-021: Playwright auth bootstrap
 *
 * Run once: pnpm playwright test --project=setup
 * Then follow the browser prompt to log in (and complete Google "authorize script" consent if prompted).
 * The session is saved to tests/.auth/auth.json and reused by all other test projects.
 *
 * Re-run whenever specs start failing at the login screen (sessions expire after 12h per FR-2).
 */
import { test as setup } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const AUTH_FILE = path.join(__dirname, '.auth', 'auth.json');

setup('authenticate and save storageState', async ({ page, context }) => {
  const webAppUrl = process.env.WEB_APP_URL;
  if (!webAppUrl) throw new Error('WEB_APP_URL environment variable is required');

  // Ensure .auth directory exists
  const authDir = path.dirname(AUTH_FILE);
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  await page.goto(webAppUrl);

  // Pause so the human can log in and complete any Google consent flow
  await page.pause();

  // Save the authenticated session
  await context.storageState({ path: AUTH_FILE });
  console.log(`Session saved to ${AUTH_FILE}`);
});
