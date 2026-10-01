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
