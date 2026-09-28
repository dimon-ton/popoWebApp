const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const teacherRoot = path.join(__dirname, '..', 'src', 'teacher');

function createServer(file, state, session = { user_id: 'destination_teacher', role: 'teacher' }) {
  const api = vm.createContext({ Math, Number, String, Date, Object, Array, JSON, isNaN });
  vm.runInContext(fs.readFileSync(path.join(teacherRoot, file), 'utf8'), api);
  api.dbGetAll = (tab) => state[tab] || [];
  api.dbFind = (tab, field, value) => (state[tab] || []).filter((row) => String(row[field]) === String(value));
  api.dbFindOne = (tab, field, value) => api.dbFind(tab, field, value)[0] || null;
  api.getSession = () => session;
  api.withClassLabel = (cls) => ({ ...cls, class_label: `${cls.level}/${cls.section}` });
  api.appendAuditLog = (...args) => { state.audit = args; };
  return api;
}

function assessmentState(table, fields) {
  const partial = { student_id: 'shared', subject_id: 'same_level', updated_by: 'unrelated_writer', updated_at: '2026-02-01' };
  partial[fields[0]] = 0;
  partial[fields[1]] = '';
  partial[fields[2]] = 6;
  partial[fields[3]] = 99;
  const sameClass = { student_id: 'shared', subject_id: 'same_class', updated_by: 'source_teacher', updated_at: '2025-01-01' };
  sameClass[fields[0]] = 8;
  const differentLevel = { student_id: 'shared', subject_id: 'different_level', updated_by: 'source_teacher' };
  differentLevel[fields[0]] = 7;
  const unmatched = { student_id: 'not_in_destination', subject_id: 'no_match', updated_by: 'source_teacher' };
  unmatched[fields[0]] = 5;
  return {
    Classes: [
      { class_id: 'dest_class', level: 'ป.3', section: '2' },
      { class_id: 'same_level_class', level: 'ป.3', section: '1' },
      { class_id: 'different_level_class', level: 'ป.4', section: '1' },
    ],
    Subjects: [
      { subject_id: 'destination', class_id: 'dest_class', subject_name: 'ปลายทาง' },
      { subject_id: 'same_class', class_id: 'dest_class', subject_name: 'ก same class' },
      { subject_id: 'same_level', class_id: 'same_level_class', subject_name: 'ข same level' },
      { subject_id: 'different_level', class_id: 'different_level_class', subject_name: 'ต่างระดับ' },
      { subject_id: 'no_match', class_id: 'same_level_class', subject_name: 'ไม่มีนักเรียนตรงกัน' },
    ],
    Enrollments: [
      { class_id: 'dest_class', subject_id: 'destination', teacher_user_id: 'destination_teacher' },
      { class_id: 'dest_class', subject_id: 'same_class', teacher_user_id: 'source_teacher' },
      { class_id: 'same_level_class', subject_id: 'same_level', teacher_user_id: 'source_teacher' },
      { class_id: 'different_level_class', subject_id: 'different_level', teacher_user_id: 'source_teacher' },
      { class_id: 'same_level_class', subject_id: 'no_match', teacher_user_id: 'source_teacher' },
    ],
    Students: [
      { student_id: 'shared', class_id: 'dest_class' },
      { student_id: 'destination_only', class_id: 'dest_class' },
    ],
    Users: [
      { user_id: 'destination_teacher', full_name: 'ครูปลายทาง' },
      { user_id: 'source_teacher', full_name: 'ครูต้นทาง' },
    ],
    [table]: [sameClass, partial, differentLevel, unmatched],
  };
}

