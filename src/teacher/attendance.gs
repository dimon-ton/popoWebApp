// US-007: Attendance grid view and edit

var ATTENDANCE_STATUSES = ['/', 'ล', 'ข'];

function attendanceSubjectBelongsToClass(subject, class_id, enrollments) {
  if (!subject) return false;
  if (String(subject.class_id || '') === String(class_id)) return true;
  return enrollments.some(function(enrollment) {
    return String(enrollment.class_id) === String(class_id) &&
      String(enrollment.subject_id) === String(subject.subject_id);
  });
}

function requireAttendanceDestinationAccess(session, class_id, subject_id, enrollments) {
  var cls = dbFindOne('Classes', 'class_id', class_id);
  if (!cls) throw new Error('ไม่พบชั้นเรียน: ' + class_id);

  var subject = dbFindOne('Subjects', 'subject_id', subject_id);
  if (!subject || !attendanceSubjectBelongsToClass(subject, class_id, enrollments)) {
    throw new Error('ไม่พบวิชาในชั้นเรียนนี้');
  }

  if (session.role !== 'admin') {
    var assigned = enrollments.some(function(enrollment) {
      return String(enrollment.class_id) === String(class_id) &&
        String(enrollment.subject_id) === String(subject_id) &&
        String(enrollment.teacher_user_id) === String(session.user_id);
    });
    if (!assigned) throw new Error('ไม่มีสิทธิ์แก้ไขการเข้าเรียนของวิชานี้');
  }

  return { class_info: cls, subject_info: subject };
}

function buildEligibleAttendanceSources(session, class_id, current_subject_id) {
  var enrollments = dbGetAll('Enrollments');
  requireAttendanceDestinationAccess(session, class_id, current_subject_id, enrollments);

  var students = dbFind('Students', 'class_id', class_id);
  if (!students.length) return { sources: [], has_destination_values: false };

  var attendanceConfig = getAttendanceConfig();
  var dates = buildAttendanceDates(attendanceConfig.start_date, attendanceConfig.required_days);
  if (!dates.length) return { sources: [], has_destination_values: false };

  var studentIds = {};
  students.forEach(function(student) { studentIds[String(student.student_id)] = true; });
  var allowedDates = {};
  dates.forEach(function(date) { allowedDates[formatDateISO(date)] = true; });

  var users = {};
  dbGetAll('Users').forEach(function(user) { users[String(user.user_id)] = user.full_name || ''; });

  var rowsBySubject = {};
  var destinationHasValues = false;
  dbGetAll('Attendance').forEach(function(row) {
    var subjectId = String(row.subject_id || '');
    var studentId = String(row.student_id || '');
    var dateStr = formatDateISO(new Date(row.date));
    if (!studentIds[studentId] || !allowedDates[dateStr]) return;
    if (subjectId === String(current_subject_id) && ATTENDANCE_STATUSES.indexOf(String(row.status || '')) !== -1) {
      destinationHasValues = true;
    }
    if (!rowsBySubject[subjectId]) rowsBySubject[subjectId] = [];
    rowsBySubject[subjectId].push(row);
  });

  var requiredRecordCount = students.length * dates.length;
  var sources = [];
  dbGetAll('Subjects').forEach(function(subject) {
    var subjectId = String(subject.subject_id || '');
    if (!subjectId || subjectId === String(current_subject_id)) return;
    if (!attendanceSubjectBelongsToClass(subject, class_id, enrollments)) return;

    var sourceEnrollments = enrollments.filter(function(enrollment) {
      return String(enrollment.class_id) === String(class_id) &&
        String(enrollment.subject_id) === subjectId && String(enrollment.teacher_user_id || '') !== '';
    });
    if (!sourceEnrollments.length) return;

    var teacherIds = {};
    sourceEnrollments.forEach(function(enrollment) {
      teacherIds[String(enrollment.teacher_user_id)] = true;
    });

    var rowsByKey = {};
    var valid = true;
    var updatedAt = '';
    (rowsBySubject[subjectId] || []).forEach(function(row) {
      var studentId = String(row.student_id || '');
      var dateStr = formatDateISO(new Date(row.date));
      if (!studentIds[studentId] || !allowedDates[dateStr]) return;
      var key = studentId + '|' + dateStr;
      var status = String(row.status || '');
      if (rowsByKey[key] || ATTENDANCE_STATUSES.indexOf(status) === -1 || !teacherIds[String(row.updated_by || '')]) {
        valid = false;
        return;
      }
      rowsByKey[key] = row;
      var rowUpdatedAt = String(row.updated_at || '');
      if (rowUpdatedAt > updatedAt) updatedAt = rowUpdatedAt;
    });
    if (!valid || Object.keys(rowsByKey).length !== requiredRecordCount) return;

    sources.push({
      subject_id: subjectId,
      subject_name: subject.subject_name || subjectId,
      teacher_names: Object.keys(teacherIds).map(function(teacherId) { return users[teacherId] || teacherId; }),
      status: 'complete',
      student_count: students.length,
      day_count: dates.length,
      record_count: requiredRecordCount,
      updated_at: updatedAt
    });
  });

  sources.sort(function(a, b) {
    return String(a.subject_name).localeCompare(String(b.subject_name), 'th');
  });
  return { sources: sources, has_destination_values: destinationHasValues };
}

