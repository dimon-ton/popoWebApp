/**
 * Auth tests — US-002, US-003
 * US-002: Login form, session handling, and logout.
 * US-003: Admin user management and password reset.
 */
import { test, expect, wrapPage } from './helpers/custom-test';
import { seedTestUser, cleanupTestData, queryTestRows } from './helpers/seed';
import { readFile } from 'node:fs/promises';

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

  test('US-002: expired stored token returns to login without a template error', async ({ page }) => {
    const url = process.env.WEB_APP_URL!;
    await page.addInitScript(() => localStorage.setItem('popo_token', 'expired_test_token'));
    await page.goto(url);

    await expect(page.locator('#loginBtn')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('body')).not.toContainText('ReferenceError: data is not defined');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('popo_token'))).toBeNull();

    const renderResult = await page.evaluate(() => new Promise<{ ok: boolean; value: string }>((resolve) => {
      (window as any).google.script.run
        .withSuccessHandler((html: string) => resolve({ ok: true, value: html }))
        .withFailureHandler((error: Error) => resolve({ ok: false, value: error.message }))
        .getDashboardHtml('expired_test_token');
    }));
    expect(renderResult.ok).toBeTruthy();
    expect(renderResult.value).toContain('id="loginBtn"');
    expect(renderResult.value).not.toContain('data is not defined');
  });

  test('US-002: unauthenticated users cannot open the change-password page', async ({ page }) => {
    const url = process.env.WEB_APP_URL!;
    await page.goto(`${url}?page=change_password`);

    await expect(page.locator('#loginBtn')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#changePasswordForm')).toHaveCount(0);
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

// ---- US-003: User management and password reset ----

test.describe('US-003: User management and password reset', () => {
  let seededTeacherId: string;
  const newTeacherUsername = 'test_teacher_003new';
  const resetPassword = 'newpass_003';

  test.beforeAll(async () => {
    // Pre-seed a teacher to use for the reset-password test
    seededTeacherId = await seedTestUser({
      suffix: 'us003_seed',
      role: 'teacher',
      password: 'oldpass_003',
      full_name: 'ครูทดสอบ US003',
    });
  });

  test.afterAll(async () => {
    await cleanupTestData();
  });

  test('US-003: admin can visit /admin/users and see user list', async ({ page }) => {
    const url = process.env.WEB_APP_URL!;
    await page.goto(`${url}?page=admin_users`);

    // Page heading must be visible
    await expect(page.locator('#pageHeading')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#pageHeading')).toContainText('จัดการผู้ใช้');

    // User table should load (at least admin row)
    await expect(page.locator('#usersTable')).toBeVisible({ timeout: 20_000 });
  });

  test('US-003: admin can export the user list as a UTF-8 CSV without credentials', async ({ page }) => {
    const url = process.env.WEB_APP_URL!;
    await page.goto(`${url}?page=admin_users`);

    const exportButton = page.locator('#exportUsersCsvBtn');
    await expect(exportButton).toBeEnabled({ timeout: 20_000 });

    const downloadPromise = page.waitForEvent('download');
    await exportButton.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^users_export_\d{4}-\d{2}-\d{2}\.csv$/);

    const downloadPath = await download.path();
    expect(downloadPath).not.toBeNull();
    const csv = await readFile(downloadPath!, 'utf8');
    expect(csv.charCodeAt(0)).toBe(0xFEFF);
    expect(csv.replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0]).toBe('user_id,username,full_name,role');
    expect(csv).toContain(seededTeacherId);
    expect(csv).not.toContain('password_hash');
    expect(csv).not.toContain('salt');
  });

  test('US-003: create new user via UI — row appears in list', async ({ page }) => {
    const url = process.env.WEB_APP_URL!;
    await page.goto(`${url}?page=admin_users`);

    await expect(page.locator('#usersTable')).toBeVisible({ timeout: 20_000 });

    // Fill in the add user form
    await page.fill('#newUsername', newTeacherUsername);
    await page.fill('#newPrefix', 'ครู');
    await page.fill('#newFirstName', 'ทดสอบ');
    await page.fill('#newLastName', 'สร้างใหม่');
    await page.selectOption('#newRole', 'teacher');
    await page.fill('#newPassword', 'initpass_003');
    await page.click('#addUserBtn');

    // Success toast
    await expect(page.locator('#toast')).toContainText('เพิ่มผู้ใช้', { timeout: 20_000 });

    // New user row should appear in the table
    await expect(page.locator('#usersTable')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#usersBody')).toContainText(newTeacherUsername, { timeout: 20_000 });
  });

  test('US-003: reset password for seeded teacher — new password works', async ({ page, browser }) => {
    const url = process.env.WEB_APP_URL!;
    await page.goto(`${url}?page=admin_users`);

    await expect(page.locator('#usersTable')).toBeVisible({ timeout: 20_000 });

    // Find the reset password button for the seeded teacher row and click it
    const teacherRow = page.locator(`tr[data-user-id="${seededTeacherId}"]`);
    await expect(teacherRow).toBeVisible({ timeout: 15_000 });
    await teacherRow.locator('button:has-text("รีเซต")').click();

    // Modal should open
    await expect(page.locator('#resetModal')).toHaveClass(/open/, { timeout: 10_000 });
    await expect(page.locator('#resetTargetName')).toContainText('ครูทดสอบ US003');

    // Enter new password and save
    await page.fill('#resetNewPwd', resetPassword);
    await page.click('#confirmResetBtn');

    // Success toast
    await expect(page.locator('#toast')).toContainText('รีเซตรหัสผ่านสำเร็จ', { timeout: 20_000 });
    // Modal closes
    await expect(page.locator('#resetModal')).not.toHaveClass(/open/, { timeout: 10_000 });

    // Now verify the new password works — log in as the seeded teacher in a fresh context
    const freshCtx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const rawFreshPage = await freshCtx.newPage();
    const freshPage = wrapPage(rawFreshPage);
    await freshPage.goto(url);

    await expect(freshPage.locator('#loginBtn')).toBeVisible({ timeout: 30_000 });
    await freshPage.fill('#username', seededTeacherId); // username = user_id for seeded users
    await freshPage.fill('#password', resetPassword);
    await freshPage.click('#loginBtn');

    // Should land on change password page (teacher sees เปลี่ยนรหัสผ่าน)
    await expect(freshPage.locator('h2')).toContainText('เปลี่ยนรหัสผ่าน', { timeout: 30_000 });
    await expect(freshPage.locator('body')).toHaveAttribute('data-force-password-change', 'true');
    await expect(freshPage.locator('#appFeedbackFooter')).toHaveCount(0);
    await expect(freshPage.locator('#feedbackModalBackdrop')).toHaveCount(0);
    await expect(freshPage.locator('.back-btn')).toHaveCount(0);
    await expect(freshPage.locator('#cancelBtn')).toHaveCount(0);

    // Completing the required change restores normal authenticated-page UI.
    await freshPage.fill('#oldPassword', resetPassword);
    await freshPage.fill('#newPassword', 'changedpass_003');
    await freshPage.fill('#confirmPassword', 'changedpass_003');
    await freshPage.click('#changeBtn');
    await expect(freshPage.locator('h2')).toContainText('ยินดีต้อนรับ', { timeout: 30_000 });
    await expect(freshPage.locator('#appFeedbackFooter')).toBeVisible({ timeout: 10_000 });

    await freshCtx.close();
  });

  test('authenticated admin can open voluntary change password and return to the dashboard', async ({ page }) => {
    const url = process.env.WEB_APP_URL!;
    await page.goto(`${url}?page=dashboard`);
    await expect(page.locator('h2')).toContainText('ยินดีต้อนรับ', { timeout: 30_000 });

    await page.locator('.navbar-user-trigger').click();
    await expect(page.locator('#changePasswordLink')).toBeVisible();
    await page.locator('#changePasswordLink').click();

    await expect(page.locator('#changePasswordForm')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('body')).toHaveAttribute('data-force-password-change', 'false');
    await expect(page.locator('#cancelBtn')).toBeVisible();
    await page.locator('#cancelBtn').click();
    await expect(page.locator('h2')).toContainText('ยินดีต้อนรับ', { timeout: 20_000 });
  });

  test('authenticated teacher can change their own password securely', async ({ browser }) => {
    test.setTimeout(180_000);
    const url = process.env.WEB_APP_URL!;
    const username = 'test_user_self_change';
    const oldPassword = 'oldpass_self';
    const newPassword = 'newpass_self';
    await seedTestUser({ suffix: 'self_change', role: 'teacher', password: oldPassword, full_name: 'ครูเปลี่ยนรหัส' });

    const teacherContext = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const teacherPage = wrapPage(await teacherContext.newPage());
    await teacherPage.goto(url);
    await teacherPage.fill('#username', username);
    await teacherPage.fill('#password', oldPassword);
    await teacherPage.click('#loginBtn');
    await expect(teacherPage.locator('h2')).toContainText('ยินดีต้อนรับ', { timeout: 30_000 });

    await teacherPage.locator('.navbar-user-trigger').click();
    await expect(teacherPage.locator('#changePasswordLink')).toBeVisible();
    await teacherPage.locator('#changePasswordLink').click();
    await expect(teacherPage.locator('#changePasswordForm')).toBeVisible({ timeout: 20_000 });
    await expect(teacherPage.locator('body')).toHaveAttribute('data-force-password-change', 'false');
    await expect(teacherPage.locator('#cancelBtn')).toBeVisible();

    await teacherPage.fill('#oldPassword', oldPassword);
    await teacherPage.fill('#newPassword', 'short');
    await teacherPage.fill('#confirmPassword', 'different');
    await teacherPage.click('#changeBtn');
    await expect(teacherPage.locator('#errBox')).toContainText('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร');

    await teacherPage.fill('#newPassword', newPassword);
    await teacherPage.fill('#confirmPassword', 'newpass_other');
    await teacherPage.click('#changeBtn');
    await expect(teacherPage.locator('#errBox')).toContainText('รหัสผ่านใหม่ไม่ตรงกัน');

    await teacherPage.fill('#newPassword', oldPassword);
    await teacherPage.fill('#confirmPassword', oldPassword);
    await teacherPage.click('#changeBtn');
    await expect(teacherPage.locator('#errBox')).toContainText('รหัสผ่านใหม่ต้องไม่เหมือนรหัสผ่านเดิม');

    await teacherPage.fill('#oldPassword', 'wrongpass');
    await teacherPage.fill('#newPassword', newPassword);
    await teacherPage.fill('#confirmPassword', newPassword);
    await teacherPage.click('#changeBtn');
    await expect(teacherPage.locator('#errBox')).toContainText('รหัสผ่านปัจจุบันไม่ถูกต้อง', { timeout: 20_000 });
    await expect(teacherPage.locator('#changeBtn')).toBeEnabled();

    await teacherPage.fill('#oldPassword', oldPassword);
    await teacherPage.click('#changeBtn');
    await expect(teacherPage.locator('#changeBtn')).toBeDisabled();
    await expect(teacherPage.locator('#successBox')).toContainText('เปลี่ยนรหัสผ่านสำเร็จ', { timeout: 20_000 });
    await expect(teacherPage.locator('h2')).toContainText('ยินดีต้อนรับ', { timeout: 20_000 });
    await teacherContext.close();

    const oldPasswordContext = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const oldPasswordPage = wrapPage(await oldPasswordContext.newPage());
    await oldPasswordPage.goto(url);
    await oldPasswordPage.fill('#username', username);
    await oldPasswordPage.fill('#password', oldPassword);
    await oldPasswordPage.click('#loginBtn');
    await expect(oldPasswordPage.locator('#errBox')).toContainText('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง', { timeout: 20_000 });
    await oldPasswordContext.close();

    const newPasswordContext = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const newPasswordPage = wrapPage(await newPasswordContext.newPage());
    await newPasswordPage.goto(url);
    await newPasswordPage.fill('#username', username);
    await newPasswordPage.fill('#password', newPassword);
    await newPasswordPage.click('#loginBtn');
    await expect(newPasswordPage.locator('h2')).toContainText('ยินดีต้อนรับ', { timeout: 30_000 });
    await expect(newPasswordPage.locator('body')).not.toHaveAttribute('data-force-password-change', 'true');
    await newPasswordContext.close();

    const userRows = await queryTestRows('Users', 'user_id');
    const changedUser = userRows.find(row => row.user_id === username);
    expect(changedUser?.must_change_pwd || '').toBe('');
    const auditRows = await queryTestRows('AuditLog', 'user_id');
    const passwordAudit = auditRows.find(row => row.user_id === username && String(row.new_value).includes('password_changed_self'));
    expect(passwordAudit).toBeTruthy();
    const auditText = JSON.stringify(passwordAudit);
    expect(auditText).not.toContain(oldPassword);
    expect(auditText).not.toContain(newPassword);
    expect(auditText).not.toContain('password_hash');
    expect(auditText).not.toContain('salt');
  });

  test('US-003: non-admin hitting /admin/users receives 403 block screen', async ({ browser }) => {
    const nonAdminCtx = await browser.newContext();
    const page = await nonAdminCtx.newPage();
    const url = process.env.WEB_APP_URL!;

    // Visit admin/users without session — should show login page or 403
    await page.goto(`${url}?page=admin_users`);

    const bodyText = await page.locator('body').textContent();
    const isBlocked =
      bodyText?.includes('ไม่มีสิทธิ์') ||
      bodyText?.includes('กรุณาเข้าสู่ระบบ') ||
      bodyText?.includes('login');
    expect(isBlocked).toBeTruthy();

    await nonAdminCtx.close();
  });
});

// ---- US-017: Deployment and first-run setup wizard ----

test.describe('US-017: First-run setup wizard', () => {
  // Wizard page is accessible without any auth (no DB_SHEET_ID gating at the HTML level)
  // We navigate directly to ?page=setup_wizard to test the UI without clearing production Script Properties.
  test.use({ storageState: { cookies: [], origins: [] } });

  test('US-017: setup wizard page is accessible and shows heading', async ({ page }) => {
    const url = process.env.WEB_APP_URL!;
    await page.goto(`${url}?page=setup_wizard`);

    // The wizard heading must be visible
    await expect(page.locator('#wizardHeading')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#wizardHeading')).toContainText('ตัวช่วยติดตั้งระบบครั้งแรก');
  });

  test('US-017: wizard step 1 shows create database button', async ({ page }) => {
    const url = process.env.WEB_APP_URL!;
    await page.goto(`${url}?page=setup_wizard`);

    await expect(page.locator('#wizardHeading')).toBeVisible({ timeout: 30_000 });

    // Step 1 content must be visible
    await expect(page.locator('#step1')).toBeVisible();
    await expect(page.locator('#createDbBtn')).toBeVisible();
    await expect(page.locator('#createDbBtn')).toContainText('สร้างฐานข้อมูล');
  });

  test('US-017: wizard step 3 go-to-login button redirects to login page', async ({ page }) => {
    const url = process.env.WEB_APP_URL!;
    await page.goto(`${url}?page=setup_wizard`);

    await expect(page.locator('#wizardHeading')).toBeVisible({ timeout: 30_000 });

    // Jump directly to step 3 via client-side JS to test the redirect
    await page.evaluate('goStep(3)');

    // Step 3 should be visible with the go-to-login button
    await expect(page.locator('#step3')).toBeVisible();
    await expect(page.locator('#goLoginBtn')).toBeVisible();

    // Click "go to login" — should navigate back to login page
    await page.click('#goLoginBtn');

    // Login page elements should appear
    await expect(page.locator('#loginBtn')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#username')).toBeVisible();
  });
});
