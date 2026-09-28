// Weekly subject schedules are shared by every teacher assigned to a class/subject.
var SUBJECT_SCHEDULE_DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI'];

function subjectScheduleTerm_() {
  var school = getSchoolInfo() || {};
  return {
    semester: String(school.semester || ''),
    academic_year: String(school.academic_year || '')
  };
}

function schedulePeriod_(value) {
  var period = Number(value);
  if (!Number.isSafeInteger(period) || period < 1) throw new Error('คาบเรียนต้องเป็นจำนวนเต็มมากกว่า 0');
  return period;
}

function normalizeScheduleEntries_(entries) {
  if (!Array.isArray(entries)) throw new Error('ข้อมูลตารางเรียนไม่ถูกต้อง');
  var seen = {};
  return entries.map(function(entry) {
    var day = String(entry && entry.day_of_week || '').toUpperCase();
    if (SUBJECT_SCHEDULE_DAYS.indexOf(day) === -1) throw new Error('วันเรียนไม่ถูกต้อง');
    var period = schedulePeriod_(entry.period);
    var key = day + '|' + period;
    if (seen[key]) return null;
    seen[key] = true;
    return { day_of_week: day, period: period };
  }).filter(Boolean).sort(function(a, b) {
    return SUBJECT_SCHEDULE_DAYS.indexOf(a.day_of_week) - SUBJECT_SCHEDULE_DAYS.indexOf(b.day_of_week) || a.period - b.period;
  });
}

function subjectScheduleRows_(classId, subjectId, term, rows) {
  return (rows || dbGetAll('SubjectSchedules')).filter(function(row) {
    return String(row.class_id) === String(classId) &&
      String(row.subject_id) === String(subjectId) &&
      String(row.semester) === term.semester &&
      String(row.academic_year) === term.academic_year;
  });
}

function getSubjectSchedule(token, class_id, subject_id) {
  var session = requireSession_(token);
  requireSubjectAccess_(session, class_id, subject_id);
  var term = subjectScheduleTerm_();
  var rows = subjectScheduleRows_(class_id, subject_id, term);
  var students = getClassStudentIdSet_(class_id);
  var hasAttendance = dbGetAll('Attendance').some(function(row) {
    return String(row.subject_id) === String(subject_id) && students[String(row.student_id)];
  });
  return {
    entries: normalizeScheduleEntries_(rows),
    has_attendance: hasAttendance,
    semester: term.semester,
    academic_year: term.academic_year
  };
}

function serverSaveSubjectSchedule(token, class_id, subject_id, scheduleEntries, confirmChange) {
  var session = requireSession_(token);
  var entries = normalizeScheduleEntries_(scheduleEntries);
  var term = subjectScheduleTerm_();
  return withDbLock_(function() {
    // Recheck authorization after acquiring the lock so a revoked assignment cannot save.
    requireSubjectAccess_(session, class_id, subject_id);
    var sheet = getSheet('SubjectSchedules');
    var data = sheet.getDataRange().getValues();
    var headers = data[0];
    var positions = [];
    var oldRows = [];
    for (var i = 1; i < data.length; i++) {
      var row = {};
      headers.forEach(function(header, index) { row[header] = data[i][index]; });
      if (subjectScheduleRows_(class_id, subject_id, term, [row]).length) {
        positions.push(i);
        oldRows.push(row);
      }
    }
    var before = normalizeScheduleEntries_(oldRows);
    var changed = oldRows.length !== before.length || JSON.stringify(before) !== JSON.stringify(entries);
    if (!changed) return { ok: true, saved: entries.length, has_attendance: false };
    var students = getClassStudentIdSet_(class_id);
    var hasAttendance = oldRows.length && dbGetAll('Attendance').some(function(row) {
      return String(row.subject_id) === String(subject_id) && students[String(row.student_id)];
    });
    if (hasAttendance && !confirmChange) throw new Error('วิชานี้มีข้อมูลการเข้าเรียนอยู่แล้ว กรุณายืนยันการแก้ไขตารางเรียน');

    var now = new Date().toISOString();
    var existingByKey = {};
    oldRows.forEach(function(row) { existingByKey[String(row.day_of_week) + '|' + Number(row.period)] = row; });
    var values = entries.map(function(entry) {
      var old = existingByKey[entry.day_of_week + '|' + entry.period];
      var record = {
        schedule_id: old ? old.schedule_id : generateId('schedule'),
        class_id: class_id, subject_id: subject_id,
        day_of_week: entry.day_of_week, period: entry.period,
        semester: term.semester, academic_year: term.academic_year,
        created_by: old ? old.created_by : session.user_id,
        updated_at: now
      };
      return headers.map(function(header) { return record[header] === undefined ? '' : record[header]; });
    });
    var reuse = Math.min(positions.length, values.length);
    for (var j = 0; j < reuse; j++) sheet.getRange(positions[j] + 1, 1, 1, headers.length).setValues([values[j]]);
    for (var k = positions.length - 1; k >= reuse; k--) sheet.deleteRow(positions[k] + 1);
    if (values.length > reuse) sheet.getRange(sheet.getLastRow() + 1, 1, values.length - reuse, headers.length).setValues(values.slice(reuse));
    return { ok: true, saved: entries.length, has_attendance: !!hasAttendance };
  });
}

function buildSubjectAttendanceSessions(startDate, requiredDays, holidaySet, scheduleEntries) {
  var byDay = {};
  normalizeScheduleEntries_(scheduleEntries).forEach(function(entry) {
    if (!byDay[entry.day_of_week]) byDay[entry.day_of_week] = [];
    byDay[entry.day_of_week].push(entry.period);
  });
  return buildAttendanceWeeks(startDate, requiredDays, holidaySet).map(function(weekDates) {
    var sessions = [];
    weekDates.forEach(function(date) {
      var day = SUBJECT_SCHEDULE_DAYS[date.getDay() - 1];
      (byDay[day] || []).forEach(function(period) {
        sessions.push({ date: formatDateISO(date), day_of_week: day, period: period });
      });
    });
    return sessions;
  });
}