for (const config of [
  { name: 'Characteristics', file: 'characteristics.gs', table: 'Characteristics', fields: ['t1','t2','t3','t4','t5','t6','t7','t8'], list: 'getEligibleCharacteristicsSources', values: 'getCharacteristicsSourceValues' },
  { name: 'ReadThinkWrite', file: 'readthinkwrite.gs', table: 'ReadThinkWrite', fields: ['r1','r2','r3','t1','t2','t3','t4','w1','w2','w3'], list: 'getEligibleReadThinkWriteSources', values: 'getReadThinkWriteSourceValues' },
]) {
  test(`${config.name}: partial same-level data from another teacher is eligible and sparse`, () => {
    const state = assessmentState(config.table, config.fields);
    const api = createServer(config.file, state);
    const result = api[config.list]('token', 'dest_class', 'destination');
    assert.deepEqual(Array.from(result.sources, (source) => source.subject_id), ['same_class', 'same_level']);
    const source = result.sources[1];
    assert.equal(source.class_id, 'same_level_class');
    assert.equal(source.matching_students, 1);
    assert.equal(source.students_with_data, 1);
    assert.equal(source.filled_value_count, 2);
    assert.deepEqual(Array.from(source.teacher_names), ['ครูต้นทาง']);

    const loaded = api[config.values]('token', 'dest_class', 'destination', 'same_level');
    assert.equal(loaded.values.length, 1);
    assert.equal(loaded.values[0].student_id, 'shared');
    assert.equal(loaded.values[0][config.fields[0]], 0);
    assert.equal(loaded.values[0][config.fields[2]], 6);
    assert.equal(Object.prototype.hasOwnProperty.call(loaded.values[0], config.fields[1]), false);
    assert.equal(Object.prototype.hasOwnProperty.call(loaded.values[0], config.fields[3]), false);
  });

  test(`${config.name}: forged, different-level, zero-match, and unauthorized destinations are rejected`, () => {
    const state = assessmentState(config.table, config.fields);
    const api = createServer(config.file, state);
    const offered = api[config.list]('token', 'dest_class', 'destination').sources.map((source) => source.subject_id);
    assert.equal(offered.includes('different_level'), false);
    assert.equal(offered.includes('no_match'), false);
    assert.throws(() => api[config.values]('token', 'dest_class', 'destination', 'different_level'), /ไม่สามารถนำมาใช้/);
    assert.throws(() => api[config.values]('token', 'dest_class', 'destination', 'forged'), /ไม่สามารถนำมาใช้/);

    const unauthorized = createServer(config.file, state, { user_id: 'other_teacher', role: 'teacher' });
    assert.throws(() => unauthorized[config.list]('token', 'dest_class', 'destination'), /ไม่มีสิทธิ์แก้ไข/);
  });
}

function runMergeFunction(file, functionName, fields, source) {
  const html = fs.readFileSync(path.join(teacherRoot, file), 'utf8');
  const functionSource = html.match(new RegExp(`function ${functionName}\\(values\\) \\{[\\s\\S]*?\\n\\}`, 'm'))[0];
  const inputs = {};
  fields.forEach((field, index) => { inputs[field] = { value: String(9 - index) }; });
  const row = {
    getAttribute: () => 'shared',
    querySelector(selector) {
      const match = selector.match(/data-(?:trait|field)="([^"]+)"/);
      if (match) return inputs[match[1]];
      if (selector === 'input.score-input') return inputs[fields[0]];
      return null;
    },
  };
  const elements = {
    sourceModal: { classList: { remove() {} } },
    saveStatus: { textContent: '' },
  };
  const context = vm.createContext({
    Object,
    String,
    COLUMNS: fields.map((key) => ({ key })),
    document: {
      querySelectorAll: () => [row],
      getElementById: (id) => elements[id],
    },
    updateRowTotal() {},
    showToast() {},
    hasUnsavedChanges: false,
  });
  vm.runInContext(functionSource, context);
  context[functionName]([source]);
  return inputs;
}

test('Characteristics client merge preserves blanks and copies numeric zero', () => {
  const inputs = runMergeFunction('class_characteristics.html', 'applySourceValues', ['t1','t2','t3'], { student_id: 'shared', t1: 10, t3: 0 });
  assert.equal(inputs.t1.value, 10);
  assert.equal(inputs.t2.value, '8');
  assert.equal(inputs.t3.value, 0);
});

