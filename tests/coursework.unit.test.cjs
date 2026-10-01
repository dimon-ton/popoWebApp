const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const teacherRoot = path.join(__dirname, '..', 'src', 'teacher');

function createApi(overrides = {}) {
  const state = {
    Classes: [{ class_id: 'class', level: 'ป.4' }],
    Subjects: [{ subject_id: 'subject', class_id: 'class' }],
    Enrollments: [],
    Students: [{ student_id: 'student', class_id: 'class' }],
    Indicators: [
      { indicator_id: 'i1', subject_id: 'subject', max_score: 5 },
      { indicator_id: 'i2', subject_id: 'subject', max_score: 10 },
    ],
    IndicatorScores: [
      { id: 's1', student_id: 'student', subject_id: 'subject', indicator_id: 'i1', score: 4 },
      { id: 's2', student_id: 'student', subject_id: 'subject', indicator_id: 'i2', score: 8 },
    ],
    SubjectWeights: [{ subject_id: 'subject', pre_mid_max: 20, mid_max: 20, post_mid_max: 30, final_exam_max: 30 }],
    SummativeScores: [],
    ...overrides,
  };
  const api = vm.createContext({ Math, Number, String, Date, JSON, Object, Array, isFinite, isNaN });
  vm.runInContext(fs.readFileSync(path.join(teacherRoot, 'summative.gs'), 'utf8'), api);
  vm.runInContext(fs.readFileSync(path.join(teacherRoot, 'curriculum.gs'), 'utf8'), api);

  api.dbGetAll = (tab) => state[tab] || [];
  api.dbFind = (tab, field, value) => (state[tab] || []).filter((row) => String(row[field]) === String(value));
  api.dbFindOne = (tab, field, value) => api.dbFind(tab, field, value)[0] || null;
  api.dbInsert = (tab, row) => { state[tab].push({ ...row }); };
  api.dbUpdate = (tab, field, value, updates) => {
    const row = api.dbFindOne(tab, field, value);
    if (!row) return false;
    Object.assign(row, updates);
    return true;
  };
  api.dbDelete = (tab, field, value) => {
    const index = (state[tab] || []).findIndex((row) => String(row[field]) === String(value));
    if (index < 0) return false;
    state[tab].splice(index, 1);
    return true;
  };
  api.dbBatchUpsertRows_ = (tab, keys, rows) => {
    rows.forEach((incoming) => {
      let row = (state[tab] || []).find((candidate) => keys.every((key) => String(candidate[key]) === String(incoming[key])));
      if (row) Object.assign(row, incoming);
      else state[tab].push({ id: `new_${state[tab].length}`, ...incoming });
    });
  };
  api.generateId = () => `ind_${state.Indicators.length + 1}`;
  api.ensureColumns = () => {};
  api.appendAuditLog = () => {};
  api.requireSession_ = () => ({ user_id: 'teacher', role: 'admin' });
  api.getSession = () => ({ user_id: 'teacher', role: 'admin' });
  api.requireSubjectAccess_ = () => ({ class_info: state.Classes[0], subject_info: state.Subjects[0] });
  api.validateRowsBelongToClass_ = () => {};
  api.validateFormativeRows_ = () => {};
  return { api, state };
}

test('indicator totals scale 12/15 to 40/50, full scores to 50, and assessed zero to 0', () => {
  const { api, state } = createApi();
  let context = api.buildIndicatorScoreContext_('subject', ['student']);
  assert.equal(api.calculateCourseworkScore_('subject', 'student', context), 40);

  state.IndicatorScores[0].score = 5;
  state.IndicatorScores[1].score = 10;
  context = api.buildIndicatorScoreContext_('subject', ['student']);
  assert.equal(api.calculateCourseworkScore_('subject', 'student', context), 50);

  state.IndicatorScores[0].score = 0;
  state.IndicatorScores[1].score = 0;
  context = api.buildIndicatorScoreContext_('subject', ['student']);
  assert.equal(api.calculateCourseworkScore_('subject', 'student', context), 0);
});

test('a blank required indicator leaves coursework incomplete instead of treating it as zero', () => {
  const { api, state } = createApi();
  state.IndicatorScores[1].score = '';
  const context = api.buildIndicatorScoreContext_('subject', ['student']);
  const summary = api.getIndicatorScoreSummary_('subject', 'student', context);
  assert.equal(summary.complete, false);
  assert.equal(api.calculateCourseworkScore_('subject', 'student', context), '');
});

test('formative score edits synchronize coursework, total, and grade in one derived row', () => {
  const { api, state } = createApi({
    SummativeScores: [{ student_id: 'student', subject_id: 'subject', coursework: '', midterm: 20, final: 20, makeup_grade: '' }],
  });
  vm.runInContext(fs.readFileSync(path.join(teacherRoot, 'formative.gs'), 'utf8'), api);
  api.serverSaveFormative('token', 'class', 'subject', [
    { student_id: 'student', indicator_id: 'i1', score: 5 },
    { student_id: 'student', indicator_id: 'i2', score: 10 },
  ]);
  const saved = state.SummativeScores[0];
  assert.equal(saved.coursework, 50);
  assert.equal(saved.total, 90);
  assert.equal(saved.computed_grade, 4);
});

