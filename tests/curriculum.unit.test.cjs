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
    subject_info: { subject_name: 'Test Subject', hours_per_year: 80 },
    students: [student], total_students: 1,
    ability_dist: [{ label: 'เชี่ยวชาญ', count: 1, pct: 100 }],
    curriculum_data: { students: [student], outcomes: {
      '1': [{ outcome_id: 'first', code: '1', description: 'Term one', max_score: 40 }],
      '2': [{ outcome_id: 'second', code: '2', description: 'Term two', max_score: 60 }],
    } },
  };
  const book = reportContext.buildReportBookHtml(data);
  assert.match(book, /สรุปผลการประเมินประจำปี/);
  assert.match(book, /78/);
  assert.doesNotMatch(book, /สอบกลางภาค|__REPORT_TOTAL_PAGES__/);
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
