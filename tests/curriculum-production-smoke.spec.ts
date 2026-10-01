import { test, expect } from './helpers/custom-test';
import {
  cleanupTestData, seedTestClass, seedTestSubject, seedTestUser,
  seedTestEnrollment, seedTestStudent, seedLearningOutcome,
  seedLearningOutcomeScore, seedTermAssessment,
} from './helpers/seed';

test.use({ storageState: { cookies: [], origins: [] } });

test('P1 curriculum initializes and renders annual report', async ({ page }) => {
  test.setTimeout(180_000);
  const url = process.env.WEB_APP_URL!;
  const suffix = 'curriculum_prod_smoke';
  await cleanupTestData();
  try {
    const classId = await seedTestClass({ suffix, level: 'ป.1', section: '1' });
    const subjectId = await seedTestSubject({ suffix, class_id: classId });
    const teacherId = await seedTestUser({ suffix });
    await seedTestEnrollment({ suffix, class_id: classId, subject_id: subjectId, teacher_user_id: teacherId });
    const studentId = await seedTestStudent({ class_suffix: suffix, seq: 1 });

    await page.goto(url);
    await expect(page.locator('#loginBtn')).toBeVisible({ timeout: 30_000 });
    await page.fill('#username', teacherId);
    await page.fill('#password', 'test1234');
    await page.click('#loginBtn');
    await expect(page.locator('h2')).toContainText('ยินดีต้อนรับ', { timeout: 30_000 });

    await page.goto(`${url}?page=class_formative&class_id=${classId}&subject_id=${subjectId}`);
    await expect(page.locator('#pageHeading')).toContainText('ผลลัพธ์การเรียนรู้', { timeout: 30_000 });
    await expect(page.locator('#loadingMsg')).toBeHidden({ timeout: 30_000 });

    const first = await seedLearningOutcome({ suffix: `${suffix}_1`, subject_id: subjectId, term: 1, code: '1', max_score: 40 });
    const second = await seedLearningOutcome({ suffix: `${suffix}_2`, subject_id: subjectId, term: 2, code: '2', max_score: 60 });
    await seedLearningOutcomeScore(studentId, subjectId, first, 27);
    await seedLearningOutcomeScore(studentId, subjectId, second, 48);
    await seedTermAssessment(studentId, subjectId, 1, 12);
    await seedTermAssessment(studentId, subjectId, 2, 14);

    await page.goto(`${url}?page=class_report&class_id=${classId}&subject_id=${subjectId}`);
    await expect(page.locator('.a4-report-book')).toContainText('78', { timeout: 30_000 });
    await expect(page.locator('.a4-report-book')).toContainText('เชี่ยวชาญ');
  } finally {
    await cleanupTestData();
  }
});
