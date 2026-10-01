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
      setNumberFormat: () => {},
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
  context.ensureSubjectSchedulesSchema_ = () => {};
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

test('yearly totals ignore attendance outside the current schedule and class', () => {
  const { context, sheets } = harness();
  context.serverSaveSubjectSchedule('token', 'class_a', 'math', weekly);
  sheets.Attendance.rows.push(['valid', 'student_a', 'math', '2026-09-30', 3, '/', 'teacher_a', '']);
  sheets.Attendance.rows.push(['removed_period', 'student_a', 'math', '2026-09-30', 9, '/', 'teacher_a', '']);
  sheets.Attendance.rows.push(['wrong_weekday', 'student_a', 'math', '2026-09-29', 3, '/', 'teacher_a', '']);
  sheets.Attendance.rows.push(['other_class', 'student_elsewhere', 'math', '2026-09-30', 3, '/', 'teacher_a', '']);
  sheets.Attendance.rows.push(['blank_status', 'student_a', 'math', '2026-09-30', 4, '', 'teacher_a', '']);

  const result = context.getAttendanceData('token', 'class_a', 'math', 1);
  assert.deepEqual({ ...result.yearly.student_a }, { present: 1, leave: 0, absent: 0 });
  assert.equal(result.yearly.student_elsewhere, undefined);
  assert.equal(result.attendance.student_a['2026-09-30|3'], '/');
  assert.equal(result.attendance.student_a['2026-09-30|4'], undefined);
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

test('unchecking schedule periods deletes only matching attendance rows after confirmation', () => {
  const { context, sheets } = harness();
  context.serverSaveSubjectSchedule('token', 'class_a', 'math', weekly);
  context.serverSaveAttendance('token', 'class_a', 'math', [
    { student_id: 'student_a', date: '2026-09-30', period: 3, status: '/' },
    { student_id: 'student_a', date: '2026-09-30', period: 4, status: 'ข' },
    { student_id: 'student_a', date: '2026-09-28', period: 2, status: 'ล' },
  ]);
  sheets.Attendance.rows.push(['other_day', 'student_a', 'math', '2026-09-28', 3, '/', 'teacher_a', '']);
  sheets.Attendance.rows.push(['other_subject', 'student_a', 'science', '2026-09-30', 3, '/', 'teacher_a', '']);
  sheets.Attendance.rows.push(['other_class', 'student_elsewhere', 'math', '2026-09-30', 3, '/', 'teacher_a', '']);
  assert.throws(() => context.serverSaveSubjectSchedule('token', 'class_a', 'math', [{ day_of_week: 'MON', period: 2 }]), /ยืนยัน/);
  const result = context.serverSaveSubjectSchedule('token', 'class_a', 'math', [{ day_of_week: 'MON', period: 2 }], true);
  assert.equal(result.attendance_deleted, 2);
  assert.deepEqual(sheets.Attendance.rows.slice(1).map(row => row[0]), [
    'att_7', 'other_day', 'other_subject', 'other_class',
  ]);
});

test('adding a schedule period preserves attendance and does not require confirmation', () => {
  const { context, sheets } = harness();
  context.serverSaveSubjectSchedule('token', 'class_a', 'math', weekly);
  context.serverSaveAttendance('token', 'class_a', 'math', [
    { student_id: 'student_a', date: '2026-09-30', period: 3, status: '/' },
  ]);
  const result = context.serverSaveSubjectSchedule('token', 'class_a', 'math', [
    ...weekly, { day_of_week: 'TUE', period: 5 },
  ]);
  assert.equal(result.attendance_deleted, 0);
  assert.equal(sheets.Attendance.rows.length, 2);
});

test('semester bulk attendance fills only blank scheduled cells and preserves existing statuses', () => {
  const { context, sheets } = harness();
  context.serverSaveSubjectSchedule('token', 'class_a', 'math', weekly);
  sheets.Attendance.rows.push([
    'existing_absent', 'student_a', 'math', '2026-09-28', 2, 'ข', 'teacher_a', '2026-09-28T00:00:00.000Z',
  ]);
  const result = context.serverMarkSemesterPresent('token', 'class_a', 'math');
  assert.equal(result.saved, 3);
  assert.equal(result.sessions, 4);
  assert.equal(result.students, 1);
  const records = sheets.Attendance.rows.slice(1);
  assert.equal(records.length, 4);
  assert.equal(records.find(row => row[0] === 'existing_absent')[5], 'ข');
  assert.equal(records.filter(row => row[5] === '/').length, 3);
  const secondRun = context.serverMarkSemesterPresent('token', 'class_a', 'math');
  assert.equal(secondRun.saved, 0);
  assert.equal(sheets.Attendance.rows.length, 5);
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
  assert.match(result, /<th colspan="2">30<\/th>/);
  assert.match(result, /<th style="width:5mm">3<\/th><th style="width:5mm">4<\/th>/);
  assert.doesNotMatch(result, /คาบ/);
  assert.match(result, /<td>\/<\/td><td>ข<\/td>/);
  const indicatorHead = context.indicatorHeaders({ indicators: [{ code: 'พ 5/6 ป.1' }] }, 4);
  assert.match(indicatorHead, /ต พ 5\/6 ป\.1/);
  assert.equal((indicatorHead.match(/class="rot"/g) || []).length, 4);
  assert.doesNotMatch(indicatorHead, /ต 2|ต 3|ต 4/);
});

test('print attendance summary appears only on the final page and uses whole-scope totals', () => {
  const html = fs.readFileSync(path.join(root, 'teacher', 'class_report.html'), 'utf8');
  const script = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].at(-1)[1]
    .replace(/<\?[\s\S]*?\?>/g, 'x').replace(/loadReport\(\);\s*$/, '');
  const context = vm.createContext({ Math, Number, String, Date, Array, setTimeout: () => {} });
  vm.runInContext(script, context);
  context.referenceShell = (_n, body) => body;
  context.standardReportSectionHeading = () => '';
  context.attendanceHolidayNote = () => '';

  const sessions = Array.from({ length: 26 }, (_, index) => ({
    date: `2026-10-${String(index + 1).padStart(2, '0')}`,
    period: 1,
    week: Math.floor(index / 5) + 1,
  }));
  const student = {
    student_id: 'student_a', seq_no: 1, student_code: '100', full_name: 'นักเรียน',
    absent: 1, leave: 1, present: 2,
    attendance: {
      '2026-10-01|1': '/',
      '2026-10-02|1': 'ล',
      '2026-10-25|1': 'ข',
      '2026-10-26|1': '/',
    },
  };

  const onePage = context.pageReferenceAttendance({
    attendance_sessions: sessions.slice(0, 2), attendance_students: [student],
  }, 1);
  assert.equal(onePage.length, 1);
  assert.match(onePage[0], /<th colspan="3" class="attendance-summary-group">สรุปรวม<\/th>/);
  assert.match(onePage[0], /ขาด<\/th>.*ลา<\/th>.*มา<\/th>/s);

  const pages = context.pageReferenceAttendance({ attendance_sessions: sessions, attendance_students: [student] }, 1);
  assert.equal(pages.length, 2);
  assert.doesNotMatch(pages[0], /สรุปรวม|attendance-summary-column/);
  assert.match(pages[1], /สรุปรวม/);
  assert.equal((pages[1].match(/สรุปรวม/g) || []).length, 1);
  assert.match(pages[1], /attendance-summary-absent">1<\/td>.*attendance-summary-leave">1<\/td>.*attendance-summary-present">2<\/td>/s);
  assert.match(pages[1], /<td>ข<\/td><td>\/<\/td>/);
  assert.doesNotMatch(pages[1], /<td>ล<\/td>/);
});

test('report aggregation counts period records and retains separate same-date values', () => {
  const context = vm.createContext({ Date, Math, Number, String, Object, Array, JSON, isNaN });
  vm.runInContext(fs.readFileSync(path.join(root, 'teacher', 'attendance.gs'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(root, 'teacher', 'report.gs'), 'utf8'), context);
  const result = context.summarizeReportAttendanceRows_([
    { student_id: 'a', subject_id: 'math', date: '2026-09-30', period: 3, status: '/' },
    { student_id: 'a', subject_id: 'math', date: '2026-09-30', period: 4, status: 'ข' },
    { student_id: 'a', subject_id: 'math', date: '2026-10-02', period: 1, status: 'ล' },
    { student_id: 'a', subject_id: 'math', date: '2026-10-05', period: 2, status: '' },
    { student_id: 'a', subject_id: 'math', date: '2026-09-30', period: 9, status: '/' },
    { student_id: 'a', subject_id: 'science', date: '2026-09-30', period: 3, status: '/' },
    { student_id: 'b', subject_id: 'math', date: '2026-09-30', period: 3, status: '/' },
  ], 'math', { a: true }, {
    '2026-09-30|3': true,
    '2026-09-30|4': true,
    '2026-10-02|1': true,
    '2026-10-05|2': true,
  }, {
    '2026-09-30': true,
    '2026-10-02': true,
    '2026-10-05': true,
  });
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
  context.originalScheduleEntries = [{ day_of_week: 'WED', period: 3 }, { day_of_week: 'WED', period: 4 }];
  assert.equal(context.hasRemovedScheduleEntries([{ day_of_week: 'WED', period: 3 }]), true);
  assert.equal(context.hasRemovedScheduleEntries([
    { day_of_week: 'WED', period: 3 }, { day_of_week: 'WED', period: 4 }, { day_of_week: 'FRI', period: 1 },
  ]), false);
  const grouped = context.groupAttendanceSessionsByDate([
    { date: '2026-09-30', period: 3 },
    { date: '2026-09-30', period: 4 },
    { date: '2026-10-02', period: 1 },
  ]);
  assert.equal(grouped.length, 2);
  assert.deepEqual(Array.from(grouped[0].sessions, item => item.period), [3, 4]);
  assert.deepEqual(Array.from(grouped[1].sessions, item => item.period), [1]);
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

  const scheduleButton = {
    disabled: false, textContent: 'ตั้งค่าคาบเรียน', innerHTML: '', attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; },
    removeAttribute(name) { delete this.attributes[name]; },
  };
  const scheduleEmptyButton = {
    disabled: false, textContent: 'ตั้งค่าคาบเรียน', innerHTML: '', attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; },
    removeAttribute(name) { delete this.attributes[name]; },
  };
  let requestCount = 0;
  let failureHandler;
  const runner = {
    withSuccessHandler() { return this; },
    withFailureHandler(handler) { failureHandler = handler; return this; },
    getSubjectSchedule() { requestCount++; },
  };
  context.document.getElementById = id => id === 'openScheduleBtn' ? scheduleButton
    : id === 'openScheduleEmptyBtn' ? scheduleEmptyButton : { addEventListener: () => {} };
  context.google = { script: { run: runner } };
  context.openScheduleEditor();
  context.openScheduleEditor();
  assert.equal(requestCount, 1);
  assert.equal(scheduleButton.disabled, true);
  assert.equal(scheduleButton.attributes['aria-busy'], 'true');
  assert.match(scheduleButton.innerHTML, /กำลังโหลด/);
  assert.equal(scheduleEmptyButton.disabled, true);
  assert.equal(scheduleEmptyButton.attributes['aria-busy'], 'true');
  assert.match(scheduleEmptyButton.innerHTML, /กำลังโหลด/);
  failureHandler({ message: 'test error' });
  assert.equal(scheduleButton.disabled, false);
  assert.equal(scheduleButton.textContent, 'ตั้งค่าคาบเรียน');
  assert.equal(scheduleButton.attributes['aria-busy'], undefined);
  assert.equal(scheduleEmptyButton.disabled, false);
  assert.equal(scheduleEmptyButton.textContent, 'ตั้งค่าคาบเรียน');
  assert.equal(scheduleEmptyButton.attributes['aria-busy'], undefined);

  const scheduleSaveButton = {
    disabled: false, textContent: 'ยืนยันการแก้ไข', innerHTML: '', attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; },
    removeAttribute(name) { delete this.attributes[name]; },
  };
  context.scheduleChangeConfirmed = true;
  context.document.getElementById = id => id === 'saveScheduleBtn' ? scheduleSaveButton : { addEventListener: () => {} };
  context.setScheduleSaveLoading(true);
  assert.equal(scheduleSaveButton.disabled, true);
  assert.equal(scheduleSaveButton.attributes['aria-busy'], 'true');
  assert.match(scheduleSaveButton.innerHTML, /button-inline-spinner/);
  assert.match(scheduleSaveButton.innerHTML, /กำลังบันทึก/);
  context.setScheduleSaveLoading(false);
  assert.equal(scheduleSaveButton.disabled, false);
  assert.equal(scheduleSaveButton.textContent, 'ยืนยันการแก้ไข');
  assert.equal(scheduleSaveButton.attributes['aria-busy'], undefined);

  const semesterButton = {
    disabled: false, textContent: '✓ เช็คช่องว่างทั้งภาคเรียนว่ามาเรียน', innerHTML: '', attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; },
    removeAttribute(name) { delete this.attributes[name]; },
  };
  let semesterRequests = 0;
  let semesterSuccess;
  const semesterRunner = {
    withSuccessHandler(handler) { semesterSuccess = handler; return this; },
    withFailureHandler() { return this; },
    serverMarkSemesterPresent() { semesterRequests++; },
  };
  context.pendingChanges = {};
  context.loadAttendance = () => {};
  context.document.getElementById = id => id === 'markSemesterPresentBtn' ? semesterButton : { addEventListener: () => {} };
  context.google = { script: { run: semesterRunner } };
  context.markSemesterPresent();
  context.markSemesterPresent();
  assert.equal(semesterRequests, 1);
  assert.equal(semesterButton.disabled, true);
  assert.equal(semesterButton.attributes['aria-busy'], 'true');
  assert.match(semesterButton.innerHTML, /กำลังเช็คทั้งภาคเรียน/);
  semesterSuccess({ saved: 3 });
  assert.equal(semesterButton.disabled, false);
  assert.equal(semesterButton.textContent, '✓ เช็คช่องว่างทั้งภาคเรียนว่ามาเรียน');
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

test('attendance creates a missing subject schedule tab once before reading it', () => {
  const context = vm.createContext({ Logger: { log: () => {} } });
  vm.runInContext(fs.readFileSync(path.join(root, 'database', 'setup.gs'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(root, 'teacher', 'subject_schedules.gs'), 'utf8'), context);
  const tabs = {};
  let created = 0;
  const spreadsheet = {
    getSheetByName: name => tabs[name] || null,
    insertSheet: name => {
      created++;
      tabs[name] = {
        rows: [],
        getRange: () => ({ setValues: values => { tabs[name].rows = values; }, setFontWeight: () => {} }),
        setFrozenRows: () => {},
      };
      return tabs[name];
    },
  };
  context.PropertiesService = { getScriptProperties: () => ({ getProperty: () => 'db_id' }) };
  context.SpreadsheetApp = { openById: () => spreadsheet };
  context.LockService = { getDocumentLock: () => ({ tryLock: () => true, releaseLock: () => {} }) };
  context.dbGetAll = name => {
    assert.equal(name, 'SubjectSchedules');
    assert.ok(tabs[name]);
    return [];
  };
  const term = { semester: '1', academic_year: '2569' };
  assert.equal(context.subjectScheduleRows_('class_a', 'math', term).length, 0);
  assert.equal(context.subjectScheduleRows_('class_a', 'math', term).length, 0);
  assert.equal(created, 1);
  assert.deepEqual(Array.from(tabs.SubjectSchedules.rows[0]), scheduleHeaders);
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
