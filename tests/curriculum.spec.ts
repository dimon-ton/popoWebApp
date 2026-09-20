import { test, expect } from './helpers/custom-test';
import {
  seedTestClass, seedTestSubject, seedTestStudent, seedTestUser, seedTestEnrollment,
  seedTestSummative, seedLearningOutcome, seedLearningOutcomeScore,
  seedTermAssessment, cleanupTestData,
} from './helpers/seed';

test.describe('P1–P3 learning outcomes and report', () => {
  let classId: string, subjectId: string, studentId: string;
  const url = process.env.WEB_APP_URL!;

  test.beforeAll(async () => {
    await cleanupTestData();
    classId = await seedTestClass({ suffix: 'curriculum_c1', level: 'ป.1', section: '1' });
    subjectId = await seedTestSubject({ suffix: 'curriculum_s1', class_id: classId, name: 'วิชาทดสอบหลักสูตรใหม่' });
    const teacherId = await seedTestUser({ suffix: 'curriculum_teacher', role: 'teacher' });
    await seedTestEnrollment({ suffix: 'curriculum_enrollment', class_id: classId, subject_id: subjectId, teacher_user_id: teacherId });
    studentId = await seedTestStudent({ class_suffix: 'curriculum_c1', seq: 1, full_name: 'test_นักเรียนหลักสูตรใหม่' });
    const first = await seedLearningOutcome({ suffix: 'curriculum_1', subject_id: subjectId, term: 1, code: '1', max_score: 40 });
    const second = await seedLearningOutcome({ suffix: 'curriculum_2', subject_id: subjectId, term: 2, code: '2', max_score: 60 });
    await seedLearningOutcomeScore(studentId, subjectId, first, 27);
    await seedLearningOutcomeScore(studentId, subjectId, second, 48);
    await seedTermAssessment(studentId, subjectId, 1, 12);
    await seedTermAssessment(studentId, subjectId, 2, 14);
    await seedTestSummative({ student_id: studentId, subject_id: subjectId, total: 99 });
  });

  test.afterAll(async () => { await cleanupTestData(); });

  test('existing score URLs show the new term editor', async ({ page }) => {
    await page.goto(`${url}?page=class_formative&class_id=${classId}&subject_id=${subjectId}`);
    await expect(page.locator('#pageHeading')).toContainText('ผลลัพธ์การเรียนรู้');
    await expect(page.locator('#outcomeOrder')).toBeVisible();
    await expect(page.locator('#outcomeCode')).toHaveCount(0);
    await expect(page.locator('#scoreBody')).toContainText('36');
    await page.goto(`${url}?page=class_summative&class_id=${classId}&subject_id=${subjectId}`);
    await expect(page.locator('#termSelect')).toBeVisible();
  });

  test('report uses new term and annual results instead of legacy grade', async ({ page }) => {
    await page.goto(`${url}?page=class_report&class_id=${classId}&subject_id=${subjectId}`);
    await expect(page.locator('#reportContent')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.a4-report-book')).toContainText('ผลลัพธ์การเรียนรู้รายวิชา');
    await expect(page.locator('.a4-report-book')).toContainText('สรุปผลการประเมิน');
    await expect(page.locator('.a4-report-book')).toContainText('78');
    await expect(page.locator('.a4-report-book')).toContainText('เชี่ยวชาญ');
    await expect(page.locator('.a4-report-book')).not.toContainText('สอบกลางภาค');
  });
});
