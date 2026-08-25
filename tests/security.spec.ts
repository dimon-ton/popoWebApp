/**
 * Security regression tests.
 *
 * These tests intentionally call Apps Script RPC functions directly so UI-level
 * route protection cannot hide a backend authorization regression.
 * Run only against a staging deployment with TEST_API_ENABLED=true.
 */
import { test, expect, wrapPage } from './helpers/custom-test';
import {
  cleanupTestData,
  seedTestClass,
  seedTestEnrollment,
  seedTestIndicator,
  seedTestStudent,
  seedTestSubject,
  seedTestUser,
} from './helpers/seed';

async function loginAsTeacher(browser: any, username: string, password = 'test1234') {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const rawPage = await context.newPage();
  const page = wrapPage(rawPage);
  const url = process.env.WEB_APP_URL!;

  await page.goto(url);
  await expect(page.locator('#loginBtn')).toBeVisible({ timeout: 30_000 });
  await page.fill('#username', username);
  await page.fill('#password', password);
  await page.click('#loginBtn');
  await expect(page.locator('h2')).toContainText('ยินดีต้อนรับ', { timeout: 30_000 });

  return { context, page };
}

function rpcFailure(page: any, functionName: string, args: unknown[]) {
  return page.evaluate(
    ({ functionName, args }: { functionName: string; args: unknown[] }) =>
      new Promise<{ ok: boolean; value?: unknown; error?: string }>((resolve) => {
        const runner = (window as any).google.script.run
          .withSuccessHandler((value: unknown) => resolve({ ok: true, value }))
          .withFailureHandler((error: { message?: string }) =>
            resolve({ ok: false, error: error?.message || String(error) })
          );
        runner[functionName](...args);
      }),
    { functionName, args }
  );
}

