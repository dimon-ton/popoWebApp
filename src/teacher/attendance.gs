// US-007: Attendance grid view and edit

var ATTENDANCE_STATUSES = ['/', 'ล', 'ข'];

// Returns attendance data for a given class/subject/week.
// week: 1–N integer. Week 1 starts on SchoolInfo.semester_start_date exactly.
// If no opening date is configured, the academic-year fallback starts on the
// first Monday on or after May 13.
//
// Returns:
//   { students, week, weekStart, sessions, attendance, subject_info, class_info, can_edit }
function getAttendanceData(token, class_id, subject_id, week) {
  var session = requireSession_(token);
  var access = requireSubjectAccess_(session, class_id, subject_id);
  var cls = access.class_info;
  var subj = access.subject_info;
  var can_edit = true;

  var weekNum = parseInt(week) || 1;
  if (weekNum < 1) weekNum = 1;
  var attendanceConfig = getAttendanceConfig();
  var holidaySet = getHolidayDateSet();
  var term = subjectScheduleTerm_();
  var schedule = subjectScheduleRows_(class_id, subject_id, term);
  var calendarWeeks = buildAttendanceWeeks(attendanceConfig.start_date, attendanceConfig.required_days, holidaySet);
  var attendanceWeeks = buildSubjectAttendanceSessions(attendanceConfig.start_date, attendanceConfig.required_days, holidaySet, schedule);
  var maxWeeks = Math.max(1, attendanceWeeks.length);
  if (weekNum > maxWeeks) weekNum = maxWeeks;
  var sessions = attendanceWeeks[weekNum - 1] || [];
  var weekDates = calendarWeeks[weekNum - 1] || [];
  var weekStart = weekDates[0] || attendanceConfig.start_date;

  // Get students ordered by seq_no
  var students = dbFind('Students', 'class_id', class_id);
  students.sort(function(a, b) { return Number(a.seq_no) - Number(b.seq_no); });

  // Get all attendance rows for this subject + date range
  var allAttendance = dbGetAll('Attendance');
  var sessionSet = {};
  sessions.forEach(function(item) { sessionSet[item.date + '|' + item.period] = true; });
  var yearDateSet = {};
  calendarWeeks.forEach(function(weekDates) {
    weekDates.forEach(function(date) { yearDateSet[formatDateISO(date)] = true; });
  });

  // Build period-aware weekly lookup and full-year totals in one pass.
  var attMap = {};
  var yearlyMap = {};
  allAttendance.forEach(function(row) {
    if (String(row.subject_id) !== String(subject_id) || !Number.isSafeInteger(Number(row.period)) || Number(row.period) < 1) return;
    var sid = row.student_id;
    var ds = formatDateISO(new Date(row.date));
    if (!yearDateSet[ds]) return;
    if (!yearlyMap[sid]) yearlyMap[sid] = { present: 0, leave: 0, absent: 0 };
    var s = row.status;
    if (s === '/') yearlyMap[sid].present++;
    else if (s === 'ล') yearlyMap[sid].leave++;
    else if (s === 'ข') yearlyMap[sid].absent++;
    if (sessionSet[ds + '|' + Number(row.period)] && ATTENDANCE_STATUSES.indexOf(String(row.status)) !== -1) {
      if (!attMap[sid]) attMap[sid] = {};
      attMap[sid][ds + '|' + Number(row.period)] = row.status;
    }
  });

  return {
    students: students,
    week: weekNum,
    max_weeks: maxWeeks,
    required_attendance_days: attendanceConfig.required_days,
    weekStart: formatDateISO(weekStart),
    sessions: sessions,
    schedule_entries: normalizeScheduleEntries_(schedule),
    attendance: attMap,
    yearly: yearlyMap,
    subject_info: subj,
    class_info: withClassLabel(cls),
    can_edit: can_edit
  };
}

