/**
 * Scoring tests — US-008 (Formative indicator scoring), US-009 (Summative scoring), US-011 (Characteristics)
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
  seedTestIndicator,
  seedTestSubjectWeights,
  seedTestSummative,
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

// ---- US-012: Read-Think-Write scoring (อ่านคิด) ----

test.describe('US-012: Read-Think-Write scoring', () => {
  let classId: string;
  let subjectId: string;
  let studentId: string;
  let teacherId: string;
  const url = process.env.WEB_APP_URL!;

  test.beforeAll(async () => {
    await cleanupTestData();
    classId = await seedTestClass({ suffix: 'us012_c1', level: 'ป.1', section: '1' });
    subjectId = await seedTestSubject({ suffix: 'us012_eng', name: 'ภาษาอังกฤษทดสอบ012', code: 'TST012', group: 1 });
    studentId = await seedTestStudent({ class_suffix: 'us012_c1', seq: 1, full_name: 'test_นักเรียนUS012' });
    teacherId = await seedTestUser({ suffix: 'us012_teacher', role: 'teacher', password: 'test1234', full_name: 'test_ครูUS012' });
    await seedTestEnrollment({
      suffix: 'us012_enr1',
      class_id: classId,
      subject_id: subjectId,
      teacher_user_id: teacherId,
    });
  });

  test.afterAll(async () => {
    await cleanupTestData();
  });

  test('US-012: readthinkwrite page loads with student row and column groups', async ({ page }) => {
    await page.goto(`${url}?page=class_readthinkwrite&class_id=${classId}&subject_id=${subjectId}`);

    await expect(page.locator('#pageHeading')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#pageHeading')).toContainText('อ่าน คิดวิเคราะห์ และเขียน', { timeout: 15_000 });
    await expect(page.locator('#rtwTable')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#rtwBody')).toContainText('test_นักเรียนUS012', { timeout: 15_000 });
    // Group headers visible
    await expect(page.locator('#rtwHead')).toContainText('อ่าน', { timeout: 10_000 });
    await expect(page.locator('#rtwHead')).toContainText('คิดวิเคราะห์', { timeout: 10_000 });
    await expect(page.locator('#rtwHead')).toContainText('เขียน', { timeout: 10_000 });
    await expect(page.locator('#rtwHead')).toContainText('รวม', { timeout: 10_000 });
    await expect(page.locator('#rtwHead')).toContainText('ผล', { timeout: 10_000 });
    // Save bar visible (admin session)
    await expect(page.locator('#saveBar')).toBeVisible({ timeout: 10_000 });
  });

  test('US-012: enter 10,9,9,9,9,8,9,9,9,9 → total=90, label=ดีเยี่ยม', async ({ page }) => {
    await page.goto(`${url}?page=class_readthinkwrite&class_id=${classId}&subject_id=${subjectId}`);

    await expect(page.locator('#rtwTable')).toBeVisible({ timeout: 20_000 });

    // 10 columns: r1,r2,r3, t1,t2,t3,t4, w1,w2,w3
    const scoreValues = [10, 9, 9, 9, 9, 8, 9, 9, 9, 9];
    const inputs = page.locator('input.score-input');

    for (let i = 0; i < scoreValues.length; i++) {
      await inputs.nth(i).fill(String(scoreValues[i]));
      await inputs.nth(i).dispatchEvent('input');
    }

    // Total = 90, label = ดีเยี่ยม
    const totalCell = page.locator('[id^="rtw-total-"]').first();
    const labelCell = page.locator('[id^="rtw-label-"]').first();
    await expect(totalCell).toHaveText('90', { timeout: 5_000 });
    await expect(labelCell).toHaveText('ดีเยี่ยม', { timeout: 5_000 });
  });

  test('US-012: save and reload persists', async ({ page }) => {
    await page.goto(`${url}?page=class_readthinkwrite&class_id=${classId}&subject_id=${subjectId}`);

    await expect(page.locator('#rtwTable')).toBeVisible({ timeout: 20_000 });

    const scoreValues = [10, 9, 9, 9, 9, 8, 9, 9, 9, 9];
    const inputs = page.locator('input.score-input');

    for (let i = 0; i < scoreValues.length; i++) {
      await inputs.nth(i).fill(String(scoreValues[i]));
      await inputs.nth(i).dispatchEvent('input');
    }

    // Save
    await page.click('#saveBtn');
    await expect(page.locator('#toast')).toContainText('บันทึกคะแนนสำเร็จ', { timeout: 20_000 });

    // Reload and assert values persist
    await page.goto(`${url}?page=class_readthinkwrite&class_id=${classId}&subject_id=${subjectId}`);
    await expect(page.locator('#rtwTable')).toBeVisible({ timeout: 20_000 });

    const reloadedInputs = page.locator('input.score-input');
    await expect(reloadedInputs.nth(0)).toHaveValue('10', { timeout: 15_000 });
    await expect(reloadedInputs.nth(5)).toHaveValue('8', { timeout: 15_000 });

    const reloadedTotal = page.locator('[id^="rtw-total-"]').first();
    const reloadedLabel = page.locator('[id^="rtw-label-"]').first();
    await expect(reloadedTotal).toHaveText('90', { timeout: 10_000 });
    await expect(reloadedLabel).toHaveText('ดีเยี่ยม', { timeout: 10_000 });
  });
});

// ---- US-013: Cover report aggregates (ปก) ----

test.describe('US-013: Cover report aggregates', () => {
  let classId: string;
  let subjectId: string;
  let teacherId: string;
  const url = process.env.WEB_APP_URL!;

  // We seed 5 students with specific summative totals:
  //   student 1: total=82 → grade 4
  //   student 2: total=84 → grade 4
  //   student 3: total=76 → grade 3.5
  //   student 4: total=71 → grade 3
  //   student 5: total=72 → grade 3
  // Expected grade_dist: 4→2, 3.5→1, 3→2, others→0

  test.beforeAll(async () => {
    test.setTimeout(180_000);
    await cleanupTestData();
    classId = await seedTestClass({ suffix: 'us013_c1', level: 'ป.1', section: '1' });
    subjectId = await seedTestSubject({ suffix: 'us013_eng', name: 'ภาษาอังกฤษทดสอบ013', code: 'TST013', group: 1 });
    teacherId = await seedTestUser({ suffix: 'us013_teacher', role: 'teacher', password: 'test1234', full_name: 'test_ครูUS013' });
    await seedTestEnrollment({
      suffix: 'us013_enr1',
      class_id: classId,
      subject_id: subjectId,
      teacher_user_id: teacherId,
    });
    // Seed 5 students
    for (let i = 1; i <= 5; i++) {
      await seedTestStudent({ class_suffix: 'us013_c1', seq: i, full_name: `test_นักเรียนUS013_${i}` });
    }
    // Seed summative scores: grades 4,4,3.5,3,3
    const totals = [82, 84, 76, 71, 72];
    for (let i = 1; i <= 5; i++) {
      await seedTestSummative({
        student_id: `test_student_us013_c1_${i}`,
        subject_id: subjectId,
        total: totals[i - 1],
      });
    }
  });

  test.afterAll(async () => {
    await cleanupTestData();
  });

  test('US-013: report page loads with A4 report book and section tables', async ({ page }) => {
    await page.goto(`${url}?page=class_report&class_id=${classId}&subject_id=${subjectId}`);

    await expect(page.locator('#pageHeading')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#pageHeading')).toContainText('ป.พ.5', { timeout: 15_000 });
    await expect(page.locator('#reportContent')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.a4-report-book')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.a4-page')).toHaveCount(13, { timeout: 15_000 });
    await expect(page.locator('.form-summary-table')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.form-grid-table')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#devActivityCard')).toHaveCount(0);
  });

  test('US-013: grade distribution counts match seeded summative scores', async ({ page }) => {
    await page.goto(`${url}?page=class_report&class_id=${classId}&subject_id=${subjectId}`);

    await expect(page.locator('#reportContent')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.form-summary-table')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.form-summary-table')).toContainText('5', { timeout: 10_000 });
    await expect(page.locator('.form-summary-table')).toContainText('2', { timeout: 10_000 });
    await expect(page.locator('.form-summary-table')).toContainText('1', { timeout: 10_000 });
  });

  test('US-013: dev activity editor is removed from report page', async ({ page }) => {
    await page.goto(`${url}?page=class_report&class_id=${classId}&subject_id=${subjectId}`);

    await expect(page.locator('#reportContent')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#devActivityCard')).toHaveCount(0);
    await expect(page.locator('select.dev-result-select')).toHaveCount(0);
  });
});

// ---- US-014: PDF export of cover report ----

test.describe('US-014: PDF export of cover report', () => {
  let classId: string;
  let subjectId: string;
  let teacherId: string;
  const url = process.env.WEB_APP_URL!;

  test.beforeAll(async () => {
    await cleanupTestData();
    classId = await seedTestClass({ suffix: 'us014_c1', level: 'ป.1', section: '1' });
    subjectId = await seedTestSubject({ suffix: 'us014_eng', name: 'ภาษาอังกฤษทดสอบ014', code: 'TST014', group: 1 });
    teacherId = await seedTestUser({ suffix: 'us014_teacher', role: 'teacher', password: 'test1234', full_name: 'test_ครูUS014' });
    await seedTestEnrollment({
      suffix: 'us014_enr1',
      class_id: classId,
      subject_id: subjectId,
      teacher_user_id: teacherId,
    });
    // Seed one student with summative data so the report is non-empty
    await seedTestStudent({ class_suffix: 'us014_c1', seq: 1, full_name: 'test_นักเรียนUS014' });
    await seedTestSummative({
      student_id: 'test_student_us014_c1_1',
      subject_id: subjectId,
      total: 82,
    });
  });

  test.afterAll(async () => {
    await cleanupTestData();
  });

  test('US-014: Export PDF button visible after report loads', async ({ page }) => {
    await page.goto(`${url}?page=class_report&class_id=${classId}&subject_id=${subjectId}`);

    await expect(page.locator('#reportContent')).toBeVisible({ timeout: 20_000 });
    // Export PDF button should appear after report renders
    await expect(page.locator('#exportPdfBtn')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#exportPdfBtn')).toHaveText('Export PDF', { timeout: 5_000 });
  });

  test('US-014: clicking Export PDF opens browser print flow and shows success toast', async ({ page }) => {
    await page.goto(`${url}?page=class_report&class_id=${classId}&subject_id=${subjectId}`);

    await expect(page.locator('#reportContent')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#exportPdfBtn')).toBeVisible({ timeout: 10_000 });

    await page.evaluate(() => {
      window.print = () => {};
    });
    await page.click('#exportPdfBtn');
    await expect(page.locator('#toast')).toContainText('ดาวน์โหลด PDF สำเร็จ', { timeout: 60_000 });
  });
});

// ---- US-011: Characteristics scoring (คุณลักษณะ) ----

test.describe('US-011: Characteristics scoring', () => {
  let classId: string;
  let subjectId: string;
  let studentId: string;
  let teacherId: string;
  const url = process.env.WEB_APP_URL!;

  test.beforeAll(async () => {
    await cleanupTestData();
    classId = await seedTestClass({ suffix: 'us011_c1', level: 'ป.1', section: '1' });
    subjectId = await seedTestSubject({ suffix: 'us011_eng', name: 'ภาษาอังกฤษทดสอบ011', code: 'TST011', group: 1 });
    studentId = await seedTestStudent({ class_suffix: 'us011_c1', seq: 1, full_name: 'test_นักเรียนUS011' });
    teacherId = await seedTestUser({ suffix: 'us011_teacher', role: 'teacher', password: 'test1234', full_name: 'test_ครูUS011' });
    await seedTestEnrollment({
      suffix: 'us011_enr1',
      class_id: classId,
      subject_id: subjectId,
      teacher_user_id: teacherId,
    });
  });

  test.afterAll(async () => {
    await cleanupTestData();
  });

  test('US-011: characteristics page loads with student row and trait columns', async ({ page }) => {
    await page.goto(`${url}?page=class_characteristics&class_id=${classId}&subject_id=${subjectId}`);

    await expect(page.locator('#pageHeading')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#pageHeading')).toContainText('คุณลักษณะอันพึงประสงค์', { timeout: 15_000 });
    await expect(page.locator('#charTable')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#charBody')).toContainText('test_นักเรียนUS011', { timeout: 15_000 });
    // 8 trait columns visible in header
    await expect(page.locator('#charHead')).toContainText('ที่ 1', { timeout: 10_000 });
    await expect(page.locator('#charHead')).toContainText('ที่ 8', { timeout: 10_000 });
    await expect(page.locator('#charHead')).toContainText('รวม', { timeout: 10_000 });
    await expect(page.locator('#charHead')).toContainText('ผล', { timeout: 10_000 });
    // Save bar visible (admin session)
    await expect(page.locator('#saveBar')).toBeVisible({ timeout: 10_000 });
  });

  test('US-011: enter 10,10,10,9,9,10,10,10 → total=78, label=ดีเยี่ยม', async ({ page }) => {
    await page.goto(`${url}?page=class_characteristics&class_id=${classId}&subject_id=${subjectId}`);

    await expect(page.locator('#charTable')).toBeVisible({ timeout: 20_000 });

    const traitValues = [10, 10, 10, 9, 9, 10, 10, 10];
    const inputs = page.locator('input.score-input');

    for (let i = 0; i < traitValues.length; i++) {
      await inputs.nth(i).fill(String(traitValues[i]));
      await inputs.nth(i).dispatchEvent('input');
    }

    // Total = 78, label = ดีเยี่ยม
    const totalCell = page.locator('[id^="char-total-"]').first();
    const labelCell = page.locator('[id^="char-label-"]').first();
    await expect(totalCell).toHaveText('78', { timeout: 5_000 });
    await expect(labelCell).toHaveText('ดีเยี่ยม', { timeout: 5_000 });
  });

  test('US-011: enter 8,8,8,9,9,8,9,8 → total=67, label=ดี; save and reload persists', async ({ page }) => {
    await page.goto(`${url}?page=class_characteristics&class_id=${classId}&subject_id=${subjectId}`);

    await expect(page.locator('#charTable')).toBeVisible({ timeout: 20_000 });

    const traitValues = [8, 8, 8, 9, 9, 8, 9, 8];
    const inputs = page.locator('input.score-input');

    for (let i = 0; i < traitValues.length; i++) {
      await inputs.nth(i).fill(String(traitValues[i]));
      await inputs.nth(i).dispatchEvent('input');
    }

    // Total = 67, label = ดี
    const totalCell = page.locator('[id^="char-total-"]').first();
    const labelCell = page.locator('[id^="char-label-"]').first();
    await expect(totalCell).toHaveText('67', { timeout: 5_000 });
    await expect(labelCell).toHaveText('ดี', { timeout: 5_000 });

    // Save
    await page.click('#saveBtn');
    await expect(page.locator('#toast')).toContainText('บันทึกคะแนนสำเร็จ', { timeout: 20_000 });

    // Reload and assert values persist
    await page.goto(`${url}?page=class_characteristics&class_id=${classId}&subject_id=${subjectId}`);
    await expect(page.locator('#charTable')).toBeVisible({ timeout: 20_000 });

    const reloadedInputs = page.locator('input.score-input');
    await expect(reloadedInputs.nth(0)).toHaveValue('8', { timeout: 15_000 });
    await expect(reloadedInputs.nth(3)).toHaveValue('9', { timeout: 15_000 });

    const reloadedTotal = page.locator('[id^="char-total-"]').first();
    const reloadedLabel = page.locator('[id^="char-label-"]').first();
    await expect(reloadedTotal).toHaveText('67', { timeout: 10_000 });
    await expect(reloadedLabel).toHaveText('ดี', { timeout: 10_000 });
  });
});
