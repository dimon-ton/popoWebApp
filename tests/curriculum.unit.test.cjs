const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..', 'src', 'teacher');
const context = vm.createContext({ Math, Number, String, isFinite });
vm.runInContext(fs.readFileSync(path.join(root, 'summative.gs'), 'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(root, 'curriculum.gs'), 'utf8'), context);

test('P1-P3 routing recognizes only levels 1 through 3', () => {
  for (const level of ['ป.1', 'ป.2', 'ป.3']) assert.equal(context.isCurriculumLevel_(level), true);
  for (const level of ['ป.4', 'ม.1', '']) assert.equal(context.isCurriculumLevel_(level), false);
});

test('term totals scale raw outcomes to 35 and map grade to ability', () => {
  const outcomes = [{ outcome_id: 'a', max_score: 10 }, { outcome_id: 'b', max_score: 20 }, { outcome_id: 'c', max_score: 10 }];
  const result = context.curriculumTermResult_(outcomes, { a: 8, b: 12, c: 7 }, 12);
  assert.equal(result.raw, 27);
  assert.equal(result.scaled, 24);
  assert.equal(result.total, 36);
  assert.equal(result.grade, 3);
  assert.equal(result.ability, 'ชำนาญ');
  assert.equal(context.computeGrade(78), 3.5);
  assert.equal(context.curriculumAbility_(3.5), 'เชี่ยวชาญ');
});

test('blank outcome or exam leaves result blank, while zero is a completed score', () => {
  const outcomes = [{ outcome_id: 'a', max_score: 10 }];
  assert.equal(context.curriculumTermResult_(outcomes, { a: '' }, 15).total, '');
  assert.equal(context.curriculumTermResult_(outcomes, { a: 10 }, '').total, '');
  assert.equal(context.curriculumTermResult_(outcomes, { a: 0 }, 0).total, 0);
});

test('P1-P3 print packet renders term and annual results without legacy score headings', () => {
  const html = fs.readFileSync(path.join(root, 'class_report.html'), 'utf8');
  const script = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].at(-1)[1]
    .replace(/<\?[\s\S]*?\?>/g, 'x').replace(/loadReport\(\);\s*$/, '');
  const reportContext = vm.createContext({ Math, Number, String, Date, Array, setTimeout: () => {} });
  vm.runInContext(script, reportContext);
  const student = {
    student_id: 'test_student', seq_no: 1, full_name: 'Test Student', student_code: '100',
    scores: { first: 27, second: 48 },
    term1: { raw: 27, scaled: 24, assessment: 12, total: 36, grade: 3, ability: 'ชำนาญ' },
    term2: { raw: 48, scaled: 28, assessment: 14, total: 42, grade: 4, ability: 'เชี่ยวชาญ' },
    year_total: 78, final_grade: 3.5, ability: 'เชี่ยวชาญ',
  };
  const data = {
    school_info: { school_name: 'Test School', academic_year: '2568' },
    class_info: { level: 'ป.1', section: '1', class_label: 'ป.1/1' },
    subject_info: { subject_name: 'Test Subject', hours_per_year: 80, curriculum_ability_type: 'พื้นฐาน', curriculum_ability_name: 'การอ่าน' },
    students: [student], total_students: 1,
    ability_dist: [{ label: 'เชี่ยวชาญ', count: 1, pct: 100 }],
    curriculum_data: { students: [student], outcomes: {
      '1': [{ outcome_id: 'first', display_order: 1, code: 'old-code', description: 'Term one', max_score: 40 }],
      '2': [{ outcome_id: 'second', display_order: 1, code: 'old-code', description: 'Term two', max_score: 60 }],
    } },
  };
  const book = reportContext.buildReportBookHtml(data);
  assert.match(book, /บันทึกเวลาเรียน/);
  assert.match(book, /ความสามารถพื้นฐาน การอ่าน/);
  assert.match(book, /ผลลัพธ์การเรียนรู้รายวิชา/);
  assert.match(book, /สรุปผลการประเมิน ภาคเรียนที่ 1/);
  assert.match(book, /สรุปผลการประเมิน/);
  assert.match(book, /78/);
  assert.doesNotMatch(book, /สอบกลางภาค|__REPORT_TOTAL_PAGES__|ภาคผนวกและรายการตรวจสอบ|คำชี้แจง|old-code/);
  assert.equal((book.match(/<section class="a4-page /g) || []).length, 12);
});

test('saving an outcome uses its order as the stored code and rejects a duplicate order', () => {
  const writes = [];
  const api = vm.createContext({ Math, Number, String, isFinite });
  vm.runInContext(fs.readFileSync(path.join(root, 'curriculum.gs'), 'utf8'), api);
  api.requireCurriculumAccess_ = () => ({ session: { user_id: 'teacher' } });
  api.dbFind = () => [];
  api.generateId = () => 'outcome_1';
  api.dbInsert = (_tab, row) => writes.push(row);
  api.appendAuditLog = () => {};
  api.serverSaveLearningOutcome('token', 'class', 'subject', { term: 1, display_order: 2, description: 'อ่านได้', max_score: 10 });
  assert.equal(writes[0].code, '2');
  api.dbFind = () => [{ outcome_id: 'existing', term: 1, display_order: 2 }];
  assert.throws(() => api.serverSaveLearningOutcome('token', 'class', 'subject', { term: 1, display_order: 2, description: 'ซ้ำ', max_score: 10 }), /ลำดับผลลัพธ์การเรียนรู้ซ้ำ/);
});

test('only admins can set required P1-P3 subject capability on create and edit', () => {
  const inserts = [];
  const updates = [];
  let role = 'admin';
  const api = vm.createContext({ Math, Number, String, isFinite });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'admin', 'admin_school_api.gs'), 'utf8'), api);
  api.getSession = () => ({ role, user_id: 'user' });
  api.ensureColumns = () => {};
  api.removeColumns = () => {};
  api.isCurriculumLevel_ = context.isCurriculumLevel_;
  api.dbGetAll = (tab) => tab === 'Classes' ? [{ class_id: 'p1', level: 'ป.1' }, { class_id: 'p4', level: 'ป.4' }] : [];
  api.dbFindOne = (tab, _key, value) => {
    if (tab === 'Classes') return { class_id: value, level: value === 'p1' ? 'ป.1' : 'ป.4' };
    if (tab === 'Subjects') return value === 'existing' ? { subject_id: 'existing', class_id: 'p1', weight_group: 1 } : null;
    if (tab === 'SubjectWeights') return { subject_id: value };
    return null;
  };
  api.dbInsert = (tab, row) => { if (tab === 'Subjects') inserts.push(row); };
  api.dbUpdate = (tab, _field, _id, row) => { if (tab === 'Subjects') updates.push(row); };
  api.DEFAULT_WEIGHTS = { '1': {} };
  api.appendAuditLog = () => {};

  assert.throws(() => api.serverAddSubject('token', '', 'ภาษาไทย', 'TH', 80, 1, 'p1', '', '', ''), /ประเภทความสามารถ/);
  assert.throws(() => api.serverAddSubject('token', '', 'ภาษาไทย', 'TH', 80, 1, 'p1', '', 'พื้นฐาน', ''), /ชื่อความสามารถ/);
  assert.throws(() => api.serverAddSubject('token', '', 'ภาษาไทย', 'TH', 80, 1, 'p1', '', 'อื่น', 'ภาษา'), /ประเภทความสามารถ/);
  api.serverAddSubject('token', '', 'ภาษาไทย', 'TH', 80, 1, 'p1', '', 'พื้นฐาน', 'ด้านภาษา');
  assert.equal(inserts[0].curriculum_ability_name, 'ด้านภาษา');
  api.serverAddSubject('token', '', 'วิทยาศาสตร์', 'SCI', 80, 1, 'p4', '', '', '');
  assert.equal(inserts[1].curriculum_ability_type, undefined);

  assert.throws(() => api.serverUpdateSubject('token', 'existing', 'ภาษาไทย', 'TH', 80, 1, '', '', ''), /ประเภทความสามารถ/);
  api.serverUpdateSubject('token', 'existing', 'ภาษาไทย', 'TH', 80, 1, '', 'การประยุกต์ใช้ในชีวิตประจำวัน', 'ด้านภาษา');
  assert.equal(updates[0].curriculum_ability_type, 'การประยุกต์ใช้ในชีวิตประจำวัน');
  role = 'teacher';
  assert.throws(() => api.serverAddSubject('token', '', 'ภาษาไทย', 'TH', 80, 1, 'p1', '', 'พื้นฐาน', 'ด้านภาษา'), /ไม่มีสิทธิ์/);
  assert.throws(() => api.serverUpdateSubject('token', 'existing', 'ภาษาไทย', 'TH', 80, 1, '', 'พื้นฐาน', 'ด้านภาษา'), /ไม่มีสิทธิ์/);
  assert.equal(api.serverSaveCurriculumReportProfile, undefined);
});

test('subject CSV requires capability for new P1-P3 rows and preserves it on legacy updates', () => {
  function sheet(rows) {
    return {
      rows,
      getDataRange() { return { getValues: () => this.rows }; },
      getRange(row, col) { return { setValue: (value) => { this.rows[row - 1][col - 1] = value; } }; },
      appendRow(row) { this.rows.push(row); },
      getLastRow() { return this.rows.length; },
    };
  }
  const subjects = sheet([
    ['subject_id', 'class_id', 'subject_name', 'subject_code', 'hours_per_year', 'weight_group', 'subject_group', 'curriculum_ability_type', 'curriculum_ability_name'],
    ['existing', 'p1', 'ภาษาไทย', 'TH', 80, 1, 'ภาษาไทย', 'พื้นฐาน', 'เดิม'],
  ]);
  const weights = sheet([['subject_id', 'coursework_max', 'final_max', 'pre_mid_max', 'mid_max', 'post_mid_max', 'final_exam_max']]);
  const api = vm.createContext({ Math, Number, String, isFinite });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'admin', 'admin_school_api.gs'), 'utf8'), api);
  api.getSession = () => ({ role: 'admin', user_id: 'admin' });
  api.ensureColumns = () => {};
  api.removeColumns = () => {};
  api.isCurriculumLevel_ = context.isCurriculumLevel_;
  api.getSheet = (name) => name === 'Subjects' ? subjects : weights;
  api.dbGetAll = (name) => name === 'Classes' ? [{ class_id: 'p1', level: 'ป.1', section: '1' }, { class_id: 'p4', level: 'ป.4', section: '1' }] : [];
  api.LockService = { getDocumentLock: () => ({ tryLock: () => true, releaseLock: () => {} }) };
  api.DEFAULT_WEIGHTS = { '1': { coursework_max: 70, final_max: 30, pre_mid_max: 25, mid_max: 20, post_mid_max: 25, final_exam_max: 30 } };
  api.appendAuditLog = () => {};
  const result = api.serverImportSubjectsCSV('token', [
    { subject_id: 'existing', class_id: 'p1', subject_name: 'ภาษาไทยใหม่', subject_code: 'TH', hours: '80', weight_group: '1' },
    { class_id: 'p1', subject_name: 'ไม่ครบ', subject_code: 'BAD', hours: '80', weight_group: '1' },
    { class_level: 'ป.2', class_section: '1', subject_name: 'ไม่ครบอีก', subject_code: 'BAD2', hours: '80', weight_group: '1' },
    { class_id: 'p1', subject_name: 'อังกฤษ', subject_code: 'EN', hours: '80', weight_group: '1', curriculum_ability_type: 'พื้นฐาน', curriculum_ability_name: 'ด้านภาษา' },
    { class_id: 'p4', subject_name: 'วิทยาศาสตร์', subject_code: 'SCI', hours: '80', weight_group: '1' },
  ]);
  assert.equal(result.created_count, 2);
  assert.equal(result.updated_count, 1);
  assert.match(result.warnings.join(' '), /ประเภทความสามารถ/);
  assert.equal(subjects.rows[1][7], 'พื้นฐาน');
  assert.equal(subjects.rows[1][8], 'เดิม');
  assert.equal(subjects.rows.find((row) => row[3] === 'EN')[8], 'ด้านภาษา');
  assert.equal(subjects.rows.find((row) => row[3] === 'BAD'), undefined);
});

