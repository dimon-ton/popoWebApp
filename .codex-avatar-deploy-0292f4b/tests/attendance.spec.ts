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
  seedCompleteTestAttendance,
  queryTestRows,
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
    await seedTestStudent({ class_suffix: 'us007_c1', seq: 2, full_name: 'test_นักเรียนUS007_2' });
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

  test('US-007: date heading tooltip and click fills blank cells in that column', async ({ page }) => {
    await page.goto(`${url}?page=class_attendance&class_id=${classId}&subject_id=${subjectId}&week=1`);

    await expect(page.locator('#attTable')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#attBody')).toContainText('test_นักเรียนUS007_2', { timeout: 15_000 });

    const secondDateLink = page.locator('.attendance-date-fill-link').nth(1);
    await expect(secondDateLink).toHaveAttribute('data-tooltip', 'คลิกเพื่อเช็คช่องว่างของวันนี้เป็นมาเรียน');

    await secondDateLink.hover();
    await page.waitForTimeout(200);
    const tooltipState = await secondDateLink.evaluate((el) => {
      const style = el.ownerDocument.defaultView!.getComputedStyle(el, '::after');
      return { content: style.content, opacity: style.opacity };
    });
    expect(tooltipState.content).toContain('คลิกเพื่อเช็คช่องว่างของวันนี้เป็นมาเรียน');
    expect(Number(tooltipState.opacity)).toBeGreaterThan(0);

    const firstStudentSecondDate = page.locator('#attBody tr').first().locator('.att-cell').nth(1);
    const secondStudentSecondDate = page.locator('#attBody tr').nth(1).locator('.att-cell').nth(1);
    await expect(firstStudentSecondDate).toHaveText('ล');
    await expect(secondStudentSecondDate).toHaveText('');

    await secondDateLink.click();
    await expect(firstStudentSecondDate).toHaveText('ล');
    await expect(secondStudentSecondDate).toHaveText('/');
    await expect(page.locator('#attFoot td').nth(2)).toContainText('1/1/0');

    await page.click('#saveBtn');
    await expect(page.locator('#toast')).toContainText('บันทึกการเข้าเรียนสำเร็จ', { timeout: 20_000 });

    await page.goto(`${url}?page=class_attendance&class_id=${classId}&subject_id=${subjectId}&week=1`);
    await expect(page.locator('#attTable')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#attBody tr').nth(1).locator('.att-cell').nth(1)).toHaveText('/', { timeout: 15_000 });
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

// ---- Cross-subject full-year attendance copy ----

test.describe('Attendance copy from another subject', () => {
  let classId: string;
  let destinationSubjectId: string;
  let sourceSubjectId: string;
  let incompleteSubjectId: string;
  let teacherId: string;
  const url = process.env.WEB_APP_URL!;

  test.beforeAll(async () => {
    await cleanupTestData();
    classId = await seedTestClass({ suffix: 'attendance_copy', level: 'ป.2', section: '1' });
    destinationSubjectId = await seedTestSubject({ suffix: 'attendance_copy_dest', name: 'วิชาปลายทางการเข้าเรียน', class_id: classId });
    sourceSubjectId = await seedTestSubject({ suffix: 'attendance_copy_source', name: 'วิชาต้นทางการเข้าเรียน', class_id: classId });
    incompleteSubjectId = await seedTestSubject({ suffix: 'attendance_copy_incomplete', name: 'วิชาการเข้าเรียนไม่ครบ', class_id: classId });
    teacherId = await seedTestUser({ suffix: 'attendance_copy_teacher', role: 'teacher', full_name: 'test_ครูสอนหลายวิชา' });
    await seedTestStudent({ class_suffix: 'attendance_copy', seq: 1, full_name: 'test_นักเรียนนำเข้า 1' });
    await seedTestStudent({ class_suffix: 'attendance_copy', seq: 2, full_name: 'test_นักเรียนนำเข้า 2' });
    await seedTestEnrollment({ suffix: 'attendance_copy_dest', class_id: classId, subject_id: destinationSubjectId, teacher_user_id: teacherId });
    await seedTestEnrollment({ suffix: 'attendance_copy_source', class_id: classId, subject_id: sourceSubjectId, teacher_user_id: teacherId });
    await seedTestEnrollment({ suffix: 'attendance_copy_incomplete', class_id: classId, subject_id: incompleteSubjectId, teacher_user_id: teacherId });
    await seedCompleteTestAttendance({ class_id: classId, subject_id: sourceSubjectId, updated_by: teacherId, status: '/' });
    await seedCompleteTestAttendance({ class_id: classId, subject_id: destinationSubjectId, updated_by: teacherId, status: 'ล' });
  });

  test.afterAll(async () => {
    await cleanupTestData();
  });

  test('stages a complete school year, preserves it across weeks, and saves only after confirmation', async ({ page }) => {
    await page.goto(`${url}?page=class_attendance&class_id=${classId}&subject_id=${destinationSubjectId}&week=1`);
    await expect(page.locator('#attTable')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#attBody .att-cell').first()).toHaveText('ล');

    await page.locator('#openCopyBtn').click();
    await expect(page.locator('#sourceModal')).toHaveClass(/open/);
    await expect(page.locator('#sourceList')).toContainText('วิชาต้นทางการเข้าเรียน', { timeout: 30_000 });
    await expect(page.locator('#sourceList')).not.toContainText('วิชาการเข้าเรียนไม่ครบ');
    await page.locator(`input[name="attendanceSource"][value="${sourceSubjectId}"]`).check();
    await page.locator('#confirmSourceBtn').click();
    await expect(page.locator('#replaceWarning')).toBeVisible();
    await page.locator('#confirmSourceBtn').click();

    await expect(page.locator('#sourceModal')).not.toHaveClass(/open/, { timeout: 30_000 });
    await expect(page.locator('#importBanner')).toBeVisible();
    await expect(page.locator('#attBody .att-cell').first()).toHaveText('/');

    const rowsBeforeSave = await queryTestRows('Attendance', 'subject_id');
    const destinationBeforeSave = rowsBeforeSave.filter(row => row.subject_id === destinationSubjectId);
    expect(destinationBeforeSave.length).toBeGreaterThan(0);
    expect(destinationBeforeSave.every(row => row.status === 'ล')).toBe(true);

    await page.locator('#nextWeekBtn').click();
    await expect(page.locator('#weekLabel')).toContainText('สัปดาห์ที่ 2', { timeout: 20_000 });
    await expect(page.locator('#attBody .att-cell').first()).toHaveText('/');
    await expect(page.locator('#importBanner')).toBeVisible();

    await page.locator('#saveBtn').click();
    await expect(page.locator('#toast')).toContainText('บันทึกการเข้าเรียนสำเร็จ', { timeout: 60_000 });
    await expect(page.locator('#importBanner')).toBeHidden();

    const rowsAfterSave = await queryTestRows('Attendance', 'subject_id');
    const destinationAfterSave = rowsAfterSave.filter(row => row.subject_id === destinationSubjectId);
    expect(destinationAfterSave.length).toBe(destinationBeforeSave.length);
    expect(destinationAfterSave.every(row => row.status === '/')).toBe(true);
  });

  test('backend rejects an incomplete source subject', async ({ page }) => {
    await page.goto(`${url}?page=class_attendance&class_id=${classId}&subject_id=${destinationSubjectId}&week=1`);
    await expect(page.locator('#attTable')).toBeVisible({ timeout: 20_000 });
    const result = await page.evaluate((sourceId) => new Promise<{ error?: string }>((resolve) => {
      const app = globalThis as any;
      app.google.script.run
        .withSuccessHandler((value: unknown) => resolve({ error: `unexpected success: ${JSON.stringify(value)}` }))
        .withFailureHandler((error: { message?: string }) => resolve({ error: error.message || String(error) }))
        .getAttendanceSourceValues(app.TOKEN, app.CLASS_ID, app.SUBJECT_ID, sourceId);
    }), incompleteSubjectId);
    expect(result.error).toContain('ข้อมูลยังไม่ครบถ้วน');
  });
});