// Save attendance for a week.
// cells: array of { student_id, date, period, status }
// status: '/' | 'ล' | 'ข' | ''
function serverSaveAttendance(token, class_id, subject_id, cells) {
  var session = getSession(token);
  if (!session) throw new Error('กรุณาเข้าสู่ระบบ');
  if (!Array.isArray(cells)) throw new Error('ข้อมูลการเข้าเรียนไม่ถูกต้อง');

  requireSubjectAccess_(session, class_id, subject_id);

  var attendanceConfig = getAttendanceConfig();
  var term = subjectScheduleTerm_();
  var schedule = subjectScheduleRows_(class_id, subject_id, term);
  var allowedSessions = {};
  buildSubjectAttendanceSessions(attendanceConfig.start_date, attendanceConfig.required_days, getHolidayDateSet(), schedule).forEach(function(weekSessions) {
    weekSessions.forEach(function(item) { allowedSessions[item.date + '|' + item.period] = true; });
  });

  var classStudentIds = {};
  dbFind('Students', 'class_id', class_id).forEach(function(student) {
    classStudentIds[String(student.student_id)] = true;
  });
  var invalidDates = [];
  var invalidStudents = [];
  var invalidStatuses = [];
  var invalidPeriods = [];
  var normalizedByKey = {};
  (cells || []).forEach(function(cell) {
    if (!cell || typeof cell !== 'object') throw new Error('ข้อมูลการเข้าเรียนไม่ถูกต้อง');
    var dateStr = normalizeISODate(cell.date);
    var period;
    try { period = schedulePeriod_(cell.period); } catch (e) { invalidPeriods.push(String(cell.period || '')); }
    if (!dateStr || (period && !allowedSessions[dateStr + '|' + period])) invalidDates.push(String(cell.date || ''));
    var studentId = String(cell.student_id || '');
    if (!classStudentIds[studentId]) invalidStudents.push(studentId);
    var status = String(cell.status || '');
    if (ATTENDANCE_STATUSES.indexOf(status) === -1 && status !== '') invalidStatuses.push(status);
    if (dateStr && period && allowedSessions[dateStr + '|' + period] && classStudentIds[studentId] &&
        (ATTENDANCE_STATUSES.indexOf(status) !== -1 || status === '')) {
      normalizedByKey[studentId + '|' + dateStr + '|' + period] = {
        student_id: studentId,
        date: dateStr,
        period: period,
        status: status
      };
    }
  });
  if (invalidPeriods.length > 0) throw new Error('คาบเรียนต้องเป็นจำนวนเต็มมากกว่า 0');
  if (invalidDates.length > 0) {
    throw new Error('วันหรือคาบเรียนไม่ตรงกับตารางเรียนของวิชานี้: ' + invalidDates.join(', '));
  }
  if (invalidStudents.length > 0) throw new Error('พบนักเรียนที่ไม่ได้อยู่ในชั้นเรียนนี้');
  if (invalidStatuses.length > 0) throw new Error('พบสถานะการเข้าเรียนที่ไม่ถูกต้อง');

  var normalizedCells = Object.keys(normalizedByKey).map(function(key) { return normalizedByKey[key]; });
  if (!normalizedCells.length) return { ok: true, saved: 0 };

  var lock = LockService.getDocumentLock();
  if (!lock.tryLock(30000)) throw new Error('ไม่สามารถบันทึกได้ กรุณาลองใหม่');
  try {
    requireSubjectAccess_(session, class_id, subject_id);
    var liveTerm = subjectScheduleTerm_();
    var liveSessions = {};
    buildSubjectAttendanceSessions(attendanceConfig.start_date, attendanceConfig.required_days, getHolidayDateSet(),
      subjectScheduleRows_(class_id, subject_id, liveTerm)).forEach(function(weekSessions) {
        weekSessions.forEach(function(item) { liveSessions[item.date + '|' + item.period] = true; });
      });
    normalizedCells.forEach(function(cell) {
      if (!liveSessions[cell.date + '|' + cell.period]) throw new Error('วันหรือคาบเรียนไม่ตรงกับตารางเรียนของวิชานี้');
    });
    var sheet = getSheet('Attendance');
    var data = sheet.getDataRange().getValues();
    var headers = data[0];
    var sidCol = headers.indexOf('student_id');
    var subjCol = headers.indexOf('subject_id');
    var dateCol = headers.indexOf('date');
    var periodCol = headers.indexOf('period');
    var statusCol = headers.indexOf('status');
    var updByCol = headers.indexOf('updated_by');
    var updAtCol = headers.indexOf('updated_at');
    var idCol = headers.indexOf('attendance_id');

    var now = new Date().toISOString();
    var existingByKey = {};
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][subjCol]) !== String(subject_id)) continue;
      var existingDate = formatDateISO(new Date(data[i][dateCol]));
      existingByKey[String(data[i][sidCol]) + '|' + existingDate + '|' + Number(data[i][periodCol])] = i;
    }

    var modifiedRows = {};
    var appendedRows = [];
    normalizedCells.forEach(function(cell) {
      var key = cell.student_id + '|' + cell.date + '|' + cell.period;
      var existingIndex = existingByKey[key];
      if (existingIndex !== undefined) {
        data[existingIndex][statusCol] = cell.status;
        data[existingIndex][updByCol] = session.user_id;
        data[existingIndex][updAtCol] = now;
        modifiedRows[existingIndex] = data[existingIndex];
      } else if (cell.status !== '') {
        var newId = generateId('att');
        var newRow = headers.map(function(h) { return ''; });
        newRow[idCol] = newId;
        newRow[sidCol] = cell.student_id;
        newRow[subjCol] = subject_id;
        newRow[dateCol] = cell.date;
        newRow[periodCol] = cell.period;
        newRow[statusCol] = cell.status;
        newRow[updByCol] = session.user_id;
        newRow[updAtCol] = now;
        appendedRows.push(newRow);
      }
    });

    var modifiedIndexes = Object.keys(modifiedRows).map(function(index) { return Number(index); });
    modifiedIndexes.sort(function(a, b) { return a - b; });
    var runStart = null;
    var runRows = [];
    function flushModifiedRun() {
      if (runStart === null || !runRows.length) return;
      sheet.getRange(runStart + 1, 1, runRows.length, headers.length).setValues(runRows);
      runStart = null;
      runRows = [];
    }
    modifiedIndexes.forEach(function(index) {
      if (runStart === null) {
        runStart = index;
      } else if (index !== runStart + runRows.length) {
        flushModifiedRun();
        runStart = index;
      }
      runRows.push(modifiedRows[index]);
    });
    flushModifiedRun();

    if (appendedRows.length) {
      sheet.getRange(sheet.getLastRow() + 1, 1, appendedRows.length, headers.length).setValues(appendedRows);
    }
  } finally {
    lock.releaseLock();
  }

  appendAuditLog(session.user_id, 'Attendance', subject_id, null,
    { class_id: class_id, subject_id: subject_id, cells_saved: normalizedCells.length });

  return { ok: true, saved: normalizedCells.length };
}

