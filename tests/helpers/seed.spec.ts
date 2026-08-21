/**
 * US-022: Self-test for the seed/cleanup helpers.
 * Seeds one of each entity type, asserts it appears via query_rows,
 * cleans up, then asserts no test_ rows remain.
 *
 * Run with:
 *   npx playwright test tests/helpers/seed.spec.ts
 *
 * Required env vars: WEB_APP_URL, TEST_API_TOKEN
 */
import { test, expect } from './custom-test';
import {
  seedTestClass,
  seedTestSubject,
  seedTestStudent,
  seedTestUser,
  seedTestEnrollment,
  cleanupTestData,
  queryTestRows,
} from './seed';

test.describe('US-022: seed helpers self-test', () => {
  let classId: string;
  let subjectId: string;
  let studentId: string;
  let userId: string;
  let enrollmentId: string;

  test.beforeAll(async () => {
    // Ensure clean slate before seeding
    await cleanupTestData();

    classId = await seedTestClass({ suffix: 'us022_c', level: 'ป.2', section: '1' });
    subjectId = await seedTestSubject({ suffix: 'us022_s', name: 'วิชาทดสอบ 022', code: 'TST022' });
    studentId = await seedTestStudent({ class_suffix: 'us022_c', seq: 1, full_name: 'นักเรียน ทดสอบ' });
    userId = await seedTestUser({ suffix: 'us022_u', role: 'teacher', password: 'pw022test' });
    enrollmentId = await seedTestEnrollment({
      suffix: 'us022_e',
      class_id: classId,
      subject_id: subjectId,
      teacher_user_id: userId,
    });
  });

  test.afterAll(async () => {
    await cleanupTestData();
  });

  test('seedTestClass: seeded class appears in Classes tab', async () => {
    const rows = await queryTestRows('Classes', 'class_id');
    const ids = rows.map((r) => r['class_id']);
    expect(ids).toContain(classId);
  });

  test('seedTestSubject: seeded subject appears in Subjects tab', async () => {
    const rows = await queryTestRows('Subjects', 'subject_id');
    const ids = rows.map((r) => r['subject_id']);
    expect(ids).toContain(subjectId);
  });

  test('seedTestStudent: seeded student appears in Students tab', async () => {
    const rows = await queryTestRows('Students', 'student_id');
    const ids = rows.map((r) => r['student_id']);
    expect(ids).toContain(studentId);
  });

  test('seedTestUser: seeded user appears in Users tab', async () => {
    const rows = await queryTestRows('Users', 'user_id');
    const ids = rows.map((r) => r['user_id']);
    expect(ids).toContain(userId);
  });

  test('seedTestEnrollment: seeded enrollment appears in Enrollments tab', async () => {
    const rows = await queryTestRows('Enrollments', 'enrollment_id');
    const ids = rows.map((r) => r['enrollment_id']);
    expect(ids).toContain(enrollmentId);
  });

  test('all seeded IDs start with test_', () => {
    for (const id of [classId, subjectId, studentId, userId, enrollmentId]) {
      expect(id).toMatch(/^test_/);
    }
  });

  test('cleanupTestData: no test_ rows remain after cleanup', async () => {
    await cleanupTestData();

    // All tabs that can hold test_ rows
    const tabs = [
      { tab: 'Classes', field: 'class_id' },
      { tab: 'Subjects', field: 'subject_id' },
      { tab: 'Students', field: 'student_id' },
      { tab: 'Users', field: 'user_id' },
      { tab: 'Enrollments', field: 'enrollment_id' },
    ];

    for (const { tab, field } of tabs) {
      const rows = await queryTestRows(tab, field);
      expect(rows, `Expected 0 test_ rows in ${tab} after cleanup`).toHaveLength(0);
    }
  });
});
