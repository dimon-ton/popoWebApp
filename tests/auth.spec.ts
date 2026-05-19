/**
 * Auth tests — US-002
 * Tests login form, session handling, and logout.
 * Uses a fresh browser context (no storageState) so the login page appears.
 */
import { test, expect } from '@playwright/test';

// US-002 tests run in a fresh context without auth.json — we test the login flow itself

test.describe('US-002: Login form and session', () => {
  // Each test gets its own fresh context (no stored session)
  test.use({ storageState: { cookies: [], origins: [] } });

  test('US-002: login page is visible on first visit', async ({ page }) => {
    const url = process.env.WEB_APP_URL!;
    await page.goto(url);

    // Login form must be visible
    await expect(page.locator('#loginBtn')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#username')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
  });

  test('US-002: wrong password shows Thai error message', async ({ page }) => {
    const url = process.env.WEB_APP_URL!;
    await page.goto(url);

    await expect(page.locator('#loginBtn')).toBeVisible({ timeout: 30_000 });

    await page.fill('#username', 'admin');
    await page.fill('#password', 'wrongpassword123');
    await page.click('#loginBtn');

    // Error box should appear with Thai error text
    await expect(page.locator('#errBox')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#errBox')).toContainText('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');

    // Login button should be re-enabled
    await expect(page.locator('#loginBtn')).toBeEnabled({ timeout: 10_000 });
  });

  test('US-002: correct admin credentials show dashboard', async ({ page }) => {
    const url = process.env.WEB_APP_URL!;
    await page.goto(url);

    await expect(page.locator('#loginBtn')).toBeVisible({ timeout: 30_000 });

    const adminUser = process.env.ADMIN_USERNAME ?? 'admin';
    const adminPass = process.env.ADMIN_PASSWORD ?? 'admin1234';
    await page.fill('#username', adminUser);
    await page.fill('#password', adminPass);
    await page.click('#loginBtn');

    // Dashboard heading should appear after successful login
    await expect(page.locator('h2')).toContainText('ยินดีต้อนรับ', { timeout: 30_000 });
  });

  test('US-002: logout clears session and returns to login page', async ({ page }) => {
    const url = process.env.WEB_APP_URL!;
    await page.goto(url);

    await expect(page.locator('#loginBtn')).toBeVisible({ timeout: 30_000 });

    const adminUser = process.env.ADMIN_USERNAME ?? 'admin';
    const adminPass = process.env.ADMIN_PASSWORD ?? 'admin1234';
    await page.fill('#username', adminUser);
    await page.fill('#password', adminPass);
    await page.click('#loginBtn');

    // Wait for dashboard
    await expect(page.locator('h2')).toContainText('ยินดีต้อนรับ', { timeout: 30_000 });

    // Click logout
    await expect(page.locator('#logoutBtn')).toBeVisible();
    await page.click('#logoutBtn');

    // Should be redirected back to login page
    await expect(page.locator('#loginBtn')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#username')).toBeVisible();

    // localStorage token should be cleared
    const token = await page.evaluate(() => localStorage.getItem('popo_token'));
    expect(token).toBeNull();
  });
});