// Returns the first Monday of the academic year based on SchoolInfo.academic_year
// academic_year format: "2567" (Thai year) or "2024"
// Thai academic year starts in mid-May; we use May 13 as the anchor
function getAttendanceConfig() {
  try {
    var row = getSchoolInfo();
    var configuredStart = parseISODate(row.semester_start_date);
    var requiredDays = parseInt(row.required_attendance_days, 10) || 200;
    if (configuredStart) return { start_date: configuredStart, required_days: requiredDays };
    if (row.academic_year) {
      var year = parseInt(String(row.academic_year));
      // Convert Thai year to CE year if needed
      if (year > 2500) year = year - 543;
      // Find the first Monday on or after May 13 of this year
      var anchor = new Date(year, 4, 13); // May 13
      var day = anchor.getDay(); // 0=Sun, 1=Mon
      var daysToMon = day === 0 ? 1 : (day === 1 ? 0 : (8 - day));
      anchor.setDate(anchor.getDate() + daysToMon);
      return { start_date: anchor, required_days: requiredDays };
    }
  } catch (e) {}
  return { start_date: new Date(2024, 4, 13), required_days: 200 };
}

function parseISODate(value) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  var s = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  var parts = s.split('-');
  var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  if (isNaN(d.getTime()) ||
      d.getFullYear() !== Number(parts[0]) ||
      d.getMonth() !== Number(parts[1]) - 1 ||
      d.getDate() !== Number(parts[2])) return null;
  return d;
}

function normalizeISODate(value) {
  var date = parseISODate(value);
  return date ? formatDateISO(date) : '';
}

function buildAttendanceDates(startDate, requiredDays) {
  var dates = [];
  buildAttendanceWeeks(startDate, requiredDays, getHolidayDateSet()).forEach(function(weekDates) {
    weekDates.forEach(function(date) {
      dates.push(date);
    });
  });
  return dates;
}

// Week 1 begins on the semester opening date and contains weekdays through
// Friday. Every following week contains Monday through Friday. Saturdays and
// Sundays are excluded. The last week may be shorter when requiredDays is reached.
function buildAttendanceWeeks(startDate, requiredDays, holidaySet) {
  var weeks = [];
  var dates = [];
  var cursor = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  var limit = Math.max(1, Math.min(parseInt(requiredDays, 10) || 200, 260));
  var total = 0;
  holidaySet = holidaySet || {};

  while (total < limit) {
    var day = cursor.getDay();
    var iso = formatDateISO(cursor);
    if (day !== 0 && day !== 6 && !holidaySet[iso]) {
      dates.push(new Date(cursor.getTime()));
      total++;
    }
    var isEndOfWeek = day === 0;
    cursor.setDate(cursor.getDate() + 1);
    if ((isEndOfWeek || total === limit) && dates.length > 0) {
      weeks.push(dates);
      dates = [];
    }
  }
  return weeks;
}

// Format a Date as YYYY-MM-DD
function formatDateISO(dt) {
  if (!dt || isNaN(dt.getTime())) return '';
  var y = dt.getFullYear();
  var m = String(dt.getMonth() + 1).padStart(2, '0');
  var d = String(dt.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + d;
}
