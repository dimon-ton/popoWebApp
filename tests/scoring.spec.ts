/**
 * Scoring tests — US-008 (Formative indicator scoring), US-009 (Summative scoring)
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
  seedTestSubjectWeights,
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

// ---- US-009: Summative scoring and grade computation (คะแนน2) ----

test.describe('US-009: Summative scoring and grade computation', () => {
  let classId: string;
  let subjectId: string;
  let studentId: string;
  let teacherId: string;
  const url = process.env.WEB_APP_URL!;

  test.beforeAll(async () => {
    await cleanupTestData();
    classId = await seedTestClass({ suffix: 'us009_c1', level: 'ป.1', section: '1' });
    subjectId = await seedTestSubject({ suffix: 'us009_eng', name: 'ภาษาอังกฤษทดสอบ009', code: 'TST009', group: 1 });
    await seedTestSubjectWeights({
      subject_id: subjectId,
      coursework_max: 70, final_max: 30,
      pre_mid_max: 25, mid_max: 20, post_mid_max: 25, final_exam_max: 30,
    });
    studentId = await seedTestStudent({ class_suffix: 'us009_c1', seq: 1, full_name: 'test_นักเรียนUS009' });
    teacherId = await seedTestUser({ suffix: 'us009_teacher', role: 'teacher', password: 'test1234', full_name: 'test_ครูUS009' });
    await seedTestEnrollment({
      suffix: 'us009_enr1',
      class_id: classId,
      subject_id: subjectId,
      teacher_user_id: teacherId,
    });
  });

  test.afterAll(async () => {
    await cleanupTestData();
  });

  test('US-009: summative page loads with column headers and student row', async ({ page }) => {
    await page.goto(`${url}?page=class_summative&class_id=${classId}&subject_id=${subjectId}`);

    await expect(page.locator('#pageHeading')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#pageHeading')).toContainText('คะแนนผลการเรียน', { timeout: 15_000 });
    await expect(page.locator('#summativeTable')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#summativeBody')).toContainText('test_นักเรียนUS009', { timeout: 15_000 });
    // Column headers
    await expect(page.locator('#summativeHead')).toContainText('ระหว่างเรียน', { timeout: 10_000 });
    await expect(page.locator('#summativeHead')).toContainText('สอบกลางภาค', { timeout: 10_000 });
    await expect(page.locator('#summativeHead')).toContainText('สอบปลายภาค', { timeout: 10_000 });
    await expect(page.locator('#summativeHead')).toContainText('ผลการประเมิน', { timeout: 10_000 });
    // Save bar visible (admin session can edit)
    await expect(page.locator('#saveBar')).toBeVisible({ timeout: 10_000 });
  });

  test('US-009: coursework=42, midterm=18, final=22 → total=82, grade=4', async ({ page }) => {
    await page.goto(`${url}?page=class_summative&class_id=${classId}&subject_id=${subjectId}`);

    await expect(page.locator('#summativeTable')).toBeVisible({ timeout: 20_000 });

    const cwInput = page.locator('input[data-col="coursework"]').first();
    const midInput = page.locator('input[data-col="midterm"]').first();
    const finInput = page.locator('input[data-col="final"]').first();

    await cwInput.fill('42');
    await cwInput.dispatchEvent('input');
    await midInput.fill('18');
    await midInput.dispatchEvent('input');
    await finInput.fill('22');
    await finInput.dispatchEvent('input');

    const totalCell = page.locator('[id^="total-"]').first();
    const gradeCell = page.locator('[id^="grade-"]').first();
    await expect(totalCell).toHaveText('82', { timeout: 5_000 });
    await expect(gradeCell).toHaveText('4', { timeout: 5_000 });
  });

  test('US-009: coursework=37, midterm=15, final=23 → total=75, grade=3.5', async ({ page }) => {
    await page.goto(`${url}?page=class_summative&class_id=${classId}&subject_id=${subjectId}`);

    await expect(page.locator('#summativeTable')).toBeVisible({ timeout: 20_000 });

    const cwInput = page.locator('input[data-col="coursework"]').first();
    const midInput = page.locator('input[data-col="midterm"]').first();
    const finInput = page.locator('input[data-col="final"]').first();

    await cwInput.fill('37');
    await cwInput.dispatchEvent('input');
    await midInput.fill('15');
    await midInput.dispatchEvent('input');
    await finInput.fill('23');
    await finInput.dispatchEvent('input');

    const totalCell = page.locator('[id^="total-"]').first();
    const gradeCell = page.locator('[id^="grade-"]').first();
    await expect(totalCell).toHaveText('75', { timeout: 5_000 });
    await expect(gradeCell).toHaveText('3.5', { timeout: 5_000 });
  });

  test('US-009: makeup grade overrides final_grade; save and reload persists', async ({ page }) => {
    await page.goto(`${url}?page=class_summative&class_id=${classId}&subject_id=${subjectId}`);

    await expect(page.locator('#summativeTable')).toBeVisible({ timeout: 20_000 });

    const cwInput = page.locator('input[data-col="coursework"]').first();
    const midInput = page.locator('input[data-col="midterm"]').first();
    const finInput = page.locator('input[data-col="final"]').first();
    const makeupInput = page.locator('input[data-col="makeup_grade"]').first();

    await cwInput.fill('42');
    await cwInput.dispatchEvent('input');
    await midInput.fill('18');
    await midInput.dispatchEvent('input');
    await finInput.fill('22');
    await finInput.dispatchEvent('input');

    // Set makeup grade = 3 → final_grade should show 3, grade (computed) stays 4
    await makeupInput.fill('3');
    await makeupInput.dispatchEvent('input');

    const gradeCell = page.locator('[id^="grade-"]').first();
    const finalGradeCell = page.locator('[id^="final-grade-"]').first();
    await expect(gradeCell).toHaveText('4', { timeout: 5_000 });
    await expect(finalGradeCell).toHaveText('3', { timeout: 5_000 });

    // Save
    await page.click('#saveBtn');
    await expect(page.locator('#toast')).toContainText('บันทึกคะแนนสำเร็จ', { timeout: 20_000 });

    // Reload and assert values persist
    await page.goto(`${url}?page=class_summative&class_id=${classId}&subject_id=${subjectId}`);
    await expect(page.locator('#summativeTable')).toBeVisible({ timeout: 20_000 });

    const reloadedCw = page.locator('input[data-col="coursework"]').first();
    const reloadedMakeup = page.locator('input[data-col="makeup_grade"]').first();
    const reloadedTotal = page.locator('[id^="total-"]').first();
    const reloadedGrade = page.locator('[id^="grade-"]').first();
    const reloadedFinalGrade = page.locator('[id^="final-grade-"]').first();

    await expect(reloadedCw).toHaveValue('42', { timeout: 15_000 });
    await expect(reloadedMakeup).toHaveValue('3', { timeout: 15_000 });
    await expect(reloadedTotal).toHaveText('82', { timeout: 10_000 });
    await expect(reloadedGrade).toHaveText('4', { timeout: 10_000 });
    await expect(reloadedFinalGrade).toHaveText('3', { timeout: 10_000 });
  });
});