function getEligibleAttendanceSources(token, class_id, current_subject_id) {
  var session = getSession(token);
  if (!session) throw new Error('กรุณาเข้าสู่ระบบ');
  return buildEligibleAttendanceSources(session, class_id, current_subject_id);
}

function getAttendanceSourceValues(token, class_id, current_subject_id, source_subject_id) {
  var session = getSession(token);
  if (!session) throw new Error('กรุณาเข้าสู่ระบบ');

  var eligibility = buildEligibleAttendanceSources(session, class_id, current_subject_id);
  var source = null;
  for (var i = 0; i < eligibility.sources.length; i++) {
    if (String(eligibility.sources[i].subject_id) === String(source_subject_id)) {
      source = eligibility.sources[i];
      break;
    }
  }
  if (!source) throw new Error('แหล่งข้อมูลนี้ไม่มีสิทธิ์ใช้งานหรือข้อมูลยังไม่ครบถ้วน');

  var studentIds = {};
  dbFind('Students', 'class_id', class_id).forEach(function(student) {
    studentIds[String(student.student_id)] = true;
  });
  var attendanceConfig = getAttendanceConfig();
  var allowedDates = {};
  buildAttendanceDates(attendanceConfig.start_date, attendanceConfig.required_days).forEach(function(date) {
    allowedDates[formatDateISO(date)] = true;
  });

  var values = dbGetAll('Attendance').filter(function(row) {
    var dateStr = formatDateISO(new Date(row.date));
    return String(row.subject_id) === String(source_subject_id) &&
      studentIds[String(row.student_id)] && allowedDates[dateStr];
  }).map(function(row) {
    return {
      student_id: String(row.student_id),
      date: formatDateISO(new Date(row.date)),
      status: String(row.status || '')
    };
  });
  values.sort(function(a, b) {
    return a.date === b.date
      ? String(a.student_id).localeCompare(String(b.student_id))
      : String(a.date).localeCompare(String(b.date));
  });

  appendAuditLog(session.user_id, 'AttendanceCopy', current_subject_id, null, {
    class_id: class_id,
    source_subject_id: source_subject_id,
    destination_subject_id: current_subject_id,
    rows_loaded: values.length
  });
  return { source: source, values: values, has_destination_values: eligibility.has_destination_values };
}

// Returns attendance data for a given class/subject/week.
// week: 1–N integer. Week 1 starts on SchoolInfo.semester_start_date exactly.
// If no opening date is configured, the academic-year fallback starts on the
// first Monday on or after May 13.
//
// Returns:
//   { students, week, weekStart, dates, attendance, subject_info, class_info, can_edit }
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

  var enrollments = dbGetAll('Enrollments');
  requireAttendanceDestinationAccess(session, class_id, subject_id, enrollments);

  var attendanceConfig = getAttendanceConfig();
  var allowedDates = {};
  buildAttendanceDates(attendanceConfig.start_date, attendanceConfig.required_days).forEach(function(date) {
    allowedDates[formatDateISO(date)] = true;
  });

  var classStudentIds = {};
  dbFind('Students', 'class_id', class_id).forEach(function(student) {
    classStudentIds[String(student.student_id)] = true;
  });
  var invalidDates = [];
  var invalidStudents = [];
  var invalidStatuses = [];
  var normalizedByKey = {};
  (cells || []).forEach(function(cell) {
    var dateStr = normalizeISODate(cell.date);
    if (!dateStr || !allowedDates[dateStr]) invalidDates.push(String(cell.date || ''));
    var studentId = String(cell.student_id || '');
    if (!classStudentIds[studentId]) invalidStudents.push(studentId);
    var status = String(cell.status || '');
    if (ATTENDANCE_STATUSES.indexOf(status) === -1 && status !== '') invalidStatuses.push(status);
    if (dateStr && allowedDates[dateStr] && classStudentIds[studentId] &&
        (ATTENDANCE_STATUSES.indexOf(status) !== -1 || status === '')) {
      normalizedByKey[studentId + '|' + dateStr] = {
        student_id: studentId,
        date: dateStr,
        status: status
      };
    }
  });
  if (invalidDates.length > 0) {
    throw new Error('วันที่เข้าเรียนอยู่นอกช่วงภาคเรียน: ' + invalidDates.join(', '));
  }
  if (invalidStudents.length > 0) throw new Error('พบนักเรียนที่ไม่ได้อยู่ในชั้นเรียนนี้');
  if (invalidStatuses.length > 0) throw new Error('พบสถานะการเข้าเรียนที่ไม่ถูกต้อง');

  var normalizedCells = Object.keys(normalizedByKey).map(function(key) { return normalizedByKey[key]; });
  if (!normalizedCells.length) return { ok: true, saved: 0 };

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
    var existingByKey = {};
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][subjCol]) !== String(subject_id)) continue;
      var existingDate = formatDateISO(new Date(data[i][dateCol]));
      existingByKey[String(data[i][sidCol]) + '|' + existingDate] = i;
    }

    var modifiedRows = {};
    var appendedRows = [];
    normalizedCells.forEach(function(cell) {
      var key = cell.student_id + '|' + cell.date;
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
