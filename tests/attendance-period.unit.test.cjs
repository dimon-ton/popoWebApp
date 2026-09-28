const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..', 'src');
const scheduleHeaders = ['schedule_id','class_id','subject_id','day_of_week','period','semester','academic_year','created_by','updated_at'];
const attendanceHeaders = ['attendance_id','student_id','subject_id','date','period','status','updated_by','updated_at'];

function sheet(headers) {
  const rows = [headers];
  return {
    rows,
    getDataRange: () => ({ getValues: () => rows.map(row => [...row]) }),
    getRange: (row, col, count) => ({
      getValues: () => rows.slice(row - 1, row - 1 + count).map(value => [...value]),
      setValues: values => values.forEach((value, offset) => { rows[row - 1 + offset] = [...value]; }),
    }),
    getLastRow: () => rows.length,
    getLastColumn: () => headers.length,
    deleteRow: row => rows.splice(row - 1, 1),
  };
}

function harness(role = 'teacher', userId = 'teacher_a') {
  const tables = {
    Classes: [{ class_id: 'class_a', level: 'ป.4', section: '1' }],
    Subjects: [{ subject_id: 'math', class_id: 'class_a', subject_name: 'คณิตศาสตร์' }],
    Enrollments: [
      { class_id: 'class_a', subject_id: 'math', teacher_user_id: 'teacher_a' },
      { class_id: 'class_a', subject_id: 'math', teacher_user_id: 'teacher_b' },
    ],
    Students: [{ student_id: 'student_a', class_id: 'class_a', seq_no: 1 }],
  };
  const sheets = { SubjectSchedules: sheet(scheduleHeaders), Attendance: sheet(attendanceHeaders) };
  const context = vm.createContext({ Date, Math, Number, String, Object, Array, JSON, isNaN });
  for (const file of ['shared/security.gs', 'teacher/subject_schedules.gs', 'teacher/attendance.gs']) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context);
  }
  context.getSession = () => ({ role, user_id: userId });
  context.getSchoolInfo = () => ({ semester: '1', academic_year: '2569', semester_start_date: '2026-09-28', required_attendance_days: 5 });
  context.getHolidayDateSet = () => ({});
  context.dbGetAll = tab => sheets[tab]
    ? sheets[tab].rows.slice(1).map(row => Object.fromEntries(sheets[tab].rows[0].map((key, index) => [key, row[index]])))
    : tables[tab] || [];
  context.dbFind = (tab, key, value) => context.dbGetAll(tab).filter(row => String(row[key]) === String(value));
  context.dbFindOne = (tab, key, value) => context.dbFind(tab, key, value)[0] || null;
  context.getSheet = tab => sheets[tab];
  context.withDbLock_ = fn => fn();
  context.LockService = { getDocumentLock: () => ({ tryLock: () => true, releaseLock: () => {} }) };
  context.withClassLabel = cls => ({ ...cls, class_label: 'ป.4/1' });
  context.appendAuditLog = () => {};
  let id = 0;
  context.generateId = prefix => `${prefix}_${++id}`;
  return { context, tables, sheets };
}

const weekly = [
  { day_of_week: 'MON', period: 2 },
  { day_of_week: 'WED', period: 3 },
  { day_of_week: 'WED', period: 4 },
  { day_of_week: 'FRI', period: 1 },
];

test('schedule access follows Enrollments, allows co-teachers and admin, and rejects forged pairs', () => {
  const assigned = harness();
  assert.equal(assigned.context.serverSaveSubjectSchedule('token', 'class_a', 'math', weekly).saved, 4);
  assert.throws(() => harness('teacher', 'intruder').context.getSubjectSchedule('token', 'class_a', 'math'), /ไม่มีสิทธิ์/);
  assert.throws(() => harness('teacher', 'intruder').context.serverSaveSubjectSchedule('token', 'class_a', 'math', weekly), /ไม่มีสิทธิ์/);
  assert.throws(() => assigned.context.serverSaveSubjectSchedule('token', 'forged_class', 'math', weekly), /ไม่พบชั้นเรียน/);
  const coTeacher = assigned;
  coTeacher.context.getSession = () => ({ role: 'teacher', user_id: 'teacher_b' });
  assert.equal(coTeacher.context.getSubjectSchedule('token', 'class_a', 'math').entries.length, 4);
  assert.equal(coTeacher.context.serverSaveSubjectSchedule('token', 'class_a', 'math', [...weekly, { day_of_week: 'FRI', period: 2 }]).saved, 5);
  assert.equal(coTeacher.context.getSubjectSchedule('token', 'class_a', 'math').entries.length, 5);
  const admin = harness('admin', 'admin_a');
  admin.tables.Enrollments.length = 0;
  assert.equal(admin.context.serverSaveSubjectSchedule('token', 'class_a', 'math', weekly).saved, 4);
});

