import { test, expect } from './helpers/custom-test';
import {
  cleanupTestData, queryTestRows, seedTestClass,
  seedTestEnrollment, seedTestStudent, seedTestSubject,
  seedTestSubjectSchedule, seedTestUser,
} from './helpers/seed';

const url = process.env.WEB_APP_URL!;

test.describe('Scheduled attendance', () => {
  let classId: string;
  let subjectId: string;
  let unconfiguredSubjectId: string;
  let studentId: string;
  let teacherId: string;

  test.beforeAll(async () => {
    await cleanupTestData();
    classId = await seedTestClass({ suffix: 'period_att', level: 'ป.2', section: '1' });
    subjectId = await seedTestSubject({ suffix: 'period_att', class_id: classId, name: 'วิชาทดสอบการเข้าเรียน' });
    unconfiguredSubjectId = await seedTestSubject({ suffix: 'period_att_empty', class_id: classId, name: 'วิชาที่ยังไม่มีตารางเรียน' });
    studentId = await seedTestStudent({ class_suffix: 'period_att', seq: 1, full_name: 'test_นักเรียนคาบเรียน' });
    await seedTestStudent({ class_suffix: 'period_att', seq: 2, full_name: 'test_นักเรียนอีกคน' });
    teacherId = await seedTestUser({ suffix: 'period_att', role: 'teacher', full_name: 'test_ครูคาบเรียน' });
    await seedTestEnrollment({ suffix: 'period_att', class_id: classId, subject_id: subjectId, teacher_user_id: teacherId });
    await seedTestEnrollment({ suffix: 'period_att_empty', class_id: classId, subject_id: unconfiguredSubjectId, teacher_user_id: teacherId });
    await seedTestSubjectSchedule({ class_id: classId, subject_id: subjectId, created_by: teacherId, day_of_week: 'MON', period: 3 });
    await seedTestSubjectSchedule({ class_id: classId, subject_id: subjectId, created_by: teacherId, day_of_week: 'FRI', period: 1 });
    await seedTestSubjectSchedule({ class_id: classId, subject_id: subjectId, created_by: teacherId, day_of_week: 'FRI', period: 2 });
  });

  test.afterAll(async () => { await cleanupTestData(); });

  test('an unconfigured subject shows a Thai empty state instead of a weekday grid', async ({ page }) => {
    await page.goto(`${url}?page=class_attendance&class_id=${classId}&subject_id=${unconfiguredSubjectId}&week=1`);
    await expect(page.locator('#scheduleEmpty')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#scheduleEmpty')).toContainText('ยังไม่ได้ตั้งค่าคาบเรียนสำหรับวิชานี้');
    await expect(page.locator('#attTable')).toBeHidden();
    await expect(page.locator('#attBody .att-cell')).toHaveCount(0);
  });

  test('shows only teaching sessions and no attendance copy', async ({ page }) => {
    await page.goto(`${url}?page=class_attendance&class_id=${classId}&subject_id=${subjectId}&week=1`);
    await expect(page.locator('#attTable')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#openScheduleBtn')).toBeVisible();
    await expect(page.locator('#openCopyBtn')).toHaveCount(0);
    const sessions = await page.locator('.attendance-date-fill-link').evaluateAll(elements =>
      elements.map(el => ({ date: el.getAttribute('data-date'), period: Number(el.getAttribute('data-period')) })));
    expect(sessions.length).toBeGreaterThanOrEqual(2);
    expect(sessions.every(item => {
      const day = new Date(`${item.date}T00:00:00`).getDay();
      return (day === 1 && item.period === 3) || (day === 5 && [1, 2].includes(item.period));
    })).toBe(true);
    const friday = sessions.filter(item => new Date(`${item.date}T00:00:00`).getDay() === 5);
    expect(friday.map(item => item.period)).toEqual([1, 2]);
  });

  test('saves two periods on one date independently and counts both', async ({ page }) => {
    await page.goto(`${url}?page=class_attendance&class_id=${classId}&subject_id=${subjectId}&week=1`);
    await expect(page.locator('#attTable')).toBeVisible({ timeout: 20_000 });
    const fridayDate = await page.locator('.attendance-date-fill-link[data-period="1"]').getAttribute('data-date');
    const first = page.locator(`#attBody .att-cell[data-student="${studentId}"][data-date="${fridayDate}"][data-period="1"]`);
    const second = page.locator(`#attBody .att-cell[data-student="${studentId}"][data-date="${fridayDate}"][data-period="2"]`);
    await first.click();
    await second.click(); await second.click(); await second.click();
    await expect(first).toHaveText('/');
    await expect(second).toHaveText('ข');
    await page.locator('#saveBtn').click();
    await expect(page.locator('#toast')).toContainText('บันทึกการเข้าเรียนสำเร็จ', { timeout: 30_000 });
    await page.reload();
    await expect(first).toHaveText('/', { timeout: 20_000 });
    await expect(second).toHaveText('ข');
    const rows = (await queryTestRows('Attendance', 'student_id')).filter(row => row.student_id === studentId && row.subject_id === subjectId && row.date === fridayDate);
    expect(rows.map(row => Number(row.period)).sort()).toEqual([1, 2]);
    await expect(page.locator(`[data-student-present="${studentId}"]`)).toHaveText('1');
    await expect(page.locator(`[data-student-absent="${studentId}"]`)).toHaveText('1');
    const report = await page.evaluate(() => new Promise<any>((resolve, reject) => {
      const app = globalThis as any;
      app.google.script.run.withSuccessHandler(resolve).withFailureHandler(reject)
        .getReportBookData(app.TOKEN, app.CLASS_ID, app.SUBJECT_ID);
    }));
    const student = report.attendance_students.find((row: any) => row.student_id === studentId);
    expect(student.present).toBe(1);
    expect(student.absent).toBe(1);
    expect(student.attendance[`${fridayDate}|1`]).toBe('/');
    expect(student.attendance[`${fridayDate}|2`]).toBe('ข');
  });

  test('one session bulk action leaves the other period untouched', async ({ page }) => {
    await page.goto(`${url}?page=class_attendance&class_id=${classId}&subject_id=${subjectId}&week=1`);
    await expect(page.locator('#attTable')).toBeVisible({ timeout: 20_000 });
    const fridayDate = await page.locator('.attendance-date-fill-link[data-period="1"]').getAttribute('data-date');
    await page.locator(`.attendance-date-fill-link[data-date="${fridayDate}"][data-period="1"]`).click();
    const secondStudent = page.locator('#attBody tr').nth(1);
    await expect(secondStudent.locator(`.att-cell[data-date="${fridayDate}"][data-period="1"]`)).toHaveText('/');
    await expect(secondStudent.locator(`.att-cell[data-date="${fridayDate}"][data-period="2"]`)).toHaveText('');
    await page.locator('#markAllPresentBtn').click();
    await expect(secondStudent.locator(`.att-cell[data-date="${fridayDate}"][data-period="2"]`)).toHaveText('/');
  });

  test('rejects invalid and unscheduled periods on the server', async ({ page }) => {
    await page.goto(`${url}?page=class_attendance&class_id=${classId}&subject_id=${subjectId}&week=1`);
    await expect(page.locator('#attTable')).toBeVisible({ timeout: 20_000 });
    const date = await page.locator('.attendance-date-fill-link[data-period="1"]').getAttribute('data-date');
    for (const period of [0, -1, 99]) {
      const error = await page.evaluate(({ studentId, date, period }) => new Promise<string>(resolve => {
        const app = globalThis as any;
        app.google.script.run.withSuccessHandler(() => resolve('บันทึกสำเร็จ'))
          .withFailureHandler((err: { message?: string }) => resolve(err.message || 'ข้อผิดพลาด'))
          .serverSaveAttendance(app.TOKEN, app.CLASS_ID, app.SUBJECT_ID, [{ student_id: studentId, date, period, status: '/' }]);
      }), { studentId, date, period });
      expect(error).not.toBe('บันทึกสำเร็จ');
    }
  });

  test('schedule editor supports multiple periods and warns before changing existing data', async ({ page }) => {
    await page.goto(`${url}?page=class_attendance&class_id=${classId}&subject_id=${subjectId}&week=1`);
    await expect(page.locator('#attTable')).toBeVisible({ timeout: 20_000 });
    await page.locator('#openScheduleBtn').click();
    await expect(page.locator('#scheduleModal')).toHaveClass(/open/);
    await expect(page.locator('input[data-day="FRI"][data-period="1"]')).toBeChecked();
    await expect(page.locator('input[data-day="FRI"][data-period="2"]')).toBeChecked();
    await page.locator('input[data-day="WED"][data-period="4"]').check();
    await page.locator('#saveScheduleBtn').click();
    await expect(page.locator('#scheduleWarning')).toBeVisible();
    await page.locator('#saveScheduleBtn').click();
    await expect(page.locator('#toast')).toContainText('บันทึกตารางเรียนสำเร็จ', { timeout: 30_000 });
    const rows = (await queryTestRows('Attendance', 'student_id')).filter(row => row.student_id === studentId && row.subject_id === subjectId);
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });

  test('week navigation still works', async ({ page }) => {
    await page.goto(`${url}?page=class_attendance&class_id=${classId}&subject_id=${subjectId}&week=1`);
    await expect(page.locator('#attTable')).toBeVisible({ timeout: 20_000 });
    await page.locator('#nextWeekBtn').click();
    await expect(page.locator('#weekLabel')).toContainText('สัปดาห์ที่ 2', { timeout: 20_000 });
    await page.locator('#prevWeekBtn').click();
    await expect(page.locator('#weekLabel')).toContainText('สัปดาห์ที่ 1', { timeout: 20_000 });
  });
});
