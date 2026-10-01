import { test, expect } from './helpers/custom-test';
import {
  cleanupTestData,
  queryTestRows,
  seedTestCharacteristics,
  seedTestClass,
  seedTestEnrollment,
  seedTestReadThinkWrite,
  seedTestStudent,
  seedTestSubject,
  seedTestUser,
} from './helpers/seed';

const url = process.env.WEB_APP_URL!;

test.describe('Partial cross-subject assessment copy', () => {
  test.beforeEach(async () => {
    await cleanupTestData();
  });

  test.afterEach(async () => {
    await cleanupTestData();
  });

  test('Characteristics merges partial same-level data from another teacher and section', async ({ page }) => {
    const destinationClassId = await seedTestClass({ suffix: 'copy_char_dest', level: 'ป.3', section: '1' });
    const sourceClassId = await seedTestClass({ suffix: 'copy_char_source', level: 'ป.3', section: '2' });
    const otherLevelClassId = await seedTestClass({ suffix: 'copy_char_other', level: 'ป.4', section: '1' });
    const destinationSubjectId = await seedTestSubject({ suffix: 'copy_char_dest', name: 'ปลายทางคุณลักษณะ', class_id: destinationClassId });
    const sourceSubjectId = await seedTestSubject({ suffix: 'copy_char_source', name: 'ต้นทางคุณลักษณะบางส่วน', class_id: sourceClassId });
    const otherLevelSubjectId = await seedTestSubject({ suffix: 'copy_char_other', name: 'ต้นทางต่างระดับ', class_id: otherLevelClassId });
    const noMatchSubjectId = await seedTestSubject({ suffix: 'copy_char_nomatch', name: 'ต้นทางไม่มีนักเรียนตรงกัน', class_id: sourceClassId });
    const studentId = await seedTestStudent({ class_suffix: 'copy_char_dest', seq: 1, full_name: 'test_นักเรียนคุณลักษณะ' });
    const unmatchedStudentId = await seedTestStudent({ class_suffix: 'copy_char_source', seq: 2, full_name: 'test_นักเรียนคนละคน' });
    const destinationTeacherId = await seedTestUser({ suffix: 'copy_char_dest', full_name: 'test_ครูปลายทาง' });
    const sourceTeacherId = await seedTestUser({ suffix: 'copy_char_source', full_name: 'test_ครูต้นทางอีกคน' });

    await seedTestEnrollment({ suffix: 'copy_char_dest', class_id: destinationClassId, subject_id: destinationSubjectId, teacher_user_id: destinationTeacherId });
    await seedTestEnrollment({ suffix: 'copy_char_source', class_id: sourceClassId, subject_id: sourceSubjectId, teacher_user_id: sourceTeacherId });
    await seedTestEnrollment({ suffix: 'copy_char_other', class_id: otherLevelClassId, subject_id: otherLevelSubjectId, teacher_user_id: sourceTeacherId });
    await seedTestEnrollment({ suffix: 'copy_char_nomatch', class_id: sourceClassId, subject_id: noMatchSubjectId, teacher_user_id: sourceTeacherId });
    await seedTestCharacteristics({ student_id: studentId, subject_id: destinationSubjectId, updated_by: destinationTeacherId, values: [9, 8, 7, 6, 5, 4, 3, 2] });
    await seedTestCharacteristics({ student_id: studentId, subject_id: sourceSubjectId, updated_by: sourceTeacherId, values: [10, '', 0, '', '', '', '', ''] });
    await seedTestCharacteristics({ student_id: studentId, subject_id: otherLevelSubjectId, updated_by: sourceTeacherId, values: [1, '', '', '', '', '', '', ''] });
    await seedTestCharacteristics({ student_id: unmatchedStudentId, subject_id: noMatchSubjectId, updated_by: sourceTeacherId, values: [1, '', '', '', '', '', '', ''] });

    await page.goto(`${url}?page=class_characteristics&class_id=${destinationClassId}&subject_id=${destinationSubjectId}`);
    await expect(page.locator('#charTable')).toBeVisible({ timeout: 20_000 });
    await page.locator('#openCopyBtn').click();
    await expect(page.locator('#sourceList')).toContainText('ต้นทางคุณลักษณะบางส่วน', { timeout: 20_000 });
    await expect(page.locator('#sourceList')).toContainText('test_ครูต้นทางอีกคน');
    await expect(page.locator('#sourceList')).not.toContainText('ต้นทางต่างระดับ');
    await expect(page.locator('#sourceList')).not.toContainText('ต้นทางไม่มีนักเรียนตรงกัน');
    await page.locator(`input[name="characteristicSource"][value="${sourceSubjectId}"]`).check();
    await page.locator('#confirmSourceBtn').click();
    await expect(page.locator('#replaceWarning')).toBeVisible();
    await page.locator('#confirmSourceBtn').click();

    const inputs = page.locator(`#charBody tr[data-student-id="${studentId}"] input.score-input`);
    await expect(inputs.nth(0)).toHaveValue('10');
    await expect(inputs.nth(1)).toHaveValue('8');
    await expect(inputs.nth(2)).toHaveValue('0');
    const beforeSave = (await queryTestRows('Characteristics', 'student_id')).find(row => row.student_id === studentId && row.subject_id === destinationSubjectId);
    expect(beforeSave?.t1).toBe(9);
    expect(beforeSave?.t2).toBe(8);
    expect(beforeSave?.t3).toBe(7);

    await page.locator('#saveBtn').click();
    await expect(page.locator('#toast')).toContainText('บันทึกคะแนนสำเร็จ', { timeout: 30_000 });
    const afterSave = (await queryTestRows('Characteristics', 'student_id')).find(row => row.student_id === studentId && row.subject_id === destinationSubjectId);
    expect(afterSave?.t1).toBe(10);
    expect(afterSave?.t2).toBe(8);
    expect(afterSave?.t3).toBe(0);
  });

  test('Read-Think-Write merges partial same-level data without clearing destination fields', async ({ page }) => {
    const destinationClassId = await seedTestClass({ suffix: 'copy_rtw_dest', level: 'ป.5', section: '1' });
    const sourceClassId = await seedTestClass({ suffix: 'copy_rtw_source', level: 'ป.5', section: '2' });
    const destinationSubjectId = await seedTestSubject({ suffix: 'copy_rtw_dest', name: 'ปลายทางอ่านคิดเขียน', class_id: destinationClassId });
    const sourceSubjectId = await seedTestSubject({ suffix: 'copy_rtw_source', name: 'ต้นทางอ่านคิดเขียนบางส่วน', class_id: sourceClassId });
    const studentId = await seedTestStudent({ class_suffix: 'copy_rtw_dest', seq: 1, full_name: 'test_นักเรียนอ่านคิดเขียน' });
    const destinationTeacherId = await seedTestUser({ suffix: 'copy_rtw_dest', full_name: 'test_ครูปลายทางอ่านคิดเขียน' });
    const sourceTeacherId = await seedTestUser({ suffix: 'copy_rtw_source', full_name: 'test_ครูต้นทางอ่านคิดเขียน' });

    await seedTestEnrollment({ suffix: 'copy_rtw_dest', class_id: destinationClassId, subject_id: destinationSubjectId, teacher_user_id: destinationTeacherId });
    await seedTestEnrollment({ suffix: 'copy_rtw_source', class_id: sourceClassId, subject_id: sourceSubjectId, teacher_user_id: sourceTeacherId });
    await seedTestReadThinkWrite({ student_id: studentId, subject_id: destinationSubjectId, updated_by: destinationTeacherId, values: [9, 8, 7, 6, 5, 4, 3, 2, 1, 10] });
    await seedTestReadThinkWrite({ student_id: studentId, subject_id: sourceSubjectId, updated_by: sourceTeacherId, values: [10, '', 0, '', '', '', '', '', '', ''] });

    await page.goto(`${url}?page=class_readthinkwrite&class_id=${destinationClassId}&subject_id=${destinationSubjectId}`);
    await expect(page.locator('#rtwTable')).toBeVisible({ timeout: 20_000 });
    await page.locator('#openCopyBtn').click();
    await expect(page.locator('#sourceList')).toContainText('ต้นทางอ่านคิดเขียนบางส่วน', { timeout: 20_000 });
    await expect(page.locator('#sourceList')).toContainText('test_ครูต้นทางอ่านคิดเขียน');
    await page.locator(`input[name="readThinkWriteSource"][value="${sourceSubjectId}"]`).check();
    await page.locator('#confirmSourceBtn').click();
    await expect(page.locator('#replaceWarning')).toBeVisible();
    await page.locator('#confirmSourceBtn').click();

    const inputs = page.locator(`#rtwBody tr[data-student-id="${studentId}"] input.score-input`);
    await expect(inputs.nth(0)).toHaveValue('10');
    await expect(inputs.nth(1)).toHaveValue('8');
    await expect(inputs.nth(2)).toHaveValue('0');
    const beforeSave = (await queryTestRows('ReadThinkWrite', 'student_id')).find(row => row.student_id === studentId && row.subject_id === destinationSubjectId);
    expect(beforeSave?.r1).toBe(9);
    expect(beforeSave?.r2).toBe(8);
    expect(beforeSave?.r3).toBe(7);

    await page.locator('#saveBtn').click();
    await expect(page.locator('#toast')).toContainText('บันทึกคะแนนสำเร็จ', { timeout: 30_000 });
    const afterSave = (await queryTestRows('ReadThinkWrite', 'student_id')).find(row => row.student_id === studentId && row.subject_id === destinationSubjectId);
    expect(afterSave?.r1).toBe(10);
    expect(afterSave?.r2).toBe(8);
    expect(afterSave?.r3).toBe(0);
  });

});