test('duplicate weekdays/periods are deduplicated and invalid values are rejected', () => {
  const { context, sheets } = harness();
  const result = context.serverSaveSubjectSchedule('token', 'class_a', 'math', [...weekly, weekly[2], weekly[2]]);
  assert.equal(result.saved, 4);
  assert.equal(sheets.SubjectSchedules.rows.length, 5);
  for (const bad of [0, -2, 1.5, 'abc']) {
    assert.throws(() => context.serverSaveSubjectSchedule('token', 'class_a', 'math', [{ day_of_week: 'MON', period: bad }]), /คาบเรียน/);
  }
  assert.throws(() => context.serverSaveSubjectSchedule('token', 'class_a', 'math', [{ day_of_week: 'SUN', period: 1 }]), /วันเรียน/);
});

test('schedule replacement touches only its class, subject, and term', () => {
  const { context, sheets } = harness();
  sheets.SubjectSchedules.rows.push(['other_1', 'class_a', 'other_subject', 'MON', 1, '1', '2569', 'other', '']);
  sheets.SubjectSchedules.rows.push(['other_2', 'class_a', 'math', 'MON', 1, '2', '2569', 'other', '']);
  context.serverSaveSubjectSchedule('token', 'class_a', 'math', weekly);
  context.serverSaveSubjectSchedule('token', 'class_a', 'math', [{ day_of_week: 'THU', period: 5 }]);
  const rows = context.dbGetAll('SubjectSchedules');
  assert.equal(rows.some(row => row.schedule_id === 'other_1'), true);
  assert.equal(rows.some(row => row.schedule_id === 'other_2'), true);
  assert.equal(rows.filter(row => row.subject_id === 'math' && String(row.semester) === '1').length, 1);
});

test('sessions omit unscheduled days and holidays while preserving two periods on Wednesday', () => {
  const { context } = harness();
  const weeks = context.buildSubjectAttendanceSessions(new Date(2026, 8, 28), 5, {}, weekly);
  assert.deepEqual(Array.from(weeks[0], row => `${row.date}|${row.period}`), [
    '2026-09-28|2', '2026-09-30|3', '2026-09-30|4', '2026-10-02|1',
  ]);
  const holidayWeeks = context.buildSubjectAttendanceSessions(new Date(2026, 8, 28), 5, { '2026-09-30': true }, weekly);
  assert.equal(holidayWeeks[0].some(row => row.date === '2026-09-30'), false);
});

test('two periods save independently, appear independently, and count as two hours', () => {
  const { context, sheets } = harness();
  context.serverSaveSubjectSchedule('token', 'class_a', 'math', weekly);
  assert.equal(context.serverSaveAttendance('token', 'class_a', 'math', [
    { student_id: 'student_a', date: '2026-09-30', period: 3, status: '/' },
    { student_id: 'student_a', date: '2026-09-30', period: 4, status: 'ข' },
  ]).saved, 2);
  const result = context.getAttendanceData('token', 'class_a', 'math', 1);
  assert.equal(result.attendance.student_a['2026-09-30|3'], '/');
  assert.equal(result.attendance.student_a['2026-09-30|4'], 'ข');
  assert.equal(result.yearly.student_a.present, 1);
  assert.equal(result.yearly.student_a.absent, 1);
  context.serverSaveAttendance('token', 'class_a', 'math', [
    { student_id: 'student_a', date: '2026-09-30', period: 4, status: 'ล' },
  ]);
  assert.equal(sheets.Attendance.rows.length, 3);
  assert.equal(context.getAttendanceData('token', 'class_a', 'math', 1).attendance.student_a['2026-09-30|3'], '/');
  assert.equal(context.getAttendanceData('token', 'class_a', 'math', 1).attendance.student_a['2026-09-30|4'], 'ล');
});

