// US-007: Attendance grid view and edit

// Returns attendance data for a given class/subject/week.
// week: 1–40 integer. Week 1 starts on the first Monday of the academic year
// (hardcoded as 2024-05-13 Thai academic year start — this is computed from
// SchoolInfo.academic_year if present, otherwise uses a sensible default).
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

  // Compute week start date (Monday of the requested week)
  // Academic year week 1 starts the first Monday of the academic year
  var weekNum = parseInt(week) || 1;
  if (weekNum < 1) weekNum = 1;
  if (weekNum > 40) weekNum = 40;

  var yearStart = getAcademicYearStart();
  var weekStartMs = yearStart.getTime() + (weekNum - 1) * 7 * 24 * 60 * 60 * 1000;
  var weekStart = new Date(weekStartMs);

  // Build array of 7 dates (Mon–Sun)
  var dates = [];
  for (var d = 0; d < 7; d++) {
    dates.push(new Date(weekStart.getTime() + d * 24 * 60 * 60 * 1000));
  }

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
    weekStart: weekStart.toISOString(),
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

      var dateStr = cell.date; // ISO date string e.g. '2024-05-13'
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
function getAcademicYearStart() {
  try {
    var info = dbGetAll('SchoolInfo');
    if (info.length > 0 && info[0].academic_year) {
      var year = parseInt(String(info[0].academic_year));
      // Convert Thai year to CE year if needed
      if (year > 2500) year = year - 543;
      // Find the first Monday on or after May 13 of this year
      var anchor = new Date(year, 4, 13); // May 13
      var day = anchor.getDay(); // 0=Sun, 1=Mon
      var daysToMon = day === 0 ? 1 : (day === 1 ? 0 : (8 - day));
      anchor.setDate(anchor.getDate() + daysToMon);
      return anchor;
    }
  } catch (e) {}
  // Default fallback: 2024-05-13 (already a Monday)
  return new Date(2024, 4, 13);
}

// Format a Date as YYYY-MM-DD
function formatDateISO(dt) {
  if (!dt || isNaN(dt.getTime())) return '';
  var y = dt.getFullYear();
  var m = String(dt.getMonth() + 1).padStart(2, '0');
  var d = String(dt.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + d;
}