test('ReadThinkWrite client merge preserves blanks and copies numeric zero', () => {
  const inputs = runMergeFunction('class_readthinkwrite.html', 'applySourceValues', ['r1','r2','r3'], { student_id: 'shared', r1: 10, r3: 0 });
  assert.equal(inputs.r1.value, 10);
  assert.equal(inputs.r2.value, '8');
  assert.equal(inputs.r3.value, 0);
});

test('Attendance: partial same-class data from another teacher is eligible and other classes are rejected', () => {
  const state = {
    Classes: [{ class_id: 'dest_class', level: 'ป.3', section: '1' }, { class_id: 'other_class', level: 'ป.3', section: '2' }],
    Subjects: [
      { subject_id: 'destination', class_id: 'dest_class', subject_name: 'ปลายทาง' },
      { subject_id: 'partial', class_id: 'dest_class', subject_name: 'ต้นทาง' },
      { subject_id: 'other_class_source', class_id: 'other_class', subject_name: 'คนละห้อง' },
    ],
    Enrollments: [
      { class_id: 'dest_class', subject_id: 'destination', teacher_user_id: 'destination_teacher' },
      { class_id: 'dest_class', subject_id: 'partial', teacher_user_id: 'source_teacher' },
      { class_id: 'other_class', subject_id: 'other_class_source', teacher_user_id: 'source_teacher' },
    ],
    Students: [{ student_id: 'shared', class_id: 'dest_class' }, { student_id: 'second', class_id: 'dest_class' }],
    Users: [{ user_id: 'source_teacher', full_name: 'ครูต้นทาง' }],
    Attendance: [
      { student_id: 'shared', subject_id: 'partial', date: '2026-05-18', status: '/', updated_by: 'someone_else', updated_at: '2026-05-18' },
      { student_id: 'shared', subject_id: 'partial', date: '2026-05-19', status: '', updated_by: 'someone_else' },
      { student_id: 'second', subject_id: 'partial', date: '2026-05-19', status: 'invalid', updated_by: 'someone_else' },
      { student_id: 'shared', subject_id: 'other_class_source', date: '2026-05-18', status: '/', updated_by: 'source_teacher' },
    ],
  };
  const api = createServer('attendance.gs', state);
  api.getAttendanceConfig = () => ({ start_date: new Date(2026, 4, 18), required_days: 2 });
  api.buildAttendanceDates = () => [new Date(2026, 4, 18), new Date(2026, 4, 19)];
  api.formatDateISO = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

  const listed = api.getEligibleAttendanceSources('token', 'dest_class', 'destination');
  assert.deepEqual(Array.from(listed.sources, (source) => source.subject_id), ['partial']);
  assert.equal(listed.sources[0].record_count, 1);
  assert.deepEqual(Array.from(listed.sources[0].teacher_names), ['ครูต้นทาง']);
  const loaded = api.getAttendanceSourceValues('token', 'dest_class', 'destination', 'partial');
  assert.equal(loaded.values.length, 1);
  assert.equal(loaded.values[0].status, '/');
  assert.throws(() => api.getAttendanceSourceValues('token', 'dest_class', 'destination', 'other_class_source'), /ไม่สามารถนำมาใช้/);
  const unauthorized = createServer('attendance.gs', state, { user_id: 'other_teacher', role: 'teacher' });
  unauthorized.getAttendanceConfig = api.getAttendanceConfig;
  unauthorized.buildAttendanceDates = api.buildAttendanceDates;
  unauthorized.formatDateISO = api.formatDateISO;
  assert.throws(() => unauthorized.getEligibleAttendanceSources('token', 'dest_class', 'destination'), /ไม่มีสิทธิ์แก้ไข/);
});
