const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const teacherRoot = path.join(__dirname, '..', 'src', 'teacher');

function createApi(level = 'ม.1') {
  const state = {
    Classes: [{ class_id: 'class', level }],
    Subjects: [{ subject_id: 'subject', class_id: 'class' }],
    Enrollments: [],
    Students: [{ student_id: 'student', class_id: 'class' }],
    Indicators: [{ indicator_id: 'i1', subject_id: 'subject', max_score: 10 }],
    IndicatorScores: [{ id: 'is1', student_id: 'student', subject_id: 'subject', indicator_id: 'i1', score: 10 }],
    SubjectWeights: [{ subject_id: 'subject', pre_mid_max: 20, post_mid_max: 30, mid_max: 20, final_exam_max: 30 }],
    SummativeScores: [],
  };

  const api = vm.createContext({ Math, Number, String, Date, JSON, Object, Array, isFinite, isNaN });
  vm.runInContext(fs.readFileSync(path.join(teacherRoot, 'summative.gs'), 'utf8'), api);
  vm.runInContext(fs.readFileSync(path.join(teacherRoot, 'curriculum.gs'), 'utf8'), api);
  vm.runInContext(fs.readFileSync(path.join(teacherRoot, 'report.gs'), 'utf8'), api);

  api.dbGetAll = (tab) => state[tab] || [];
  api.dbFind = (tab, field, value) => (state[tab] || []).filter((row) => String(row[field]) === String(value));
  api.dbFindOne = (tab, field, value) => api.dbFind(tab, field, value)[0] || null;
  api.dbBatchUpsertRows_ = (tab, keys, rows) => {
    rows.forEach((incoming) => {
      let row = (state[tab] || []).find((candidate) => keys.every((key) => String(candidate[key]) === String(incoming[key])));
      if (row) Object.assign(row, incoming);
      else state[tab].push({ id: `new_${state[tab].length}`, ...incoming });
    });
  };
  api.ensureColumns = () => {};
  api.appendAuditLog = () => {};
  api.requireSession_ = () => ({ user_id: 'teacher', role: 'teacher' });
  api.requireSubjectAccess_ = () => ({ class_info: state.Classes[0], subject_info: state.Subjects[0] });
  api.validateRowsBelongToClass_ = () => {};

  return { api, state };
}

test('secondary classes accept ร and มส as final-result overrides', () => {
  const { api, state } = createApi('ม.1');

  api.serverSaveSummative('token', 'class', 'subject', [
    { student_id: 'student', coursework: 50, midterm: 20, final: 30, makeup_grade: 'ร' },
  ]);

  let saved = state.SummativeScores[0];
  assert.equal(saved.computed_grade, 4);
  assert.equal(saved.makeup_grade, 'ร');
  assert.equal(saved.final_grade, 'ร');

  api.serverSaveSummative('token', 'class', 'subject', [
    { student_id: 'student', coursework: 50, midterm: 20, final: 30, makeup_grade: 'มส' },
  ]);

  saved = state.SummativeScores[0];
  assert.equal(saved.computed_grade, 4);
  assert.equal(saved.makeup_grade, 'มส');
  assert.equal(saved.final_grade, 'มส');
});

test('secondary numeric makeup grades still work normally', () => {
  const { api, state } = createApi('ม.2');

  api.serverSaveSummative('token', 'class', 'subject', [
    { student_id: 'student', coursework: 50, midterm: 10, final: 20, makeup_grade: 3.5 },
  ]);

  const saved = state.SummativeScores[0];
  assert.equal(saved.computed_grade, 4);
  assert.equal(saved.makeup_grade, 3.5);
  assert.equal(saved.final_grade, 3.5);
});

test('primary P4-P6 remains numeric-only', () => {
  const { api } = createApi('ป.6');

  assert.throws(() => api.serverSaveSummative('token', 'class', 'subject', [
    { student_id: 'student', coursework: 50, midterm: 20, final: 30, makeup_grade: 'ร' },
  ]), /0 ถึง 4/);

  assert.throws(() => api.serverSaveSummative('token', 'class', 'subject', [
    { student_id: 'student', coursework: 50, midterm: 20, final: 30, makeup_grade: 'มส' },
  ]), /0 ถึง 4/);
});

test('automatic coursework sync preserves secondary special results', () => {
  const { api, state } = createApi('ม.3');
  state.SummativeScores.push({
    id: 'existing',
    student_id: 'student',
    subject_id: 'subject',
    coursework: 25,
    coursework_override: '',
    midterm: 10,
    final: 20,
    makeup_grade: 'ร',
    final_grade: 'ร',
  });

  api.syncSummativeCoursework_('class', 'subject', ['student'], 'teacher');

  const saved = state.SummativeScores[0];
  assert.equal(saved.coursework, 50);
  assert.equal(saved.makeup_grade, 'ร');
  assert.equal(saved.final_grade, 'ร');
});

test('secondary-level detection is limited to ม levels', () => {
  const { api } = createApi('ม.1');
  assert.equal(api.isSecondarySummativeLevel_('ม.1'), true);
  assert.equal(api.isSecondarySummativeLevel_(' ม.6 '), true);
  assert.equal(api.isSecondarySummativeLevel_('ป.6'), false);
  assert.equal(api.isSecondarySummativeLevel_('ป.4'), false);
});