test.describe('Security: RPC authorization boundaries', () => {
  test.beforeAll(async () => {
    await cleanupTestData();
  });

  test.afterAll(async () => {
    await cleanupTestData();
  });

  test('admin user-management RPC rejects a missing/invalid token', async ({ page }) => {
    const url = process.env.WEB_APP_URL!;
    await page.goto(`${url}?page=admin_users`);
    await expect(page.locator('#pageHeading')).toBeVisible({ timeout: 30_000 });

    const result = await rpcFailure(page, 'serverAddUser', [
      'invalid_token',
      'test_should_not_exist',
      'ผู้ใช้ที่ไม่ควรถูกสร้าง',
      'teacher',
      'password123',
    ]);

    expect(result.ok).toBeFalsy();
    expect(result.error).toContain('เข้าสู่ระบบ');
  });

  test('teacher cannot read another teacher\'s subject/class data directly', async ({ browser }) => {
    const classA = await seedTestClass({ suffix: 'security_a', level: 'ป.4', section: '1' });
    const classB = await seedTestClass({ suffix: 'security_b', level: 'ป.4', section: '2' });
    const subjectA = await seedTestSubject({ suffix: 'security_a', name: 'วิชาความปลอดภัย A', code: 'SECA', class_id: classA });
    const subjectB = await seedTestSubject({ suffix: 'security_b', name: 'วิชาความปลอดภัย B', code: 'SECB', class_id: classB });
    await seedTestStudent({ class_suffix: 'security_a', seq: 1, full_name: 'test_นักเรียน security A' });
    await seedTestStudent({ class_suffix: 'security_b', seq: 1, full_name: 'test_นักเรียน security B' });
    const teacherA = await seedTestUser({ suffix: 'security_a', role: 'teacher', password: 'test1234', full_name: 'ครู Security A' });
    const teacherB = await seedTestUser({ suffix: 'security_b', role: 'teacher', password: 'test1234', full_name: 'ครู Security B' });
    await seedTestEnrollment({ suffix: 'security_a', class_id: classA, subject_id: subjectA, teacher_user_id: teacherA });
    await seedTestEnrollment({ suffix: 'security_b', class_id: classB, subject_id: subjectB, teacher_user_id: teacherB });

    const { context, page } = await loginAsTeacher(browser, teacherA);
    try {
      const result = await page.evaluate(
        ({ classB, subjectB }: { classB: string; subjectB: string }) =>
          new Promise<{ ok: boolean; error?: string }>((resolve) => {
            (window as any).google.script.run
              .withSuccessHandler(() => resolve({ ok: true }))
              .withFailureHandler((error: { message?: string }) =>
                resolve({ ok: false, error: error?.message || String(error) })
              )
              .getSummativeData((window as any).TOKEN, classB, subjectB);
          }),
        { classB, subjectB }
      );

      expect(result.ok).toBeFalsy();
      expect(result.error).toContain('ไม่มีสิทธิ์');
    } finally {
      await context.close();
    }
  });

  test('formative save rejects a student outside the authorized class', async ({ page }) => {
    const classA = await seedTestClass({ suffix: 'security_form_a', level: 'ป.5', section: '1' });
    await seedTestClass({ suffix: 'security_form_b', level: 'ป.5', section: '2' });
    const subjectA = await seedTestSubject({ suffix: 'security_form_a', name: 'วิชาคะแนนปลอดภัย', code: 'SECF', class_id: classA });
    const outsideStudent = await seedTestStudent({ class_suffix: 'security_form_b', seq: 1, full_name: 'test_นักเรียนนอกห้อง' });
    const indicator = await seedTestIndicator({ suffix: 'security_form_a', subject_id: subjectA, code: 'SEC-1', max_score: 3 });

    const url = process.env.WEB_APP_URL!;
    await page.goto(`${url}?page=dashboard`);
    await expect(page.locator('h2')).toContainText('ยินดีต้อนรับ', { timeout: 30_000 });

    const result = await page.evaluate(
      ({ classA, subjectA, outsideStudent, indicator }) =>
        new Promise<{ ok: boolean; error?: string }>((resolve) => {
          (window as any).google.script.run
            .withSuccessHandler(() => resolve({ ok: true }))
            .withFailureHandler((error: { message?: string }) =>
              resolve({ ok: false, error: error?.message || String(error) })
            )
            .serverSaveFormative((window as any).TOKEN, classA, subjectA, [
              { student_id: outsideStudent, indicator_id: indicator, score: 2 },
            ]);
        }),
      { classA, subjectA, outsideStudent, indicator }
    );

    expect(result.ok).toBeFalsy();
    expect(result.error).toContain('ไม่ได้อยู่ในชั้นเรียน');
  });

  test('formative save enforces the indicator maximum on the server', async ({ page }) => {
    const classId = await seedTestClass({ suffix: 'security_max', level: 'ป.6', section: '1' });
    const subjectId = await seedTestSubject({ suffix: 'security_max', name: 'วิชาตรวจเพดานคะแนน', code: 'SECM', class_id: classId });
    const studentId = await seedTestStudent({ class_suffix: 'security_max', seq: 1, full_name: 'test_นักเรียน max' });
    const indicatorId = await seedTestIndicator({ suffix: 'security_max', subject_id: subjectId, code: 'SEC-MAX', max_score: 3 });

    const url = process.env.WEB_APP_URL!;
    await page.goto(`${url}?page=dashboard`);
    await expect(page.locator('h2')).toContainText('ยินดีต้อนรับ', { timeout: 30_000 });

    const result = await page.evaluate(
      ({ classId, subjectId, studentId, indicatorId }) =>
        new Promise<{ ok: boolean; error?: string }>((resolve) => {
          (window as any).google.script.run
            .withSuccessHandler(() => resolve({ ok: true }))
            .withFailureHandler((error: { message?: string }) =>
              resolve({ ok: false, error: error?.message || String(error) })
            )
            .serverSaveFormative((window as any).TOKEN, classId, subjectId, [
              { student_id: studentId, indicator_id: indicatorId, score: 100 },
            ]);
        }),
      { classId, subjectId, studentId, indicatorId }
    );

    expect(result.ok).toBeFalsy();
    expect(result.error).toContain('0 ถึง 3');
  });
});
