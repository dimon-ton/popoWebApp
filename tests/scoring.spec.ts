/**
 * Scoring tests — US-008 (Formative indicator scoring)
 * Runs against the production /exec URL using the saved auth.json session.
 * All test data uses test_ prefix and is cleaned up in afterAll.
 */
import { test, expect } from '@playwright/test';
import {
  seedTestClass,
  seedTestSubject,
  seedTestStudent,
  seedTestUser,
  seedTestEnrollment,
  seedTestIndicator,
  cleanupTestData,
} from './helpers/seed';

// ---- US-008: Formative indicator scoring (คะแนน1) ----

test.describe('US-008: Formative indicator scoring', () => {
  let classId: string;
  let subjectId: string;
  let studentId: string;
  let teacherId: string;
  let indicatorId: string;
  const url = process.env.WEB_APP_URL!;

  test.beforeAll(async () => {
    await cleanupTestData();
    classId = await seedTestClass({ suffix: 'us008_c1', level: 'ป.1', section: '1' });
    subjectId = await seedTestSubject({ suffix: 'us008_eng', name: 'ภาษาอังกฤษทดสอบ008', code: 'TST008', group: 1 });
    studentId = await seedTestStudent({ class_suffix: 'us008_c1', seq: 1, full_name: 'test_นักเรียนUS008' });
    teacherId = await seedTestUser({ suffix: 'us008_teacher', role: 'teacher', password: 'test1234', full_name: 'test_ครูUS008' });
    await seedTestEnrollment({
      suffix: 'us008_enr1',
      class_id: classId,
      subject_id: subjectId,
      teacher_user_id: teacherId,
    });
    indicatorId = await seedTestIndicator({
      suffix: 'us008_ind1',
      subject_id: subjectId,
      code: 'test_ind_001',
      max_score: 3,
      display_order: 1,
    });
  });

  test.afterAll(async () => {
    await cleanupTestData();
  });

  test('US-008: formative page loads and shows student and indicator', async ({ page }) => {
    await page.goto(`${url}?page=class_formative&class_id=${classId}&subject_id=${subjectId}`);

    await expect(page.locator('#pageHeading')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#pageHeading')).toContainText('คะแนนตัวชี้วัด', { timeout: 15_000 });
    await expect(page.locator('#formativeTable')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#formativeBody')).toContainText('test_นักเรียนUS008', { timeout: 15_000 });
    // Indicator column header should be visible
    await expect(page.locator('#formativeHead')).toContainText('test_ind_001', { timeout: 15_000 });
    // Save bar visible (admin session can edit)
    await expect(page.locator('#saveBar')).toBeVisible({ timeout: 10_000 });
  });

  test('US-008: enter score, assert live row total updates, save, reload persists', async ({ page }) => {
    await page.goto(`${url}?page=class_formative&class_id=${classId}&subject_id=${subjectId}`);

    await expect(page.locator('#formativeTable')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#formativeBody')).toContainText('test_นักเรียนUS008', { timeout: 15_000 });

    // Enter score 3 for the first indicator of the first student
    const scoreInput = page.locator('input.score-input').first();
    await scoreInput.fill('3');
    await scoreInput.dispatchEvent('input');

    // Row total should update live to 3
    const rowTotalCell = page.locator('[id^="row-total-"]').first();
    await expect(rowTotalCell).toHaveText('3', { timeout: 5_000 });

    // Save
    await page.click('#saveBtn');
    await expect(page.locator('#toast')).toContainText('บันทึกคะแนนสำเร็จ', { timeout: 20_000 });

    // Reload and assert value persists
    await page.goto(`${url}?page=class_formative&class_id=${classId}&subject_id=${subjectId}`);
    await expect(page.locator('#formativeTable')).toBeVisible({ timeout: 20_000 });

    const reloadedInput = page.locator('input.score-input').first();
    await expect(reloadedInput).toHaveValue('3', { timeout: 15_000 });
  });
});
