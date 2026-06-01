import { test as setup, expect } from './helpers/custom-test';
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

  // Programmatically login with admin credentials
  const adminUser = process.env.ADMIN_USERNAME ?? 'admin';
  const adminPass = process.env.ADMIN_PASSWORD ?? 'admin1234';

  await expect(page.locator('#loginBtn')).toBeVisible({ timeout: 30_000 });
  await page.fill('#username', adminUser);
  await page.fill('#password', adminPass);
  await page.click('#loginBtn');

  // Wait for dashboard heading to appear to verify login succeeded
  await expect(page.locator('h2')).toContainText('ยินดีต้อนรับ', { timeout: 30_000 });

  // Save the authenticated session
  await context.storageState({ path: AUTH_FILE });
  console.log(`Session saved to ${AUTH_FILE}`);
});
