// US-007: Attendance grid view and edit

// Returns attendance data for a given class/subject/week.
// week: 1–N integer. Week 1 starts on SchoolInfo.semester_start_date exactly.
// If no opening date is configured, the academic-year fallback starts on the
// first Monday on or after May 13.
//
// Returns:
//   { students, week, weekStart, dates, attendance, subject_info, class_info, can_edit }
function getAttendanceData(token, class_id, subject_id, week) {
  var session = getSession(token);
  if (!session) throw new Error('กรุณาเข้าสู่ระบบ');

  var cls = dbFindOne('Classes', 'class_id', class_id);
  if (!cls) throw new Error('ไม่พบชั้นเรียน: ' + class_id);

  var subj = dbFindOne('Subjects', 'subject_id', subject_id);
  if (!subj) throw new Error('ไม่พบวิชา: ' + subject_id);

  // Authorization: admin or teacher assigned to this (class, subject)
  var can_edit = false;
  if (session.role === 'admin') {
    can_edit = true;
  } else {
    var enrollment = dbGetAll('Enrollments').filter(function(e) {
      return e.class_id === class_id && e.subject_id === subject_id && e.teacher_user_id === session.user_id;
    });
    can_edit = enrollment.length > 0;
  }

  var weekNum = parseInt(week) || 1;
  if (weekNum < 1) weekNum = 1;
  var attendanceConfig = getAttendanceConfig();
  var holidaySet = getHolidayDateSet();
  var attendanceWeeks = buildAttendanceWeeks(attendanceConfig.start_date, attendanceConfig.required_days, holidaySet);
  var maxWeeks = Math.max(1, attendanceWeeks.length);
  if (weekNum > maxWeeks) weekNum = maxWeeks;
  var dates = attendanceWeeks[weekNum - 1] || [];
  var weekStart = dates[0] || attendanceConfig.start_date;

  // Get students ordered by seq_no
  var students = dbFind('Students', 'class_id', class_id);
  students.sort(function(a, b) { return Number(a.seq_no) - Number(b.seq_no); });

  // Get all attendance rows for this subject + date range
  var allAttendance = dbGetAll('Attendance');
  var dateStrings = dates.map(function(dt) { return formatDateISO(dt); });

  // Build map: student_id -> date -> status
  var attMap = {};
  allAttendance.forEach(function(row) {
    if (row.subject_id !== subject_id) return;
    var ds = formatDateISO(new Date(row.date));
    if (dateStrings.indexOf(ds) === -1) return;
    if (!attMap[row.student_id]) attMap[row.student_id] = {};
    attMap[row.student_id][ds] = row.status;
  });

  // Compute per-student totals across full year (all dates for this subject)
  var yearlyMap = {};
  allAttendance.forEach(function(row) {
    if (row.subject_id !== subject_id) return;
    var rowDate = formatDateISO(new Date(row.date));
    if (holidaySet[rowDate]) return;
    var sid = row.student_id;
    if (!yearlyMap[sid]) yearlyMap[sid] = { present: 0, leave: 0, absent: 0 };
    var s = row.status;
    if (s === '/') yearlyMap[sid].present++;
    else if (s === 'ล') yearlyMap[sid].leave++;
    else if (s === 'ข') yearlyMap[sid].absent++;
  });

  return {
    students: students,
    week: weekNum,
    max_weeks: maxWeeks,
    required_attendance_days: attendanceConfig.required_days,
    weekStart: formatDateISO(weekStart),
    dates: dateStrings,
    attendance: attMap,
    yearly: yearlyMap,
    subject_info: subj,
    class_info: withClassLabel(cls),
    can_edit: can_edit
  };
}

// Save attendance for a week.
// cells: array of { student_id, date, status }
// status: '/' | 'ล' | 'ข' | ''
function serverSaveAttendance(token, class_id, subject_id, cells) {
  var session = getSession(token);
  if (!session) throw new Error('กรุณาเข้าสู่ระบบ');

  // Authorization check
  if (session.role !== 'admin') {
    var enrollment = dbGetAll('Enrollments').filter(function(e) {
      return e.class_id === class_id && e.subject_id === subject_id && e.teacher_user_id === session.user_id;
    });
    if (enrollment.length === 0) throw new Error('ไม่มีสิทธิ์แก้ไขการเข้าเรียนของวิชานี้');
  }

  var valid = ['/', 'ล', 'ข', ''];
  var attendanceConfig = getAttendanceConfig();
  var allowedDates = {};
  buildAttendanceDates(attendanceConfig.start_date, attendanceConfig.required_days).forEach(function(date) {
    allowedDates[formatDateISO(date)] = true;
  });
  var invalidDates = [];
  (cells || []).forEach(function(cell) {
    var dateStr = normalizeISODate(cell.date);
    if (!dateStr || !allowedDates[dateStr]) invalidDates.push(String(cell.date || ''));
  });
  if (invalidDates.length > 0) {
    throw new Error('วันที่เข้าเรียนอยู่นอกช่วงภาคเรียน: ' + invalidDates.join(', '));
  }

  var lock = LockService.getDocumentLock();
  if (!lock.tryLock(30000)) throw new Error('ไม่สามารถบันทึกได้ กรุณาลองใหม่');
  try {
    var sheet = getSheet('Attendance');
    var data = sheet.getDataRange().getValues();
    var headers = data[0];
    var sidCol = headers.indexOf('student_id');
    var subjCol = headers.indexOf('subject_id');
    var dateCol = headers.indexOf('date');
    var statusCol = headers.indexOf('status');
    var updByCol = headers.indexOf('updated_by');
    var updAtCol = headers.indexOf('updated_at');
    var idCol = headers.indexOf('attendance_id');

    var now = new Date().toISOString();

    cells.forEach(function(cell) {
      var status = cell.status || '';
      if (valid.indexOf(status) === -1) return; // silently skip invalid status

      var dateStr = normalizeISODate(cell.date); // ISO date string e.g. '2024-05-13'
      var student_id = cell.student_id;

      // Look for existing row to update
      var found = false;
      for (var i = 1; i < data.length; i++) {
        var rowDate = formatDateISO(new Date(data[i][dateCol]));
        if (data[i][sidCol] === student_id &&
            data[i][subjCol] === subject_id &&
            rowDate === dateStr) {
          // Update in place
          sheet.getRange(i + 1, statusCol + 1).setValue(status);
          sheet.getRange(i + 1, updByCol + 1).setValue(session.user_id);
          sheet.getRange(i + 1, updAtCol + 1).setValue(now);
          data[i][statusCol] = status;
          found = true;
          break;
        }
      }

      if (!found && status !== '') {
        // Insert new row
        var newId = generateId('att');
        var newRow = headers.map(function(h) { return ''; });
        newRow[idCol] = newId;
        newRow[sidCol] = student_id;
        newRow[subjCol] = subject_id;
        newRow[dateCol] = dateStr;
        newRow[statusCol] = status;
        newRow[updByCol] = session.user_id;
        newRow[updAtCol] = now;
        sheet.appendRow(newRow);
        // Add to local data array so subsequent iterations can find it
        data.push(newRow);
      }
    });
  } finally {
    lock.releaseLock();
  }

  appendAuditLog(session.user_id, 'Attendance', subject_id, null,
    { class_id: class_id, subject_id: subject_id, cells_saved: cells.length });

  return { ok: true };
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