test('indicator max-score changes and deletion recalculate coursework', () => {
  const { api, state } = createApi({
    SummativeScores: [{ student_id: 'student', subject_id: 'subject', coursework: 40, midterm: 20, final: 20, makeup_grade: 3 }],
  });
  vm.runInContext(fs.readFileSync(path.join(teacherRoot, 'indicators.gs'), 'utf8'), api);

  api.serverUpdateIndicator('token', 'i2', 'I2', '', 8, 2);
  assert.equal(state.SummativeScores[0].coursework, 46.15);
  assert.equal(state.SummativeScores[0].makeup_grade, 3);
  assert.equal(state.SummativeScores[0].final_grade, 3);

  api.serverDeleteIndicator('token', 'i2');
  assert.equal(state.SummativeScores[0].coursework, 40);
});

test('adding an indicator makes coursework incomplete until that indicator is scored', () => {
  const { api, state } = createApi({
    SummativeScores: [{ student_id: 'student', subject_id: 'subject', coursework: 40, midterm: 20, final: 20, makeup_grade: '' }],
  });
  vm.runInContext(fs.readFileSync(path.join(teacherRoot, 'indicators.gs'), 'utf8'), api);
  api.serverAddIndicator('token', 'subject', 'I3', '', 5, 3);
  assert.equal(state.SummativeScores[0].coursework, '');
  assert.equal(state.SummativeScores[0].computed_grade, '');
  assert.equal(state.SummativeScores[0].final_grade, '');
});

test('manual coursework persists through automatic sync and blank resumes derivation', () => {
  const { api, state } = createApi();
  api.serverSaveSummative('token', 'class', 'subject', [
    { student_id: 'student', coursework: 45, midterm: 20, final: 20, makeup_grade: '' },
  ]);
  let saved = state.SummativeScores[0];
  assert.equal(saved.coursework, 45);
  assert.equal(saved.coursework_override, 45);
  assert.equal(saved.total, 85);

  state.IndicatorScores[0].score = 0;
  state.IndicatorScores[1].score = 0;
  api.syncSummativeCoursework_('class', 'subject', ['student'], 'teacher');
  saved = state.SummativeScores[0];
  assert.equal(saved.coursework, 45);
  assert.equal(saved.coursework_override, 45);

  api.serverSaveSummative('token', 'class', 'subject', [
    { student_id: 'student', coursework: '', midterm: 20, final: 20, makeup_grade: '' },
  ]);
  saved = state.SummativeScores[0];
  assert.equal(saved.coursework, 0);
  assert.equal(saved.coursework_override, '');
});

test('derived coursework remains the default and out-of-range overrides are rejected', () => {
  const { api, state } = createApi();
  api.serverSaveSummative('token', 'class', 'subject', [
    { student_id: 'student', coursework: 40, midterm: '', final: '', makeup_grade: '' },
  ]);
  const saved = state.SummativeScores[0];
  assert.equal(saved.coursework, 40);
  assert.equal(saved.coursework_override, '');
  assert.equal(saved.computed_grade, '');
  assert.throws(() => api.serverSaveSummative('token', 'class', 'subject', [
    { student_id: 'student', coursework: 999, midterm: 20, final: 20, makeup_grade: '' },
  ]), /0 ถึง 50/);

  api.serverSaveSummative('token', 'class', 'subject', [
    { student_id: 'student', coursework: 0, midterm: 20, final: 20, makeup_grade: '' },
  ]);
  assert.equal(state.SummativeScores[0].coursework, 0);
  assert.equal(state.SummativeScores[0].coursework_override, 0);
});

test('coursework input is editable and sizes itself from its own value length', () => {
  const html = fs.readFileSync(path.join(teacherRoot, 'class_summative.html'), 'utf8');
  assert.match(html, /class="score-input coursework-input"[^>]*data-col="coursework"/);
  assert.doesNotMatch(html, /data-col="coursework"[^>]*readonly/);

  const resizeSource = html.match(/function resizeCourseworkInput\(input\) \{[\s\S]*?\n\}/)[0];
  const page = vm.createContext({ Math, String });
  vm.runInContext(resizeSource, page);
  const input = { value: '42', style: {} };
  page.resizeCourseworkInput(input);
  assert.equal(input.style.width, 'calc(2ch + 22px)');
  input.value = '46.15';
  page.resizeCourseworkInput(input);
  assert.equal(input.style.width, 'calc(5ch + 22px)');
});

test('P1-P3 synchronization leaves legacy summative data unchanged', () => {
  const { api, state } = createApi({
    Classes: [{ class_id: 'class', level: 'ป.3' }],
    SummativeScores: [{ student_id: 'student', subject_id: 'subject', coursework: 17, computed_grade: 2 }],
  });
  const result = api.syncSummativeCoursework_('class', 'subject', ['student'], 'teacher');
  assert.equal(result.skipped, true);
  assert.equal(state.SummativeScores[0].coursework, 17);
  assert.equal(state.SummativeScores[0].computed_grade, 2);
});
