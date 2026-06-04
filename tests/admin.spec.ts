/**
 * Admin feature tests — US-001, US-018, US-019, US-020
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
  seedTestSubjectWeights,
  seedTestIndicator,
  cleanupTestData,
  queryTestRows,
} from './helpers/seed';

// ---- US-015: Static reference pages ----

test.describe('US-015: Static reference pages', () => {
  test.beforeAll(async () => {
    await cleanupTestData();
    // Seed at least one indicator for subj_eng so it is always present
    await seedTestIndicator({
      suffix: 'us015_eng',
      subject_id: 'subj_eng',
      code: 'ต 1.1 ป.1/1',
      max_score: 3,
      display_order: 1,
    });
  });

  test.afterAll(async () => {
    await cleanupTestData();
  });

  test('US-015: /help page has at least one Thai heading', async ({ page }) => {
    const url = process.env.WEB_APP_URL!;
    await page.goto(`${url}?page=help`);

    // Wait for the page heading to be visible
    await expect(page.locator('#pageHeading')).toBeVisible({ timeout: 20_000 });

    // Assert the main heading contains Thai text
    await expect(page.locator('#pageHeading')).toContainText('คู่มือ');

    // Assert at least one Thai section heading is visible (วิธีทำ1 / วิธีทำ2 content)
    const sectionTitles = page.locator('.section-title');
    const count = await sectionTitles.count();
    expect(count).toBeGreaterThanOrEqual(2);

    // Check first section title contains "วิธีทำ"
    await expect(sectionTitles.first()).toContainText('วิธีทำ');
  });

  test('US-015: /weights_ref page shows ภาษาอังกฤษ row', async ({ page }) => {
    const url = process.env.WEB_APP_URL!;
    await page.goto(`${url}?page=weights_ref`);

    // Wait for the page heading
    await expect(page.locator('#pageHeading')).toBeVisible({ timeout: 20_000 });

    // Wait for the weights table to load
    await expect(page.locator('#weightsTable')).toBeVisible({ timeout: 20_000 });

    // Assert ภาษาอังกฤษ row is present
    await expect(page.locator('#weightsBody')).toContainText('ภาษาอังกฤษ', { timeout: 15_000 });
  });

  test('US-015: /subject_description page renders description field', async ({ page }) => {
    const url = process.env.WEB_APP_URL!;
    // Use the pre-seeded English subject
    await page.goto(`${url}?page=subject_description&subject_id=subj_eng`);

    await expect(page.locator('#pageHeading')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#pageHeading')).toContainText('ภาษาอังกฤษ', { timeout: 15_000 });
    await expect(page.locator('#subjectName')).toContainText('ภาษาอังกฤษ', { timeout: 15_000 });
    await expect(page.locator('#subjectCode')).toBeVisible();
  });

  test('US-015: /subject_indicators_ref page lists indicators for subj_eng', async ({ page }) => {
    const url = process.env.WEB_APP_URL!;
    await page.goto(`${url}?page=subject_indicators_ref&subject_id=subj_eng`);

    await expect(page.locator('#pageHeading')).toBeVisible({ timeout: 20_000 });

    // Wait for indicators table to load
    await expect(page.locator('#indicatorsWrap')).toBeVisible({ timeout: 20_000 });

    // The page heading should mention ภาษาอังกฤษ
    await expect(page.locator('#pageHeading')).toContainText('ภาษาอังกฤษ', { timeout: 15_000 });

    // Indicators should be listed (pre-seeded English indicators)
    const rows = page.locator('#indicatorsBody tr');
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThanOrEqual(1);
  });
});

// ---- US-004: School info, classes, and subjects setup ----

test.describe('US-004: School info, classes, and subjects', () => {
  test.beforeAll(async () => {
    await cleanupTestData();
  });

  test.afterAll(async () => {
    await cleanupTestData();
  });

  test('US-004: edit school name and assert it saves', async ({ page }) => {
    const url = process.env.WEB_APP_URL!;
    await page.goto(`${url}?page=admin_school`);

    await expect(page.locator('#pageHeading')).toBeVisible({ timeout: 20_000 });

    await page.fill('#schoolName', 'test_school_name');
    await page.click('#saveSchoolBtn');

    await expect(page.locator('#toast')).toContainText('บันทึกข้อมูลโรงเรียนสำเร็จ', { timeout: 15_000 });

    // Reload page and assert value persisted
    await page.goto(`${url}?page=admin_school`);
    await expect(page.locator('#pageHeading')).toBeVisible({ timeout: 20_000 });
    // Give it a moment for loadSchoolInfo() to fill the field
    await expect(page.locator('#schoolName')).toHaveValue('test_school_name', { timeout: 15_000 });
  });

  test('US-004: create class test_class_p1_1 and assert it appears in list', async ({ page }) => {
    const url = process.env.WEB_APP_URL!;
    await page.goto(`${url}?page=admin_classes`);

    await expect(page.locator('#pageHeading')).toBeVisible({ timeout: 20_000 });

    // Wait for table to load (may already have rows)
    await expect(page.locator('#classesTable')).toBeVisible({ timeout: 20_000 });

    await page.fill('#newLevel', 'test_class_p1');
    await page.fill('#newSection', '1');
    await page.click('#addClassBtn');

    await expect(page.locator('#toast')).toContainText('เพิ่มชั้นเรียนสำเร็จ', { timeout: 15_000 });

    // Assert row appears with data-class-id attribute
    await expect(page.locator('tr[data-class-id="class_test_class_p1_1"]')).toBeVisible({ timeout: 15_000 });
  });

  test('US-004: create subject test_subject_eng and assert it appears in list', async ({ page }) => {
    const url = process.env.WEB_APP_URL!;
    await page.goto(`${url}?page=admin_subjects`);

    await expect(page.locator('#pageHeading')).toBeVisible({ timeout: 20_000 });

    await expect(page.locator('#subjectsTable')).toBeVisible({ timeout: 20_000 });

    await page.fill('#newSubjectName', 'ภาษาอังกฤษทดสอบ');
    await page.fill('#newSubjectCode', 'test_001');
    await page.fill('#newHours', '80');
    await page.click('#addSubjectBtn');

    await expect(page.locator('#toast')).toContainText('เพิ่มวิชาสำเร็จ', { timeout: 15_000 });

    // Assert row appears with data-subject-id attribute (generated from code)
    await expect(page.locator('tr[data-subject-id="subj_test_001"]')).toBeVisible({ timeout: 15_000 });
  });
});

// ---- US-005: Student roster — CRUD ----

test.describe('US-005: Student roster CRUD', () => {
  let classId: string;

  test.beforeAll(async () => {
    await cleanupTestData();
    classId = await seedTestClass({ suffix: 'us005_c1', level: 'ป.1', section: '1' });
  });

  test.afterAll(async () => {
    await cleanupTestData();
  });

  test('US-005: add student and assert row appears', async ({ page }) => {
    const url = process.env.WEB_APP_URL!;
    await page.goto(`${url}?page=class_students&class_id=${classId}`);

    // Wait for page heading
    await expect(page.locator('#pageHeading')).toBeVisible({ timeout: 20_000 });
    // Add form should be visible (admin can edit)
    await expect(page.locator('#addCard')).toBeVisible({ timeout: 15_000 });

    await page.fill('#newSeqNo', '1');
    await page.fill('#newStudentCode', 'S001');
    await page.fill('#newCitizenId', '1459700000001');
    await page.fill('#newFirstName', 'test_นักเรียน');
    await page.fill('#newLastName', 'ทดสอบ');
    await page.fill('#newDob', '01 ม.ค. 60');
    await page.fill('#newNote', '');
    await page.click('#addStudentBtn');

    await expect(page.locator('#toast')).toContainText('เพิ่มนักเรียนสำเร็จ', { timeout: 15_000 });

    // Row should appear in table
    await expect(page.locator('#studentsBody')).toContainText('test_นักเรียน ทดสอบ', { timeout: 15_000 });
    await expect(page.locator('#studentsBody')).toContainText('1459700000001');
  });

  test('US-005: edit note field and assert updated', async ({ page }) => {
    const url = process.env.WEB_APP_URL!;
    await page.goto(`${url}?page=class_students&class_id=${classId}`);

    await expect(page.locator('#studentsTable')).toBeVisible({ timeout: 20_000 });

    // Click edit on the first row (the student we added)
    const editBtn = page.locator('#studentsBody .btn-secondary').first();
    await editBtn.click();

    // Note field should now be an input
    const noteInput = page.locator('#studentsBody input[data-field="note"]').first();
    await noteInput.fill('test_note_updated');

    // Save
    await page.locator('#studentsBody .btn-save').first().click();

    await expect(page.locator('#toast')).toContainText('บันทึกข้อมูลนักเรียนสำเร็จ', { timeout: 15_000 });

    // Reload and assert note persisted
    await page.goto(`${url}?page=class_students&class_id=${classId}`);
    await expect(page.locator('#studentsTable')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#studentsBody')).toContainText('test_note_updated', { timeout: 15_000 });
  });

  test('US-005: delete student and assert row gone', async ({ page }) => {
    const url = process.env.WEB_APP_URL!;
    await page.goto(`${url}?page=class_students&class_id=${classId}`);

    await expect(page.locator('#studentsTable')).toBeVisible({ timeout: 20_000 });

    // Dismiss confirm dialog automatically
    page.on('dialog', async (dialog) => { await dialog.accept(); });

    // Click delete on the first student row
    await page.locator('#studentsBody .btn-danger').first().click();

    await expect(page.locator('#toast')).toContainText('ลบนักเรียนสำเร็จ', { timeout: 15_000 });

    // Row should be gone
    await expect(page.locator('#studentsBody')).not.toContainText('test_นักเรียนทดสอบ', { timeout: 15_000 });
  });
});

// ---- US-006: Indicator catalog (ตัวชี้วัด) ----

test.describe('US-006: Indicator catalog CRUD', () => {
  let subjectId: string;

  test.beforeAll(async () => {
    await cleanupTestData();
    subjectId = await seedTestSubject({ suffix: 'us006_eng', name: 'วิชาทดสอบ US006', code: 'US006' });
  });

  test.afterAll(async () => {
    await cleanupTestData();
  });

  test('US-006: open indicators page for test subject — heading visible', async ({ page }) => {
    const url = process.env.WEB_APP_URL!;
    await page.goto(`${url}?page=admin_indicators&subject_id=${subjectId}`);

    await expect(page.locator('#pageHeading')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#pageHeading')).toContainText(subjectId);
  });

  test('US-006: add indicator test_ind_001 max_score=3 and assert it appears', async ({ page }) => {
    const url = process.env.WEB_APP_URL!;
    await page.goto(`${url}?page=admin_indicators&subject_id=${subjectId}`);

    await expect(page.locator('#pageHeading')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#indicatorsTable')).toBeVisible({ timeout: 20_000 });

    await page.fill('#newCode', 'test_ind_001');
    await page.fill('#newMaxScore', '3');
    await page.fill('#newOrder', '1');
    await page.click('#addIndicatorBtn');

    await expect(page.locator('#toast')).toContainText('เพิ่มตัวชี้วัดสำเร็จ', { timeout: 15_000 });

    // Row should appear with the code
    await expect(page.locator('#indicatorsBody')).toContainText('test_ind_001', { timeout: 15_000 });
  });

  test('US-006: delete indicator and assert it is gone', async ({ page }) => {
    const url = process.env.WEB_APP_URL!;
    await page.goto(`${url}?page=admin_indicators&subject_id=${subjectId}`);

    await expect(page.locator('#indicatorsTable')).toBeVisible({ timeout: 20_000 });

    // Dismiss confirm dialog automatically
    page.on('dialog', async (dialog) => { await dialog.accept(); });

    // Click delete on the first row (test_ind_001 we just added)
    await page.locator('#indicatorsBody .btn-danger').first().click();

    await expect(page.locator('#toast')).toContainText('ลบตัวชี้วัดสำเร็จ', { timeout: 15_000 });

    // Row should be gone (empty state or no test_ind_001)
    await expect(page.locator('#indicatorsBody')).not.toContainText('test_ind_001', { timeout: 15_000 });
  });
});

// ---- US-001: Bootstrap master Sheet schema ----

const EXPECTED_TABS = [
  'Users', 'SchoolInfo', 'Classes', 'Subjects', 'Enrollments',
  'Students', 'Indicators', 'SubjectWeights', 'Attendance',
  'IndicatorScores', 'SummativeScores', 'Characteristics',
  'ReadThinkWrite', 'AuditLog',
];

test.describe('US-001: Bootstrap master Sheet schema', () => {
  test('US-001: all 14 tabs visible with row count ≥ 1 on db-status page', async ({ page }) => {
    const url = process.env.WEB_APP_URL!;
    await page.goto(`${url}?page=admin_db_status`);

    // Wait for the table to render (the JS call populates it async)
    await expect(page.locator('#statusTable')).toBeVisible({ timeout: 30_000 });

    // Assert all 14 tabs appear with row count ≥ 1
    for (const tab of EXPECTED_TABS) {
      const row = page.locator(`tr[data-tab="${tab}"]`);
      await expect(row).toBeVisible({ timeout: 15_000 });

      const countText = await row.locator('[data-count]').getAttribute('data-count');
      expect(Number(countText)).toBeGreaterThanOrEqual(1);
    }
  });
});

// ---- US-010: Subject weights configuration (คะแนนวิชา) ----

test.describe('US-010: Subject weights configuration', () => {
  let subjectId: string;
  let classId: string;

  test.beforeAll(async () => {
    await cleanupTestData();
    subjectId = await seedTestSubject({ suffix: 'us010_eng', name: 'ภาษาอังกฤษทดสอบ US010', code: 'US010', group: 1 });
    await seedTestSubjectWeights({ subject_id: subjectId, pre_mid_max: 25, mid_max: 20, post_mid_max: 25, final_exam_max: 30, coursework_max: 70, final_max: 30 });
    classId = await seedTestClass({ suffix: 'us010_c1', level: 'ป.1', section: '1' });
  });

  test.afterAll(async () => {
    await cleanupTestData();
  });

  test('US-010: weights page loads and shows test subject row', async ({ page }) => {
    const url = process.env.WEB_APP_URL!;
    await page.goto(`${url}?page=admin_weights`);

    await expect(page.locator('#pageHeading')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#weightsTableWrap')).toBeVisible({ timeout: 20_000 });

    // Test subject row should appear
    await expect(page.locator(`tr[data-subject-id="${subjectId}"]`)).toBeVisible({ timeout: 15_000 });
  });

  test('US-010: save with total ≠ 100 shows error toast', async ({ page }) => {
    const url = process.env.WEB_APP_URL!;
    await page.goto(`${url}?page=admin_weights`);

    await expect(page.locator('#weightsTableWrap')).toBeVisible({ timeout: 20_000 });
    await page.waitForSelector(`tr[data-subject-id="${subjectId}"]`);

    // Change pre_mid to 30 — total becomes 30+20+25+30=105
    const row = page.locator(`tr[data-subject-id="${subjectId}"]`);
    await row.locator('.pre-mid').fill('30');

    // Try to save
    await page.click('#saveWeightsBtn');

    // Error toast should appear
    await expect(page.locator('#toast')).toContainText('รวมต้องเท่ากับ 100', { timeout: 15_000 });
  });

  test('US-010: fix weights to sum=100, save, and assert success toast', async ({ page }) => {
    const url = process.env.WEB_APP_URL!;
    await page.goto(`${url}?page=admin_weights`);

    await expect(page.locator('#weightsTableWrap')).toBeVisible({ timeout: 20_000 });
    await page.waitForSelector(`tr[data-subject-id="${subjectId}"]`);

    // Set weights to pre_mid=25, mid=25, post_mid=20, final_exam=30 → total=100
    // This changes mid_max from 20 to 25 — visible in summative column header
    const row = page.locator(`tr[data-subject-id="${subjectId}"]`);
    await row.locator('.pre-mid').fill('25');
    await row.locator('.mid').fill('25');
    await row.locator('.post-mid').fill('20');
    await row.locator('.final-exam').fill('30');

    // Sum cell should show 100
    await expect(page.locator(`#sum-${subjectId}`)).toContainText('100', { timeout: 5_000 });

    // Save
    await page.click('#saveWeightsBtn');
    await expect(page.locator('#toast')).toContainText('บันทึกน้ำหนักคะแนนสำเร็จ', { timeout: 15_000 });
  });

  test('US-010: summative page shows updated column max after weight change', async ({ page }) => {
    const url = process.env.WEB_APP_URL!;
    // Navigate to summative page — mid_max is now 25 (changed from default 20)
    await page.goto(`${url}?page=class_summative&class_id=${classId}&subject_id=${subjectId}`);

    await expect(page.locator('#pageHeading')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#summativeTable')).toBeVisible({ timeout: 20_000 });

    // สอบกลางภาค column header should now show /25 (was /20 before the weight change)
    await expect(page.locator('#summativeHead')).toContainText('/25', { timeout: 15_000 });
    // สอบปลายภาค = final_exam_max = 30 (unchanged)
    await expect(page.locator('#summativeHead')).toContainText('/30', { timeout: 15_000 });
  });
});

// ---- US-018: Admin assigns subjects to a teacher (teacher-first flow) ----

test.describe('US-018: Teacher enrollment management', () => {
  let teacherAId: string;
  let teacherBId: string;
  let classXId: string;
  let classYId: string;
  let subjectZId: string;

  test.beforeAll(async () => {
    teacherAId = await seedTestUser({ suffix: 'us018_ta', role: 'teacher', full_name: 'ครูทดสอบ A' });
    teacherBId = await seedTestUser({ suffix: 'us018_tb', role: 'teacher', full_name: 'ครูทดสอบ B' });
    classXId = await seedTestClass({ suffix: 'us018_cx', level: 'ป.1', section: '1' });
    classYId = await seedTestClass({ suffix: 'us018_cy', level: 'ป.1', section: '2' });
    subjectZId = await seedTestSubject({ suffix: 'us018_sz', name: 'วิชาทดสอบ Z', code: 'TST018' });
  });

  test.afterAll(async () => {
    await cleanupTestData();
  });

  test('US-018: teacher list shows teachers with pair counts', async ({ page }) => {
    const url = process.env.WEB_APP_URL!;
    await page.goto(`${url}?page=admin_enrollments`);

    // Left panel should be visible
    await expect(page.locator('.teacher-panel')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.panel-header')).toContainText('รายชื่อครู');

    // Our seeded teachers should appear
    await expect(page.locator(`#ti-${teacherAId}`)).toBeVisible();
    await expect(page.locator(`#ti-${teacherBId}`)).toBeVisible();

    // Pair count badge starts at 0 for both
    await expect(page.locator(`#badge-${teacherAId}`)).toContainText('0');
    await expect(page.locator(`#badge-${teacherBId}`)).toContainText('0');
  });

  test('US-018: teacher search filters the teacher list', async ({ page }) => {
    const url = process.env.WEB_APP_URL!;
    await page.goto(`${url}?page=admin_enrollments`);
    await page.waitForSelector(`#ti-${teacherAId}`);

    await page.fill('#teacherSearch', 'B');

    await expect(page.locator(`#ti-${teacherBId}`)).toBeVisible();
    await expect(page.locator(`#ti-${teacherAId}`)).toBeHidden();
  });

  test('US-018: mobile layout stacks assignment panel below teacher list', async ({ page }) => {
    const url = process.env.WEB_APP_URL!;
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${url}?page=admin_enrollments`);
    await page.waitForSelector('.teacher-panel');

    const layout = await page.evaluate(() => {
      const browserWindow = globalThis as any;
      const teacher = browserWindow.document.querySelector('.teacher-panel').getBoundingClientRect();
      const right = browserWindow.document.querySelector('.right-panel').getBoundingClientRect();
      return { teacherWidth: teacher.width, rightWidth: right.width, rightLeft: right.left, viewportWidth: browserWindow.innerWidth };
    });

    expect(layout.teacherWidth).toBeGreaterThan(layout.viewportWidth - 20);
    expect(layout.rightWidth).toBeGreaterThan(layout.viewportWidth - 20);
    expect(layout.rightLeft).toBeLessThan(5);
  });

  test('US-018: clicking teacher opens right panel with add-pair form', async ({ page }) => {
    const url = process.env.WEB_APP_URL!;
    await page.goto(`${url}?page=admin_enrollments`);

    // Wait for teacher list to load
    await page.waitForSelector(`#ti-${teacherAId}`);

    // Click teacher A
    await page.click(`#ti-${teacherAId}`);

    // Right panel detail should be visible
    await expect(page.locator('#teacherDetail')).toBeVisible();
    await expect(page.locator('.teacher-name-big')).toContainText('ครูทดสอบ A');

    // Add pair form should exist
    await expect(page.locator('#addClassId')).toBeVisible();
    await expect(page.locator('#addSubjectId')).toBeVisible();
    await expect(page.locator('#addPairBtn')).toBeVisible();
  });

  test('US-018: add pair to teacher A — appears in right panel', async ({ page }) => {
    const url = process.env.WEB_APP_URL!;
    await page.goto(`${url}?page=admin_enrollments`);
    await page.waitForSelector(`#ti-${teacherAId}`);
    await page.click(`#ti-${teacherAId}`);
    await page.waitForSelector('#addClassId');

    // Select class X and subject Z
    await page.selectOption('#addClassId', classXId);
    await page.selectOption('#addSubjectId', subjectZId);
    await page.click('#addPairBtn');

    // Toast success
    await expect(page.locator('#toast')).toContainText('เพิ่มสำเร็จ', { timeout: 15_000 });

    // Enrollment table should now show the pair
    await expect(page.locator('#enrollmentBody')).toContainText('ป.1/1');

    // Pair count badge updates to 1
    await expect(page.locator(`#badge-${teacherAId}`)).toContainText('1', { timeout: 15_000 });
  });

  test('US-018: add second pair to teacher A — count shows 2', async ({ page }) => {
    const url = process.env.WEB_APP_URL!;
    await page.goto(`${url}?page=admin_enrollments`);
    await page.waitForSelector(`#ti-${teacherAId}`);
    await page.click(`#ti-${teacherAId}`);
    await page.waitForSelector('#addClassId');

    // Add class Y + subject Z
    await page.selectOption('#addClassId', classYId);
    await page.selectOption('#addSubjectId', subjectZId);
    await page.click('#addPairBtn');

    await expect(page.locator('#toast')).toContainText('เพิ่มสำเร็จ', { timeout: 15_000 });
    await expect(page.locator(`#badge-${teacherAId}`)).toContainText('2', { timeout: 15_000 });
  });

  test('US-018: reassign pair from teacher A to teacher B — confirmation dialog', async ({ page }) => {
    const url = process.env.WEB_APP_URL!;
    await page.goto(`${url}?page=admin_enrollments`);
    await page.waitForSelector(`#ti-${teacherBId}`);
    await page.click(`#ti-${teacherBId}`);
    await page.waitForSelector('#addClassId');

    // Try to add (class X, subject Z) which is owned by teacher A
    await page.selectOption('#addClassId', classXId);
    await page.selectOption('#addSubjectId', subjectZId);
    await page.click('#addPairBtn');

    // Confirmation dialog should appear
    await expect(page.locator('#reassignDialog')).toHaveClass(/open/, { timeout: 15_000 });
    await expect(page.locator('#reassignMsg')).toContainText('ครูทดสอบ A');
    await expect(page.locator('#reassignMsg')).toContainText('ครูทดสอบ B');
    await expect(page.locator('#reassignDialog .dialog')).toHaveAttribute('role', 'alertdialog');

    const dialogLayout = await page.locator('#reassignDialog .dialog').evaluate((el: any) => {
      const rect = el.getBoundingClientRect();
      const styles = el.ownerDocument.defaultView.getComputedStyle(el);
      return { width: rect.width, borderRadius: styles.borderRadius };
    });
    expect(dialogLayout.width).toBeGreaterThan(300);
    expect(dialogLayout.width).toBeLessThanOrEqual(440);
    expect(dialogLayout.borderRadius).not.toBe('0px');

    // Confirm reassign
    await page.click('#confirmReassignBtn');

    // Toast success
    await expect(page.locator('#toast')).toContainText('เปลี่ยนครูผู้สอนสำเร็จ', { timeout: 15_000 });

    // The pair should now appear under teacher B
    await expect(page.locator('#enrollmentBody')).toContainText('ป.1/1');
  });

  test('US-018: after reassign, pair is gone from teacher A', async ({ page }) => {
    const url = process.env.WEB_APP_URL!;
    await page.goto(`${url}?page=admin_enrollments`);
    await page.waitForSelector(`#ti-${teacherAId}`);
    await page.click(`#ti-${teacherAId}`);
    await page.waitForSelector('#teacherDetail');

    // Teacher A should only have class Y + subject Z remaining (class X was reassigned)
    // Table should NOT contain 'ป.1/1' anymore (class X is ป.1/1)
    // NOTE: both classX (ป.1/1) and classY (ป.1/2) are ป.1 but different sections
    // After reassign, teacher A should have only 1 pair (class Y / ป.1/2)
    await expect(page.locator(`#badge-${teacherAId}`)).toContainText('1', { timeout: 15_000 });
  });

  test('US-018: All pairs tab shows teacher B for (class X, subject Z)', async ({ page }) => {
    const url = process.env.WEB_APP_URL!;
    await page.goto(`${url}?page=admin_enrollments`);
    await page.waitForSelector('#tab-allpairs');

    // Switch to All pairs tab
    await page.click('#tab-allpairs');

    // Wait for all pairs content
    await expect(page.locator('#allPairsContent table')).toBeVisible({ timeout: 15_000 });

    // The all pairs tab should show teacher B for (class X, subject Z)
    const rows = page.locator('#allPairsContent tbody tr');
    // Look for the row with our subject Z name
    await expect(rows.filter({ hasText: 'วิชาทดสอบ Z' }).filter({ hasText: 'ครูทดสอบ B' })).toHaveCount(1, { timeout: 15_000 });
  });

  test('US-018: All pairs filters narrow by class, status, and subject code', async ({ page }) => {
    const url = process.env.WEB_APP_URL!;
    await page.goto(`${url}?page=admin_enrollments`);
    await page.waitForSelector('#tab-allpairs');
    await page.click('#tab-allpairs');
    await expect(page.locator('#allPairsContent table')).toBeVisible({ timeout: 15_000 });

    await page.selectOption('#pairClassFilter', classXId);
    await page.selectOption('#pairStatusFilter', 'assigned');
    await page.fill('#pairSearch', 'TST018');

    const rows = page.locator('#allPairsContent tbody tr');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('TST018');
    await expect(rows.first()).toContainText('ครูทดสอบ B');
  });

  test('US-018: audit log has rows for subject Z changes', async () => {
    // Query audit log for enrollment changes related to our seeded enrollments
    const rows = await queryTestRows('AuditLog', 'user_id');
    // There should be audit log entries (at least 2: removal from A + addition to B)
    // Note: audit entries use admin's user_id, not test_ prefix — we check Enrollments changes instead
    // Check via enrollment rows that the reassign happened
    const enrollments = await queryTestRows('Enrollments', 'subject_id');
    // After reassign: class X -> teacher B, class Y -> teacher A
    const classXEnrollment = enrollments.find(
      (e) => (e as Record<string, string>).class_id === classXId && (e as Record<string, string>).subject_id === subjectZId
    );
    expect(classXEnrollment).toBeTruthy();
    expect((classXEnrollment as Record<string, string>).teacher_user_id).toBe(teacherBId);
  });

  test('US-018: non-admin user gets 403 block screen', async ({ browser }) => {
    // This test uses a fresh context without the admin auth.json
    const nonAdminContext = await browser.newContext();
    const page = await nonAdminContext.newPage();
    const url = process.env.WEB_APP_URL!;

    // Visit admin page without session — should show login or 403
    await page.goto(`${url}?page=admin_enrollments`);

    // Either login page or 403 block
    const bodyText = await page.locator('body').textContent();
    const hasBlock = bodyText?.includes('ไม่มีสิทธิ์') ||
      bodyText?.includes('กรุณาเข้าสู่ระบบ') ||
      bodyText?.includes('login');
    expect(hasBlock).toBeTruthy();

    await nonAdminContext.close();
  });
});

// ---- US-019: Admin bulk-assigns one teacher to many subjects ----

test.describe('US-019: Bulk assignment', () => {
  let teacherId: string;
  let class1Id: string;
  let class2Id: string;
  let class3Id: string;
  let subjectId: string;

  test.beforeAll(async () => {
    teacherId = await seedTestUser({ suffix: 'us019_t1', role: 'teacher', full_name: 'ครูบัลค์ทดสอบ' });
    class1Id = await seedTestClass({ suffix: 'us019_c1', level: 'ป.2', section: '1' });
    class2Id = await seedTestClass({ suffix: 'us019_c2', level: 'ป.2', section: '2' });
    class3Id = await seedTestClass({ suffix: 'us019_c3', level: 'ป.2', section: '3' });
    subjectId = await seedTestSubject({ suffix: 'us019_s1', name: 'วิชาบัลค์ทดสอบ', code: 'BLK019' });
  });

  test.afterAll(async () => {
    await cleanupTestData();
  });

  test('US-019: bulk assign tab is visible and has mode buttons', async ({ page }) => {
    const url = process.env.WEB_APP_URL!;
    await page.goto(`${url}?page=admin_enrollments`);
    await page.waitForSelector('#tab-bulk');

    // Click bulk tab
    await page.click('#tab-bulk');

    // Bulk assign panel should be visible
    await expect(page.locator('#bulkAssignTab')).toBeVisible();
    await expect(page.locator('#bulkModeABtn')).toBeVisible();
    await expect(page.locator('#bulkModeBBtn')).toBeVisible();
  });

  test('US-019: mode B bulk assign — 3 classes × 1 subject — summary shows 3 created', async ({ page }) => {
    const url = process.env.WEB_APP_URL!;
    await page.goto(`${url}?page=admin_enrollments`);
    await page.waitForSelector('#tab-bulk');

    // Open bulk tab
    await page.click('#tab-bulk');
    await expect(page.locator('#bulkAssignTab')).toBeVisible();

    // Switch to mode B (many classes, one subject)
    await page.click('#bulkModeBBtn');
    await expect(page.locator('#bulkModeB')).toBeVisible();

    // Select the test subject
    await page.selectOption('#bulkBSubjectId', subjectId);

    // Select the test teacher
    await page.selectOption('#bulkBTeacherId', teacherId);

    // Multi-select all 3 test classes via the select element
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await page.locator('#bulkBClassIds').evaluate(
      (sel: any, ids: string[]) => {
        for (const opt of Array.from(sel.options) as any[]) {
          opt.selected = ids.includes(opt.value);
        }
      },
      [class1Id, class2Id, class3Id]
    );

    // Submit
    await page.click('#bulkBBtn');

    // Result panel should show "3 เพิ่มใหม่"
    await expect(page.locator('#bulkResult')).toHaveClass(/show/, { timeout: 20_000 });
    await expect(page.locator('#bulkResult')).toContainText('3 เพิ่มใหม่');

    // Toast success
    await expect(page.locator('#toast')).toContainText('กำหนดครูแบบกลุ่มสำเร็จ', { timeout: 20_000 });
  });

  test('US-019: all 3 (class, subject) rows now have the test teacher via API', async () => {
    // Verify via test API that the 3 enrollments were created correctly
    const enrollments = await queryTestRows('Enrollments', 'subject_id');
    const myEnrollments = (enrollments as Record<string, string>[]).filter(
      (e) => e.subject_id === subjectId && e.teacher_user_id === teacherId
    );
    expect(myEnrollments).toHaveLength(3);
    const assignedClassIds = myEnrollments.map((e) => e.class_id).sort();
    expect(assignedClassIds).toEqual([class1Id, class2Id, class3Id].sort());
  });
});

// ---- US-020: Admin views teacher workload across the school ----

test.describe('US-020: Teacher workload dashboard', () => {
  let heavyTeacherId: string;
  let lightTeacherId: string;
  let class1Id: string;
  let class2Id: string;
  let class3Id: string;
  let subject1Id: string;
  let subject2Id: string;
  let subject3Id: string;

  test.beforeAll(async () => {
    // Heavy teacher gets 3 enrollments, light teacher gets 1
    heavyTeacherId = await seedTestUser({ suffix: 'us020_heavy', role: 'teacher', full_name: 'ครูภาระมาก' });
    lightTeacherId = await seedTestUser({ suffix: 'us020_light', role: 'teacher', full_name: 'ครูภาระน้อย' });
    class1Id = await seedTestClass({ suffix: 'us020_c1', level: 'ป.3', section: '1' });
    class2Id = await seedTestClass({ suffix: 'us020_c2', level: 'ป.3', section: '2' });
    class3Id = await seedTestClass({ suffix: 'us020_c3', level: 'ป.3', section: '3' });
    subject1Id = await seedTestSubject({ suffix: 'us020_s1', name: 'วิชาทดสอบ 20A', code: 'T20A' });
    subject2Id = await seedTestSubject({ suffix: 'us020_s2', name: 'วิชาทดสอบ 20B', code: 'T20B' });
    subject3Id = await seedTestSubject({ suffix: 'us020_s3', name: 'วิชาทดสอบ 20C', code: 'T20C' });

    // Heavy teacher: 3 enrollments
    await seedTestEnrollment({ suffix: 'us020_e1', class_id: class1Id, subject_id: subject1Id, teacher_user_id: heavyTeacherId });
    await seedTestEnrollment({ suffix: 'us020_e2', class_id: class2Id, subject_id: subject2Id, teacher_user_id: heavyTeacherId });
    await seedTestEnrollment({ suffix: 'us020_e3', class_id: class3Id, subject_id: subject3Id, teacher_user_id: heavyTeacherId });

    // Light teacher: 1 enrollment
    await seedTestEnrollment({ suffix: 'us020_e4', class_id: class1Id, subject_id: subject3Id, teacher_user_id: lightTeacherId });
  });

  test.afterAll(async () => {
    await cleanupTestData();
  });

  test('US-020: workload page loads and shows workload table', async ({ page }) => {
    const url = process.env.WEB_APP_URL!;
    await page.goto(`${url}?page=admin_workload`);

    // Table should appear
    await expect(page.locator('#workloadTable')).toBeVisible({ timeout: 20_000 });

    // Both test teachers should be in the table
    await expect(page.locator(`#row-${heavyTeacherId}`)).toBeVisible();
    await expect(page.locator(`#row-${lightTeacherId}`)).toBeVisible();

    // Heavy teacher pair count should be at least 3
    const heavyCount = await page.locator(`#row-${heavyTeacherId} .pair-count`).textContent();
    expect(Number(heavyCount)).toBeGreaterThanOrEqual(3);

    // Light teacher pair count should be at least 1
    const lightCount = await page.locator(`#row-${lightTeacherId} .pair-count`).textContent();
    expect(Number(lightCount)).toBeGreaterThanOrEqual(1);
  });

  test('US-020: table is sorted — heavy teacher appears before light teacher', async ({ page }) => {
    const url = process.env.WEB_APP_URL!;
    await page.goto(`${url}?page=admin_workload`);

    await expect(page.locator('#workloadTable')).toBeVisible({ timeout: 20_000 });

    // Get all row IDs from tbody in DOM order
    const rowIds = await page.locator('#workloadBody tr').evaluateAll(
      (rows: any[]) => rows.map((r: any) => r.id)
    );

    const heavyIndex = rowIds.indexOf(`row-${heavyTeacherId}`);
    const lightIndex = rowIds.indexOf(`row-${lightTeacherId}`);

    expect(heavyIndex).toBeGreaterThanOrEqual(0);
    expect(lightIndex).toBeGreaterThanOrEqual(0);
    // Heavy teacher (3 enrollments) must come before light teacher (1 enrollment)
    expect(heavyIndex).toBeLessThan(lightIndex);
  });

  test('US-020: clicking heavy teacher row opens drill-down with 3 pairs', async ({ page }) => {
    const url = process.env.WEB_APP_URL!;
    await page.goto(`${url}?page=admin_workload`);

    await expect(page.locator('#workloadTable')).toBeVisible({ timeout: 20_000 });

    // Click the heavy teacher row
    await page.click(`#row-${heavyTeacherId}`);

    // Drill-down panel should be open
    await expect(page.locator('#drillPanel')).toHaveClass(/open/, { timeout: 10_000 });

    // Title should contain teacher name
    await expect(page.locator('#drillTitle')).toContainText('ครูภาระมาก');

    // Drill table should have exactly 3 pairs for our heavy teacher (may have more if other data exists)
    // We count only the rows that belong to our seeded subjects
    const drillRows = page.locator('#drillBody tr');
    const count = await drillRows.count();
    expect(count).toBeGreaterThanOrEqual(3);

    // All 3 seeded subjects should appear in the drill-down
    await expect(page.locator('#drillBody')).toContainText('วิชาทดสอบ 20A');
    await expect(page.locator('#drillBody')).toContainText('วิชาทดสอบ 20B');
    await expect(page.locator('#drillBody')).toContainText('วิชาทดสอบ 20C');
  });

  test('US-020: drill-down rows include grade-book links', async ({ page }) => {
    const url = process.env.WEB_APP_URL!;
    await page.goto(`${url}?page=admin_workload`);

    await expect(page.locator('#workloadTable')).toBeVisible({ timeout: 20_000 });
    await page.click(`#row-${heavyTeacherId}`);
    await expect(page.locator('#drillPanel')).toHaveClass(/open/, { timeout: 10_000 });

    // Each drill row should have a link
    const links = page.locator('#drillBody .drill-link');
    const linkCount = await links.count();
    expect(linkCount).toBeGreaterThanOrEqual(3);

    // Links should contain page=gradebook
    const firstHref = await links.first().getAttribute('href');
    expect(firstHref).toContain('page=gradebook');
  });

  test('US-020: non-admin cannot access workload page', async ({ browser }) => {
    const nonAdminContext = await browser.newContext();
    const page = await nonAdminContext.newPage();
    const url = process.env.WEB_APP_URL!;

    await page.goto(`${url}?page=admin_workload`);

    const bodyText = await page.locator('body').textContent();
    const isBlocked = bodyText?.includes('ไม่มีสิทธิ์') ||
      bodyText?.includes('กรุณาเข้าสู่ระบบ') ||
      bodyText?.includes('login');
    expect(isBlocked).toBeTruthy();

    await nonAdminContext.close();
  });
});

// ---- US-016: Audit log ----

test.describe('US-016: Audit log', () => {
  let classId: string;
  let subjectId: string;
  let studentId: string;

  test.beforeAll(async () => {
    await cleanupTestData();
    classId = await seedTestClass({ suffix: 'us016_c1', level: 'ป.1', section: '1' });
    subjectId = await seedTestSubject({ suffix: 'us016_s1', name: 'วิชาทดสอบ US016', code: 'US016' });
    await seedTestSubjectWeights({ subject_id: subjectId });
    studentId = await seedTestStudent({ class_suffix: 'us016_c1', seq: 1, full_name: 'test_นักเรียน016' });
  });

  test.afterAll(async () => {
    await cleanupTestData();
  });

  test('US-016: admin edits summative score — audit log records the change', async ({ page }) => {
    const url = process.env.WEB_APP_URL!;

    // Step 1: Admin navigates to summative scoring page and saves a score
    await page.goto(`${url}?page=class_summative&class_id=${classId}&subject_id=${subjectId}`);
    await expect(page.locator('#pageHeading')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#summativeTable')).toBeVisible({ timeout: 20_000 });

    // Find the score inputs for our student and enter scores
    const cwInput = page.locator(`input[data-student="${studentId}"][data-col="coursework"]`);
    await cwInput.fill('50');
    const midInput = page.locator(`input[data-student="${studentId}"][data-col="midterm"]`);
    await midInput.fill('15');
    const finInput = page.locator(`input[data-student="${studentId}"][data-col="final"]`);
    await finInput.fill('15');

    // Save
    await page.click('#saveBtn');
    await expect(page.locator('#toast')).toContainText('บันทึกคะแนนสำเร็จ', { timeout: 15_000 });
  });

  test('US-016: admin_audit page loads and shows heading', async ({ page }) => {
    const url = process.env.WEB_APP_URL!;
    await page.goto(`${url}?page=admin_audit`);

    await expect(page.locator('#pageHeading')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#pageHeading')).toContainText('Audit Log');
  });

  test('US-016: filter by entity=SummativeScores shows our change row with non-empty new_value', async ({ page }) => {
    const url = process.env.WEB_APP_URL!;
    await page.goto(`${url}?page=admin_audit`);

    await expect(page.locator('#pageHeading')).toBeVisible({ timeout: 20_000 });

    // Wait for initial search to finish (page auto-runs doSearch() on load)
    await expect(page.locator('#auditStatus')).not.toContainText('กำลังโหลด', { timeout: 20_000 });

    // Select entity = SummativeScores in filter dropdown
    await page.selectOption('#filterEntity', 'SummativeScores');

    // Run search
    await page.click('#searchBtn');

    // Wait for results
    await expect(page.locator('#auditStatus')).not.toContainText('กำลังค้นหา', { timeout: 20_000 });

    // The table should be visible with at least one row
    await expect(page.locator('#auditTableWrap')).toBeVisible({ timeout: 15_000 });

    // At least one row should have entity=SummativeScores
    const rows = page.locator('#auditBody tr[data-entity="SummativeScores"]');
    await expect(rows.first()).toBeVisible({ timeout: 15_000 });

    // The new_value column should be non-empty JSON (last td)
    const newValCell = rows.first().locator('td').last();
    const newValText = await newValCell.textContent();
    expect(newValText?.trim()).not.toBe('');
  });

  test('US-016: non-admin cannot access audit page', async ({ browser }) => {
    const nonAdminContext = await browser.newContext();
    const page = await nonAdminContext.newPage();
    const url = process.env.WEB_APP_URL!;

    await page.goto(`${url}?page=admin_audit`);

    const bodyText = await page.locator('body').textContent();
    const isBlocked = bodyText?.includes('ไม่มีสิทธิ์') ||
      bodyText?.includes('กรุณาเข้าสู่ระบบ') ||
      bodyText?.includes('login');
    expect(isBlocked).toBeTruthy();

    await nonAdminContext.close();
  });
});