test('report data derives year grade from new tabs only', () => {
  const rows = {
    Students: [{ student_id: 'student', seq_no: 1, full_name: 'Test Student' }],
    LearningOutcomes: [
      { outcome_id: 'a', subject_id: 'subject', term: 1, max_score: 40, display_order: 1 },
      { outcome_id: 'b', subject_id: 'subject', term: 2, max_score: 60, display_order: 1 },
    ],
    LearningOutcomeScores: [
      { student_id: 'student', outcome_id: 'a', score: 27 },
      { student_id: 'student', outcome_id: 'b', score: 48 },
    ],
    TermAssessments: [
      { student_id: 'student', term: 1, score: 12 },
      { student_id: 'student', term: 2, score: 14 },
    ],
    SummativeScores: [{ student_id: 'student', final_grade: 4 }],
  };
  const visited = [];
  const api = vm.createContext({
    Math, Number, String, isFinite,
    requireSession_: () => ({ user_id: 'teacher' }),
    requireSubjectAccess_: () => ({ class_info: { level: 'ป.1' }, subject_info: {} }),
    withClassLabel: value => value,
    dbFind: tab => { visited.push(tab); return rows[tab] || []; },
  });
  vm.runInContext(fs.readFileSync(path.join(root, 'summative.gs'), 'utf8'), api);
  vm.runInContext(fs.readFileSync(path.join(root, 'curriculum.gs'), 'utf8'), api);
  api.ensureCurriculumTables_ = () => {};
  const result = api.getCurriculumData('token', 'class', 'subject').students[0];
  assert.equal(result.term1.total, 36);
  assert.equal(result.term2.total, 42);
  assert.equal(result.year_total, 78);
  assert.equal(result.final_grade, 3.5);
  assert.equal(visited.includes('SummativeScores'), false);
});

test('missing curriculum tabs are created once under the database lock', () => {
  const tabs = {};
  let locks = 0;
  const spreadsheet = { getSheetByName: name => tabs[name] };
  const api = vm.createContext({
    Math, Number, String, isFinite,
    TAB_SCHEMA: { LearningOutcomes: ['outcome_id'], LearningOutcomeScores: ['id'], TermAssessments: ['id'] },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => 'sheet' }) },
    SpreadsheetApp: { openById: () => spreadsheet },
    withDbLock_: callback => { locks++; callback(); },
    ensureTab: (_spreadsheet, name) => { tabs[name] = {}; },
  });
  vm.runInContext(fs.readFileSync(path.join(root, 'curriculum.gs'), 'utf8'), api);
  api.ensureCurriculumTables_();
  api.ensureCurriculumTables_();
  assert.deepEqual(Object.keys(tabs).sort(), ['LearningOutcomeScores', 'LearningOutcomes', 'TermAssessments']);
  assert.equal(locks, 1);
});