test('unscheduled periods, invalid periods, and forged teacher saves are rejected', () => {
  const { context, sheets } = harness();
  context.serverSaveSubjectSchedule('token', 'class_a', 'math', weekly);
  for (const period of [0, -1, 99, '']) {
    assert.throws(() => context.serverSaveAttendance('token', 'class_a', 'math', [
      { student_id: 'student_a', date: '2026-09-30', period, status: '/' },
    ]), /คาบเรียน|ตารางเรียน/);
  }
  context.getSession = () => ({ role: 'teacher', user_id: 'intruder' });
  assert.throws(() => context.serverSaveAttendance('token', 'class_a', 'math', [
    { student_id: 'student_a', date: '2026-09-30', period: 3, status: '/' },
  ]), /ไม่มีสิทธิ์/);
  assert.equal(sheets.Attendance.rows.length, 1);
});

test('editing a schedule requires confirmation with attendance and retains every attendance row', () => {
  const { context, sheets } = harness();
  context.serverSaveSubjectSchedule('token', 'class_a', 'math', weekly);
  context.serverSaveAttendance('token', 'class_a', 'math', [
    { student_id: 'student_a', date: '2026-09-30', period: 3, status: '/' },
  ]);
  assert.throws(() => context.serverSaveSubjectSchedule('token', 'class_a', 'math', [{ day_of_week: 'MON', period: 2 }]), /ยืนยัน/);
  context.serverSaveSubjectSchedule('token', 'class_a', 'math', [{ day_of_week: 'MON', period: 2 }], true);
  assert.equal(sheets.Attendance.rows.length, 2);
  assert.equal(sheets.Attendance.rows[1][attendanceHeaders.indexOf('period')], 3);
});

test('report attendance cells distinguish periods on the same date', () => {
  const html = fs.readFileSync(path.join(root, 'teacher', 'class_report.html'), 'utf8');
  const script = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].at(-1)[1]
    .replace(/<\?[\s\S]*?\?>/g, 'x').replace(/loadReport\(\);\s*$/, '');
  const context = vm.createContext({ Math, Number, String, Date, Array, setTimeout: () => {} });
  vm.runInContext(script, context);
  context.referenceShell = (_n, body) => body;
  context.standardReportSectionHeading = () => '';
  context.attendanceHolidayNote = () => '';
  const result = context.pageReferenceAttendanceChunk({
    attendance_students: [{ student_id: 'student_a', seq_no: 1, student_code: '100', full_name: 'นักเรียน', attendance: { '2026-09-30|3': '/', '2026-09-30|4': 'ข' } }],
  }, 1, [{ date: '2026-09-30', period: 3, week: 1 }, { date: '2026-09-30', period: 4, week: 1 }], 0);
  assert.match(result, /คาบ 3/);
  assert.match(result, /คาบ 4/);
  assert.match(result, /<td>\/<\/td><td>ข<\/td>/);
});

