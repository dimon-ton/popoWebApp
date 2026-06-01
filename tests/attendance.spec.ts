/**
 * Attendance tests — US-007
 * Runs against the production /exec URL using the saved auth.json session.
 * All test data uses test_ prefix and is cleaned up in afterAll.
 */
import { test, expect } from './helpers/custom-test';
import {
  seedTestClass,
  seedTestSubject,
  seedTestStudent,
  seedTestUser,
  seedTestEnrollment,
  cleanupTestData,
} from './helpers/seed';

// ---- US-007: Attendance grid view and edit ----

test.describe('US-007: Attendance grid view and edit', () => {
  let classId: string;
  let subjectId: string;
  let studentId: string;
  let teacherId: string;
  const url = process.env.WEB_APP_URL!;

  test.beforeAll(async () => {
    await cleanupTestData();
    classId = await seedTestClass({ suffix: 'us007_c1', level: 'ป.1', section: '1' });
    subjectId = await seedTestSubject({ suffix: 'us007_eng', name: 'ภาษาอังกฤษทดสอบ', code: 'TST007', group: 1 });
    // Seed a student in the class
    studentId = await seedTestStudent({ class_suffix: 'us007_c1', seq: 1, full_name: 'test_นักเรียนUS007' });
    // Seed teacher and enroll them for this class/subject
    teacherId = await seedTestUser({ suffix: 'us007_teacher', role: 'teacher', password: 'test1234', full_name: 'test_ครูUS007' });
    await seedTestEnrollment({
      suffix: 'us007_enr1',
      class_id: classId,
      subject_id: subjectId,
      teacher_user_id: teacherId,
    });
  });

  test.afterAll(async () => {
    await cleanupTestData();
  });

  test('US-007: attendance page loads and shows week navigation', async ({ page }) => {
    await page.goto(`${url}?page=class_attendance&class_id=${classId}&subject_id=${subjectId}&week=1`);

    // Page heading should be visible
    await expect(page.locator('#pageHeading')).toBeVisible({ timeout: 20_000 });
    // Week label should say สัปดาห์ที่ 1
    await expect(page.locator('#weekLabel')).toContainText('สัปดาห์ที่ 1', { timeout: 15_000 });
    // Attendance table should be visible
    await expect(page.locator('#attTable')).toBeVisible({ timeout: 20_000 });
    // Student name should appear in table body
    await expect(page.locator('#attBody')).toContainText('test_นักเรียนUS007', { timeout: 15_000 });
    // Week jump dropdown should be visible
    await expect(page.locator('#weekJump')).toBeVisible();
    // Save bar should be visible (admin session can edit)
    await expect(page.locator('#saveBar')).toBeVisible({ timeout: 10_000 });
  });

  test('US-007: cycle cell, save, and assert persists on reload', async ({ page }) => {
    await page.goto(`${url}?page=class_attendance&class_id=${classId}&subject_id=${subjectId}&week=1`);

    await expect(page.locator('#attTable')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#attBody')).toContainText('test_นักเรียนUS007', { timeout: 15_000 });

    // Click the first cell of the first student row (day 1) — cycles '' → '/'
    const firstCell = page.locator('#attBody .att-cell').first();
    await firstCell.click();
    await expect(firstCell).toHaveText('/');

    // Click the second cell (day 2) twice — '' → '/' → 'ล'
    const secondCell = page.locator('#attBody .att-cell').nth(1);
    await secondCell.click(); // → '/'
    await secondCell.click(); // → 'ล'
    await expect(secondCell).toHaveText('ล');

    // Save
    await page.click('#saveBtn');
    await expect(page.locator('#toast')).toContainText('บันทึกการเข้าเรียนสำเร็จ', { timeout: 20_000 });

    // Reload and assert values persist
    await page.goto(`${url}?page=class_attendance&class_id=${classId}&subject_id=${subjectId}&week=1`);
    await expect(page.locator('#attTable')).toBeVisible({ timeout: 20_000 });

    const reloadedFirst = page.locator('#attBody .att-cell').first();
    const reloadedSecond = page.locator('#attBody .att-cell').nth(1);
    await expect(reloadedFirst).toHaveText('/', { timeout: 15_000 });
    await expect(reloadedSecond).toHaveText('ล', { timeout: 15_000 });
  });

  test('US-007: footer shows presence and leave counts for student', async ({ page }) => {
    await page.goto(`${url}?page=class_attendance&class_id=${classId}&subject_id=${subjectId}&week=1`);

    await expect(page.locator('#attTable')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#attBody')).toContainText('test_นักเรียนUS007', { timeout: 15_000 });

    // After previous test saved '/' for day1 and 'ล' for day2,
    // yearly totals: present=1, leave=1
    const presentCell = page.locator('[data-student-present="' + studentId + '"]');
    const leaveCell = page.locator('[data-student-leave="' + studentId + '"]');
    await expect(presentCell).toBeVisible({ timeout: 15_000 });
    await expect(leaveCell).toBeVisible({ timeout: 15_000 });
    await expect(presentCell).toHaveText('1');
    await expect(leaveCell).toHaveText('1');
  });

  test('US-007: week navigation changes week label', async ({ page }) => {
    await page.goto(`${url}?page=class_attendance&class_id=${classId}&subject_id=${subjectId}&week=1`);
    await expect(page.locator('#attTable')).toBeVisible({ timeout: 20_000 });

    // Click next week
    await page.click('#nextWeekBtn');
    await expect(page.locator('#weekLabel')).toContainText('สัปดาห์ที่ 2', { timeout: 15_000 });

    // Click prev week back
    await page.click('#prevWeekBtn');
    await expect(page.locator('#weekLabel')).toContainText('สัปดาห์ที่ 1', { timeout: 15_000 });
  });

  test('US-007: jump to week dropdown works', async ({ page }) => {
    await page.goto(`${url}?page=class_attendance&class_id=${classId}&subject_id=${subjectId}&week=1`);
    await expect(page.locator('#attTable')).toBeVisible({ timeout: 20_000 });

    await page.selectOption('#weekJump', '5');
    await expect(page.locator('#weekLabel')).toContainText('สัปดาห์ที่ 5', { timeout: 15_000 });
  });
});