test('secondary report aggregates numeric, ร, and มส final grades into exclusive academic buckets', () => {
  const { api } = createApi('ม.4');
  const studentIds = Array.from({ length: 20 }, (_, index) => `student_${index + 1}`);
  const finalGrades = [
    4, 4, 4, 4,
    3.5, 3.5, 3.5,
    3, 3, 3, 3, 3, 3, 3,
    2.5, 2.5,
    2,
    1,
    ' ร ',
    ' มส ',
  ];
  const rows = finalGrades.map((final_grade, index) => ({
    student_id: studentIds[index], subject_id: 'subject', final_grade,
  }));
  rows[0].makeup_grade = 'ร';
  rows.push(
    { student_id: studentIds[0], subject_id: 'subject', final_grade: '' },
    { student_id: studentIds[1], subject_id: 'other_subject', final_grade: 'ร' },
    { student_id: 'outside_class', subject_id: 'subject', final_grade: 'มส' },
  );

  const result = api.summarizeReportFinalGrades_(rows, 'subject', studentIds, ' ม.4 ', 20);
  const counts = Object.fromEntries(Array.from(result.grade_dist, row => [String(row.grade), row.count]));
  assert.deepEqual(counts, {
    '4': 4, '3.5': 3, '3': 7, '2.5': 2, '2': 1, '1.5': 0, '1': 1, '0': 0,
  });
  assert.deepEqual({ ...result.special_grade_counts }, { 'ร': 1, 'มส': 1 });
  assert.equal(counts['0'], 0);
  assert.equal(Object.values(counts).reduce((sum, count) => sum + count, 0) +
    result.special_grade_counts['ร'] + result.special_grade_counts['มส'], 20);
  const reportSource = fs.readFileSync(path.join(teacherRoot, 'report.gs'), 'utf8');
  assert.match(reportSource, /special_grade_counts:\s*gradeSummary\.special_grade_counts/);
});

test('primary report ignores special academic values and preserves numeric grade counting', () => {
  const { api } = createApi('ป.6');
  const result = api.summarizeReportFinalGrades_([
    { student_id: 'student_1', subject_id: 'subject', final_grade: 'ร' },
    { student_id: 'student_2', subject_id: 'subject', final_grade: 'มส' },
    { student_id: 'student_3', subject_id: 'subject', final_grade: 0 },
    { student_id: 'student_4', subject_id: 'subject', final_grade: 4 },
  ], 'subject', ['student_1', 'student_2', 'student_3', 'student_4'], 'ป.6', 4);
  const counts = Object.fromEntries(Array.from(result.grade_dist, row => [String(row.grade), row.count]));
  assert.equal(counts['4'], 1);
  assert.equal(counts['0'], 1);
  assert.deepEqual({ ...result.special_grade_counts }, { 'ร': 0, 'มส': 0 });
});

test('first-page summary uses academic special counts and keeps DevActivity pass/fail separate', () => {
  const html = fs.readFileSync(path.join(teacherRoot, 'class_report.html'), 'utf8');
  const script = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].at(-1)[1]
    .replace(/<\?[\s\S]*?\?>/g, 'x').replace(/loadReport\(\);\s*$/, '');
  const report = vm.createContext({ Math, Number, String, Date, Array, setTimeout: () => {} });
  vm.runInContext(script, report);
  report.referenceShell = (_page, body) => body;
  report.standardReportSectionHeading = () => '';

  const gradeCounts = { '4': 4, '3.5': 3, '3': 7, '2.5': 2, '2': 1, '1.5': 0, '1': 1, '0': 0 };
  const data = {
    school_info: {},
    class_info: { level: 'ม.4', section: '1', class_label: 'ม.4/1' },
    subject_info: { subject_name: 'คณิตศาสตร์', subject_code: 'ค31101' },
    students: Array.from({ length: 20 }, (_, index) => ({ student_id: `student_${index + 1}` })),
    total_students: 20,
    grade_dist: Object.keys(gradeCounts).map(grade => ({ grade, count: gradeCounts[grade], pct: gradeCounts[grade] * 5 })),
    special_grade_counts: { 'ร': 1, 'มส': 1 },
    dev_counts: { 'ผ่าน': 18, 'ไม่ผ่าน': 2, 'ร': 19, 'มส': 17 },
    char_dist: [],
    rtw_dist: [],
  };
  const cover = report.pageReferenceCover(data, 1);
  assert.match(cover, /<td>18<\/td><td>2<\/td><td>1<\/td><td>1<\/td><\/tr>/);
  assert.match(cover, /<td>90\.00<\/td><td>10\.00<\/td><td>5\.00<\/td><td>5\.00<\/td><\/tr>/);
  assert.doesNotMatch(cover, /<td>19<\/td>|<td>17<\/td>/);
  assert.doesNotMatch(html, /devCounts\[['"]ร['"]\]|devCounts\[['"]มส['"]\]/);

  const detail = report.pageReferenceScoreGridSummary({
    summative_students: [
      { seq_no: 1, full_name: 'นักเรียน ร', final_grade: 'ร', computed_grade: 0 },
      { seq_no: 2, full_name: 'นักเรียน มส', final_grade: 'มส', computed_grade: 0 },
      { seq_no: 3, full_name: 'นักเรียนเกรดสี่', final_grade: 4, computed_grade: 4 },
    ],
  }, 2);
  assert.match(detail, /<td class="bold">ร<\/td>/);
  assert.match(detail, /<td class="bold">มส<\/td>/);
  assert.match(detail, /<td class="bold">4<\/td>/);
});