test('report aggregation counts period records and retains separate same-date values', () => {
  const context = vm.createContext({ Date, Math, Number, String, Object, Array, JSON, isNaN });
  vm.runInContext(fs.readFileSync(path.join(root, 'teacher', 'attendance.gs'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(root, 'teacher', 'report.gs'), 'utf8'), context);
  const result = context.summarizeReportAttendanceRows_([
    { student_id: 'a', subject_id: 'math', date: '2026-09-30', period: 3, status: '/' },
    { student_id: 'a', subject_id: 'math', date: '2026-09-30', period: 4, status: 'ข' },
    { student_id: 'a', subject_id: 'math', date: '2026-10-02', period: 1, status: 'ล' },
    { student_id: 'a', subject_id: 'math', date: '2026-09-30', period: '', status: '/' },
    { student_id: 'b', subject_id: 'math', date: '2026-09-30', period: 3, status: '/' },
  ], 'math', { a: true }, { '2026-09-30|3': true, '2026-09-30|4': true });
  assert.equal(result.totals.a.present, 1);
  assert.equal(result.totals.a.leave, 1);
  assert.equal(result.totals.a.absent, 1);
  assert.equal(result.totals.a.total, 3);
  assert.equal(result.by_student.a['2026-09-30|3'], '/');
  assert.equal(result.by_student.a['2026-09-30|4'], 'ข');
});

test('client click cycle and bulk actions keep date and period separate', () => {
  const html = fs.readFileSync(path.join(root, 'teacher', 'class_attendance.html'), 'utf8');
  const script = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].at(-1)[1]
    .replace(/<\?[\s\S]*?\?>/g, 'null')
    .replace(/buildWeekSelect\(\);\s*loadAttendance\(\);\s*$/, '');
  const cells = [3, 4].map(period => ({
    textContent: '', className: 'att-cell',
    getAttribute: key => ({ 'data-student': 'a', 'data-date': '2026-09-30', 'data-period': String(period) })[key],
  }));
  const context = vm.createContext({
    Date, Math, Number, String, Object, Array, JSON, setTimeout: () => {},
    window: { addEventListener: () => {} },
    document: {
      getElementById: () => ({ addEventListener: () => {} }), addEventListener: () => {},
      querySelectorAll: selector => selector.includes('[data-period="3"]') ? [cells[0]]
        : selector.includes('[data-period="4"]') ? [cells[1]] : cells,
    },
  });
  vm.runInContext(script, context);
  context.refreshAttendanceWeeklyTotals = () => {};
  context.showToast = () => {};
  context.currentData = { can_edit: true, sessions: [{ date: '2026-09-30', period: 3 }, { date: '2026-09-30', period: 4 }] };
  for (const status of ['/', 'ล', 'ข', '']) {
    context.cycleCell(cells[0]);
    assert.equal(cells[0].textContent, status);
  }
  context.markPresentForSession('2026-09-30', 3);
  assert.equal(cells[0].textContent, '/');
  assert.equal(cells[1].textContent, '');
  context.markAllPresentForWeek();
  assert.equal(cells[1].textContent, '/');
  assert.equal(context.pendingChanges['a|2026-09-30|3'].status, '/');
  assert.equal(context.pendingChanges['a|2026-09-30|4'].status, '/');
});

test('schema includes SubjectSchedules and attendance copy controls are absent', () => {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(root, 'database', 'setup.gs'), 'utf8'), context);
  assert.equal(context.TAB_ORDER.includes('SubjectSchedules'), true);
  assert.deepEqual(Array.from(context.TAB_SCHEMA.SubjectSchedules), scheduleHeaders);
  const html = fs.readFileSync(path.join(root, 'teacher', 'class_attendance.html'), 'utf8');
  assert.equal(html.includes('openCopyBtn'), false);
  assert.equal(html.includes('getAttendanceSourceValues'), false);
});

test('database setup appends missing schedule columns without changing existing data', () => {
  const context = vm.createContext({ Logger: { log: () => {} } });
  vm.runInContext(fs.readFileSync(path.join(root, 'database', 'setup.gs'), 'utf8'), context);
  const rows = [['schedule_id', 'class_id'], ['existing', 'class_a']];
  const existingSheet = {
    getLastRow: () => rows.length,
    getLastColumn: () => rows[0].length,
    getRange: (row, col, count) => ({
      getValues: () => rows.slice(row - 1, row - 1 + count).map(value => [...value]),
      setValues: values => values[0].forEach((value, index) => { rows[row - 1][col - 1 + index] = value; }),
      setFontWeight: () => {},
    }),
  };
  const spreadsheet = { getSheetByName: () => existingSheet };
  context.ensureTab(spreadsheet, 'SubjectSchedules', context.TAB_SCHEMA.SubjectSchedules);
  context.ensureTab(spreadsheet, 'SubjectSchedules', context.TAB_SCHEMA.SubjectSchedules);
  assert.deepEqual(rows[0], scheduleHeaders);
  assert.deepEqual(rows[1], ['existing', 'class_a']);
});
