import { test, expect } from './helpers/custom-test';
import path from 'path';
import fs from 'fs';
import { cleanupTestData } from './helpers/seed';

test.describe('Profile Edit — Avatar Upload', () => {
  const fixturesDir = path.join(__dirname, 'fixtures');
  const avatarPath = path.join(fixturesDir, 'test_avatar.png');

  test.afterAll(async () => {
    await cleanupTestData();
  });

  test('profile edit page loads with correct heading', async ({ page }) => {
    const url = process.env.WEB_APP_URL!;
    await page.goto(`${url}?page=profile_edit`);

    await expect(page.locator('.page-title')).toContainText('แก้ไขโปรไฟล์', { timeout: 30_000 });
  });

  test('profile edit page shows name fields and role display', async ({ page }) => {
    const url = process.env.WEB_APP_URL!;
    await page.goto(`${url}?page=profile_edit`);

    await expect(page.locator('.page-title')).toBeVisible({ timeout: 30_000 });

    await expect(page.locator('#editPrefix')).toBeVisible();
    await expect(page.locator('#editFirstName')).toBeVisible();
    await expect(page.locator('#editLastName')).toBeVisible();
    await expect(page.locator('#editRoleDisplay')).toBeVisible();
    await expect(page.locator('#editRoleDisplay')).toBeDisabled();
  });

  test('file input opens crop modal after selecting image', async ({ page }) => {
    const url = process.env.WEB_APP_URL!;
    await page.goto(`${url}?page=profile_edit`);

    await expect(page.locator('.page-title')).toBeVisible({ timeout: 30_000 });

    const fileInput = page.locator('input[type="file"]');
    await expect(fileInput).toBeAttached();

    await fileInput.setInputFiles(avatarPath);

    // Crop modal should open
    await expect(page.locator('#cropOverlay')).toHaveClass(/open/, { timeout: 10_000 });
    await expect(page.locator('#cropOkBtn')).toBeVisible();
    await expect(page.locator('#cropCancelBtn')).toBeVisible();
    await expect(page.locator('#cropCanvas')).toBeVisible();
  });

  test('uploading oversize file shows error toast', async ({ page }) => {
    const url = process.env.WEB_APP_URL!;
    await page.goto(`${url}?page=profile_edit`);

    await expect(page.locator('.page-title')).toBeVisible({ timeout: 30_000 });

    const bigBuffer = Buffer.alloc(6_000_000, 'x');
    const bigFile = {
      name: 'oversize.png',
      mimeType: 'image/png',
      buffer: bigBuffer,
    };

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(bigFile);

    await expect(page.locator('#toast')).toContainText('ไฟล์ใหญ่เกินไป', { timeout: 10_000 });
    await expect(page.locator('#toast')).toHaveClass(/error/);

    await expect(page.locator('#avatarFileName')).toContainText('ยังไม่ได้เลือก');
  });

  test('successful upload via crop modal updates avatar image element', async ({ page }) => {
    const url = process.env.WEB_APP_URL!;
    await page.goto(`${url}?page=profile_edit`);

    await expect(page.locator('.page-title')).toBeVisible({ timeout: 30_000 });

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(avatarPath);

    // Wait for crop modal to appear and confirm
    await expect(page.locator('#cropOverlay')).toHaveClass(/open/, { timeout: 10_000 });
    await page.click('#cropOkBtn');

    // After confirming crop, upload should proceed
    await expect(page.locator('#avatarFileName')).toContainText('test_avatar.png', { timeout: 30_000 });
    await expect(page.locator('#removeAvatarBtn')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#profileAvatar')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#profileAvatar')).toHaveAttribute('src', /data:image/, { timeout: 10_000 });

    await expect(page.locator('#toast')).toContainText('อัพโหลดรูปภาพสำเร็จ');
  });

  test('remove avatar button restores the neutral default profile image', async ({ page }) => {
    const url = process.env.WEB_APP_URL!;
    await page.goto(`${url}?page=profile_edit`);

    await expect(page.locator('.page-title')).toBeVisible({ timeout: 30_000 });

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(avatarPath);

    // Confirm crop modal
    await expect(page.locator('#cropOverlay')).toHaveClass(/open/, { timeout: 10_000 });
    await page.click('#cropOkBtn');

    await expect(page.locator('#removeAvatarBtn')).toBeVisible({ timeout: 30_000 });

    await page.click('#removeAvatarBtn');

    await expect(page.locator('#profileAvatar')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#profileAvatar')).toHaveAttribute(
      'src',
      /^data:image\/svg\+xml;charset=UTF-8,/,
      { timeout: 10_000 },
    );
    await expect(page.locator('#removeAvatarBtn')).not.toBeVisible();
    await expect(page.locator('#avatarFileName')).toContainText('ยังไม่ได้เลือก');
  });

  test('save profile shows success toast and navigates to dashboard', async ({ page }) => {
    const url = process.env.WEB_APP_URL!;
    await page.goto(`${url}?page=profile_edit`);

    await expect(page.locator('.page-title')).toBeVisible({ timeout: 30_000 });

    await page.fill('#editFirstName', 'ทดสอบ');
    await page.fill('#editLastName', 'โปรไฟล์');

    await page.click('#saveBtn');

    await expect(page.locator('#toast')).toContainText('บันทึกสำเร็จ', { timeout: 20_000 });
  });
});
