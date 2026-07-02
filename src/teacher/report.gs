// US-013: Cover report aggregates (ปก)

// Returns all data needed to render the cover report page.
// Returns: { school_info, class_info, subject_info, teacher_name, homeroom_teacher_name,
//            total_students, grade_dist, char_dist, rtw_dist, dev_activity }
function getReportData(token, class_id, subject_id) {
  var session = getSession(token);
  if (!session) throw new Error('กรุณาเข้าสู่ระบบ');

  var cls = dbFindOne('Classes', 'class_id', class_id);
  if (!cls) throw new Error('ไม่พบชั้นเรียน: ' + class_id);

  var subj = dbFindOne('Subjects', 'subject_id', subject_id);
  if (!subj) throw new Error('ไม่พบวิชา: ' + subject_id);

  // School info (single-row table)
  var schoolRows = dbGetAll('SchoolInfo');
  var school_info = schoolRows.length > 0 ? schoolRows[0] : {};

  // Teacher assigned to this (class, subject)
  var enrollment = dbGetAll('Enrollments').filter(function(e) {
    return e.class_id === class_id && e.subject_id === subject_id;
  });
  var teacher_name = '';
  if (enrollment.length > 0 && enrollment[0].teacher_user_id) {
    var teacher = dbFindOne('Users', 'user_id', enrollment[0].teacher_user_id);
    if (teacher) teacher_name = teacher.full_name || '';
  }

  // Homeroom teachers. Supports the new JSON list and the old single-teacher field.
  var homeroom_teacher_names = getHomeroomTeacherNames(cls);
  var homeroom_teacher_name = homeroom_teacher_names.join(', ');

  // Students in this class
  var students = dbFind('Students', 'class_id', class_id);
  students.sort(function(a, b) { return Number(a.seq_no) - Number(b.seq_no); });
  var total_students = students.length;
  var studentIds = students.map(function(s) { return s.student_id; });

  // --- Grade distribution from SummativeScores ---
  var allSummative = dbGetAll('SummativeScores');
  var gradeLabels = [4, 3.5, 3, 2.5, 2, 1.5, 1, 0];
  var gradeCounts = {};
  gradeLabels.forEach(function(g) { gradeCounts[String(g)] = 0; });

  var gradedStudents = 0;
  allSummative.forEach(function(row) {
    if (row.subject_id !== subject_id) return;
    if (studentIds.indexOf(row.student_id) === -1) return;
    var fg = row.final_grade;
    if (fg === '' || fg === null || fg === undefined) return;
    gradedStudents++;
    var key = String(fg);
    if (gradeCounts[key] !== undefined) gradeCounts[key]++;
  });

  var grade_dist = gradeLabels.map(function(g) {
    var cnt = gradeCounts[String(g)] || 0;
    return {
      grade: g,
      count: cnt,
      pct: total_students > 0 ? Math.round(cnt * 100 / total_students * 10) / 10 : 0
    };
  });

  // --- Characteristics distribution ---
  var allChar = dbGetAll('Characteristics');
  var charBuckets = ['ดีเยี่ยม', 'ดี', 'ผ่านเกณฑ์', 'ไม่ผ่าน'];
  var charCounts = { 'ดีเยี่ยม': 0, 'ดี': 0, 'ผ่านเกณฑ์': 0, 'ไม่ผ่าน': 0 };
  allChar.forEach(function(row) {
    if (row.subject_id !== subject_id) return;
    if (studentIds.indexOf(row.student_id) === -1) return;
    var lbl = row.label;
    if (lbl && charCounts[lbl] !== undefined) charCounts[lbl]++;
  });
  var char_dist = charBuckets.map(function(b) {
    var cnt = charCounts[b] || 0;
    return {
      label: b,
      count: cnt,
      pct: total_students > 0 ? Math.round(cnt * 100 / total_students * 10) / 10 : 0
    };
  });

  // --- Read-Think-Write distribution ---
  var allRtw = dbGetAll('ReadThinkWrite');
  var rtwBuckets = ['ดีเยี่ยม', 'ดี', 'ผ่านเกณฑ์', 'ไม่ผ่าน'];
  var rtwCounts = { 'ดีเยี่ยม': 0, 'ดี': 0, 'ผ่านเกณฑ์': 0, 'ไม่ผ่าน': 0 };
  allRtw.forEach(function(row) {
    if (row.subject_id !== subject_id) return;
    if (studentIds.indexOf(row.student_id) === -1) return;
    var lbl = row.label;
    if (lbl && rtwCounts[lbl] !== undefined) rtwCounts[lbl]++;
  });
  var rtw_dist = rtwBuckets.map(function(b) {
    var cnt = rtwCounts[b] || 0;
    return {
      label: b,
      count: cnt,
      pct: total_students > 0 ? Math.round(cnt * 100 / total_students * 10) / 10 : 0
    };
  });

  // --- กิจกรรมพัฒนาผู้เรียน from DevActivity ---
  var devCounts = { 'ผ่าน': 0, 'ไม่ผ่าน': 0, 'ร': 0, 'มส': 0 };
  var devMap = {};
  try {
    var allDev = dbGetAll('DevActivity');
    allDev.forEach(function(row) {
      if (row.subject_id !== subject_id) return;
      if (studentIds.indexOf(row.student_id) === -1) return;
      devMap[row.student_id] = row.result || '';
      var r = row.result;
      if (r && devCounts[r] !== undefined) devCounts[r]++;
    });
  } catch (e) {
    // DevActivity tab may not exist yet — ok, counts stay 0
  }

  // Build per-student dev activity list
  var dev_students = students.map(function(s) {
    return { student_id: s.student_id, full_name: s.full_name, seq_no: s.seq_no, result: devMap[s.student_id] || '' };
  });

  return {
    school_info: school_info,
    class_info: withClassLabel(cls),
    subject_info: subj,
    teacher_name: teacher_name,
    homeroom_teacher_name: homeroom_teacher_name,
    homeroom_teacher_names: homeroom_teacher_names,
    total_students: total_students,
    grade_dist: grade_dist,
    char_dist: char_dist,
    rtw_dist: rtw_dist,
    dev_counts: devCounts,
    dev_students: dev_students,
    can_edit: session.role === 'admin' || (enrollment.length > 0 && enrollment[0].teacher_user_id === session.user_id)
  };
}

// Full printable ป.พ.5 report packet data.
// Returns the cover aggregates above plus row-level data for the 17-page A4
// HTML report book rendered by class_report.html.
function getReportBookData(token, class_id, subject_id) {
  var d = getReportData(token, class_id, subject_id);
  var students = dbFind('Students', 'class_id', class_id);
  students.sort(function(a, b) { return Number(a.seq_no) - Number(b.seq_no); });
  var studentIds = students.map(function(s) { return s.student_id; });
  var studentSet = {};
  studentIds.forEach(function(id) { studentSet[id] = true; });

  var indicators = dbFind('Indicators', 'subject_id', subject_id);
  indicators.sort(function(a, b) { return Number(a.display_order) - Number(b.display_order); });

  var formativeScoreMap = {};
  dbGetAll('IndicatorScores').forEach(function(row) {
    if (row.subject_id !== subject_id || !studentSet[row.student_id]) return;
    if (!formativeScoreMap[row.student_id]) formativeScoreMap[row.student_id] = {};
    formativeScoreMap[row.student_id][row.indicator_id] = row.score === '' ? '' : Number(row.score);
  });

  var formative_students = students.map(function(student) {
    var scores = formativeScoreMap[student.student_id] || {};
    var total = 0;
    var hasScore = false;
    indicators.forEach(function(ind) {
      var val = scores[ind.indicator_id];
      if (val !== '' && val !== null && val !== undefined && !isNaN(Number(val))) {
        total += Number(val);
        hasScore = true;
      }
    });
    return {
      student_id: student.student_id,
      seq_no: student.seq_no,
      student_code: student.student_code || '',
      full_name: student.full_name || '',
      scores: scores,
      total: hasScore ? total : ''
    };
  });

  var summativeMap = {};
  dbGetAll('SummativeScores').forEach(function(row) {
    if (row.subject_id !== subject_id || !studentSet[row.student_id]) return;
    summativeMap[row.student_id] = {
      coursework: reportValueOrBlank(row.coursework),
      midterm: reportValueOrBlank(row.midterm),
      final: reportValueOrBlank(row.final),
      total: reportValueOrBlank(row.total),
      computed_grade: reportValueOrBlank(row.computed_grade),
      makeup_grade: reportValueOrBlank(row.makeup_grade),
      final_grade: reportValueOrBlank(row.final_grade)
    };
  });
  var summative_students = students.map(function(student) {
    var score = summativeMap[student.student_id] || {};
    return {
      student_id: student.student_id,
      seq_no: student.seq_no,
      student_code: student.student_code || '',
      full_name: student.full_name || '',
      coursework: reportValueOrBlank(score.coursework),
      midterm: reportValueOrBlank(score.midterm),
      final: reportValueOrBlank(score.final),
      total: reportValueOrBlank(score.total),
      computed_grade: reportValueOrBlank(score.computed_grade),
      makeup_grade: reportValueOrBlank(score.makeup_grade),
      final_grade: reportValueOrBlank(score.final_grade)
    };
  });

  var attendanceConfig = getAttendanceConfig();
  var holidaySet = getHolidayDateSet();
  var attendanceCalendar = buildAttendanceDates(attendanceConfig.start_date, attendanceConfig.required_days)
    .map(function(date) { return formatDateISO(date); });
  var attendanceCalendarSet = {};
  attendanceCalendar.forEach(function(date, index) { attendanceCalendarSet[date] = index; });
  var allAttendance = dbGetAll('Attendance');
  var lastAttendanceIndex = -1;
  allAttendance.forEach(function(row) {
    var status = reportNormalizeAttendanceStatus(row.status);
    if (row.subject_id !== subject_id || !studentSet[row.student_id] || !status) return;
    var dateStr = reportNormalizeAttendanceDate(row.date);
    if (holidaySet[dateStr]) return;
    if (attendanceCalendarSet[dateStr] !== undefined && attendanceCalendarSet[dateStr] > lastAttendanceIndex) {
      lastAttendanceIndex = attendanceCalendarSet[dateStr];
    }
  });
  var attendance_dates = attendanceCalendar.slice(0, lastAttendanceIndex >= 0 ? lastAttendanceIndex + 1 : 24);
  var attendanceDateSet = {};
  attendance_dates.forEach(function(date) { attendanceDateSet[date] = true; });
  var attendance_totals = {};
  var attendance_by_student = {};
  students.forEach(function(student) {
    attendance_totals[student.student_id] = { present: 0, leave: 0, absent: 0, total: 0 };
    attendance_by_student[student.student_id] = {};
  });
  allAttendance.forEach(function(row) {
    if (row.subject_id !== subject_id || !studentSet[row.student_id]) return;
    var bucket = attendance_totals[row.student_id];
    if (!bucket) return;
    var status = reportNormalizeAttendanceStatus(row.status);
    var dateStr = reportNormalizeAttendanceDate(row.date);
    if (holidaySet[dateStr]) return;
    if (status === '/') bucket.present++;
    else if (status === 'ล') bucket.leave++;
    else if (status === 'ข') bucket.absent++;
    bucket.total = bucket.present + bucket.leave + bucket.absent;
    if (attendanceDateSet[dateStr]) {
      attendance_by_student[row.student_id][dateStr] = status;
    }
  });
  var attendance_students = students.map(function(student) {
    var totals = attendance_totals[student.student_id] || { present: 0, leave: 0, absent: 0, total: 0 };
    return {
      student_id: student.student_id,
      seq_no: student.seq_no,
      student_code: student.student_code || '',
      full_name: student.full_name || '',
      present: totals.present,
      leave: totals.leave,
      absent: totals.absent,
      total: totals.total,
      attendance: attendance_by_student[student.student_id] || {}
    };
  });

  var charMap = {};
  dbGetAll('Characteristics').forEach(function(row) {
    if (row.subject_id !== subject_id || !studentSet[row.student_id]) return;
    charMap[row.student_id] = reportPickFields(row, ['t1','t2','t3','t4','t5','t6','t7','t8','total','label']);
  });
  var characteristics_students = students.map(function(student) {
    var row = charMap[student.student_id] || {};
    row.student_id = student.student_id;
    row.seq_no = student.seq_no;
    row.student_code = student.student_code || '';
    row.full_name = student.full_name || '';
    return row;
  });

  var rtwFields = ['r1','r2','r3','t1','t2','t3','t4','w1','w2','w3','total','label'];
  var rtwMap = {};
  dbGetAll('ReadThinkWrite').forEach(function(row) {
    if (row.subject_id !== subject_id || !studentSet[row.student_id]) return;
    rtwMap[row.student_id] = reportPickFields(row, rtwFields);
  });
  var readthinkwrite_students = students.map(function(student) {
    var row = rtwMap[student.student_id] || {};
    row.student_id = student.student_id;
    row.seq_no = student.seq_no;
    row.student_code = student.student_code || '';
    row.full_name = student.full_name || '';
    return row;
  });

  var weights = dbFindOne('SubjectWeights', 'subject_id', subject_id) || {};
  d.students = students;
  d.indicators = indicators;
  d.weights = weights;
  d.formative_students = formative_students;
  d.summative_students = summative_students;
  d.attendance_dates = attendance_dates;
  d.attendance_students = attendance_students;
  d.characteristics_students = characteristics_students;
  d.readthinkwrite_students = readthinkwrite_students;
  d.report_generated_at = new Date().toISOString();
  return d;
}

function reportValueOrBlank(value) {
  return value === null || value === undefined ? '' : value;
}

function getHomeroomTeacherIds(row) {
  if (typeof parseHomeroomTeacherIds === 'function') {
    return parseHomeroomTeacherIds(row.homeroom_teacher_user_ids, row.homeroom_teacher_user_id);
  }
  var ids = [];
  try { ids = JSON.parse(row.homeroom_teacher_user_ids || '[]'); } catch(e) {}
  if ((!ids || !ids.length) && row.homeroom_teacher_user_id) ids = [row.homeroom_teacher_user_id];
  return (ids || []).map(function(id) { return String(id || '').trim(); }).filter(String);
}

function getHomeroomTeacherNames(row) {
  return getHomeroomTeacherIds(row).map(function(id) {
    var user = dbFindOne('Users', 'user_id', id);
    return user ? user.full_name || id : id;
  }).filter(String);
}

function reportNormalizeAttendanceDate(value) {
  var iso = normalizeISODate(value);
  if (iso) return iso;
  var parsed = new Date(value);
  return parsed && !isNaN(parsed.getTime()) ? formatDateISO(parsed) : '';
}

function reportNormalizeAttendanceStatus(value) {
  var status = String(value || '').trim();
  if (status === '✓' || status === '✔' || status === 'มา' || status === 'มาเรียน') return '/';
  if (status === 'ลา') return 'ล';
  if (status === 'ขาด') return 'ข';
  return status;
}

function reportPickFields(row, fields) {
  var picked = {};
  fields.forEach(function(field) {
    picked[field] = reportValueOrBlank(row[field]);
  });
  return picked;
}

// US-014: Export cover report as PDF.
// Builds a temporary Google Spreadsheet that mirrors the ปก layout,
// exports it as PDF (A4 portrait), returns base64 so the client can
// trigger a browser download.  The temp sheet is deleted after export.
function serverExportReportPdf(token, class_id, subject_id) {
  var session = getSession(token);
  if (!session) throw new Error('กรุณาเข้าสู่ระบบ');

  // Reuse getReportData to gather everything
  var d = getReportData(token, class_id, subject_id);

  var cls    = d.class_info    || {};
  var subj   = d.subject_info  || {};
  var school = d.school_info   || {};

  // Create a temporary spreadsheet
  var tmpSs = SpreadsheetApp.create('_popo_pdf_tmp_' + class_id + '_' + subject_id);
  var sheet  = tmpSs.getActiveSheet();
  sheet.setName('ปก');

  // --- Build the cover sheet ---
  var rows = [];
  rows.push(['รายงานผลการเรียน', '', '', '']);
  rows.push(['โรงเรียน', school.school_name || '-', 'ปีการศึกษา', school.academic_year || '-']);
  rows.push(['อำเภอ', school.district   || '-', 'จังหวัด',   school.province    || '-']);
  rows.push(['ที่อยู่', school.school_address || '-', 'เขตพื้นที่', school.education_area || '-']);
  rows.push(['โทรศัพท์', school.phone_number || '-', 'ภาคเรียน', school.semester || '-']);
  rows.push(['ชั้น',  fmtClassLabel(cls.level, cls.section), 'รหัสวิชา', subj.subject_code || '-']);
  rows.push(['เวลาเรียน (ชม./ปี)', subj.hours_per_year || '-', '', '']);
  rows.push(['ครูผู้สอน', d.teacher_name || '-', 'ครูประจำชั้น', d.homeroom_teacher_name || '-']);
  rows.push(['หัวหน้างานวัดผล', school.measurement_head_name || '-', 'หัวหน้างานวิชาการ', school.academic_head_name || '-']);
  rows.push(['ผู้อำนวยการ', school.director_name || '-', '', '']);
  rows.push(['จำนวนนักเรียน', d.total_students, '', '']);
  rows.push(['', '', '', '']);

  // Grade distribution table header
  rows.push(['ผลการเรียน (คะแนน)', '', '', '']);
  rows.push(['ผลการเรียน', 'จำนวนนักเรียน', 'ร้อยละ', '']);
  (d.grade_dist || []).forEach(function(row) {
    rows.push([String(row.grade), row.count, row.pct + '%', '']);
  });
  rows.push(['', '', '', '']);

  // กิจกรรมพัฒนาผู้เรียน
  rows.push(['กิจกรรมพัฒนาผู้เรียน', '', '', '']);
  rows.push(['ผล', 'จำนวน', '', '']);
  var devCounts = d.dev_counts || {};
  ['ผ่าน', 'ไม่ผ่าน', 'ร', 'มส'].forEach(function(k) {
    rows.push([k, devCounts[k] || 0, '', '']);
  });
  rows.push(['', '', '', '']);

  // Characteristics distribution
  rows.push(['คุณลักษณะอันพึงประสงค์', '', '', '']);
  rows.push(['ระดับคุณภาพ', 'จำนวนนักเรียน', 'ร้อยละ', '']);
  (d.char_dist || []).forEach(function(row) {
    rows.push([row.label, row.count, row.pct + '%', '']);
  });
  rows.push(['', '', '', '']);

  // Read-Think-Write distribution
  rows.push(['การอ่าน คิดวิเคราะห์ และเขียน', '', '', '']);
  rows.push(['ระดับคุณภาพ', 'จำนวนนักเรียน', 'ร้อยละ', '']);
  (d.rtw_dist || []).forEach(function(row) {
    rows.push([row.label, row.count, row.pct + '%', '']);
  });

  // Write all rows at once
  if (rows.length > 0) {
    sheet.getRange(1, 1, rows.length, 4).setValues(rows);
  }

  // Basic formatting: bold title and section headers
  sheet.getRange('A1').setFontWeight('bold').setFontSize(14);
  sheet.setColumnWidth(1, 180);
  sheet.setColumnWidth(2, 140);
  sheet.setColumnWidth(3, 140);
  sheet.setColumnWidth(4, 140);

  // Export as PDF
  var fileId  = tmpSs.getId();
  var pdfBlob = DriveApp.getFileById(fileId).getAs('application/pdf');
  pdfBlob.setName('pp5_report_book_' + (cls.level || '') + '_' + (subj.subject_code || '') + '.pdf');

  var base64 = Utilities.base64Encode(pdfBlob.getBytes());

  // Clean up the temporary spreadsheet
  DriveApp.getFileById(fileId).setTrashed(true);

  return {
    ok: true,
    base64: base64,
    filename: 'pp5_report_book_' + (cls.level || cls.class_id || class_id) + '_' + (subj.subject_code || subject_id) + '.pdf'
  };
}

// Save กิจกรรมพัฒนาผู้เรียน results for the report page.
// rows: array of { student_id, result }
function serverSaveDevActivity(token, class_id, subject_id, rows) {
  var session = getSession(token);
  if (!session) throw new Error('กรุณาเข้าสู่ระบบ');

  // Authorization check
  if (session.role !== 'admin') {
    var enrollment = dbGetAll('Enrollments').filter(function(e) {
      return e.class_id === class_id && e.subject_id === subject_id && e.teacher_user_id === session.user_id;
    });
    if (enrollment.length === 0) throw new Error('ไม่มีสิทธิ์แก้ไขข้อมูลของวิชานี้');
  }

  if (!rows || rows.length === 0) return { ok: true };

  var lock = LockService.getDocumentLock();
  if (!lock.tryLock(30000)) throw new Error('ไม่สามารถบันทึกได้ กรุณาลองใหม่');
  try {
    var sheet = getSheet('DevActivity');
    var data = sheet.getDataRange().getValues();
    var headers = data[0];
    var idCol = headers.indexOf('id');
    var sidCol = headers.indexOf('student_id');
    var clsCol = headers.indexOf('class_id');
    var subjCol = headers.indexOf('subject_id');
    var resCol = headers.indexOf('result');
    var updByCol = headers.indexOf('updated_by');
    var updAtCol = headers.indexOf('updated_at');

    var now = new Date().toISOString();

    rows.forEach(function(row) {
      var result = row.result || '';
      var student_id = row.student_id;

      var found = false;
      for (var i = 1; i < data.length; i++) {
        if (data[i][sidCol] === student_id && data[i][subjCol] === subject_id) {
          sheet.getRange(i + 1, resCol + 1).setValue(result);
          sheet.getRange(i + 1, updByCol + 1).setValue(session.user_id);
          sheet.getRange(i + 1, updAtCol + 1).setValue(now);
          data[i][resCol] = result;
          found = true;
          break;
        }
      }

      if (!found) {
        var newId = generateId('dev');
        var newRow = headers.map(function() { return ''; });
        newRow[idCol] = newId;
        newRow[sidCol] = student_id;
        newRow[clsCol] = class_id;
        newRow[subjCol] = subject_id;
        newRow[resCol] = result;
        newRow[updByCol] = session.user_id;
        newRow[updAtCol] = now;
        sheet.appendRow(newRow);
        data.push(newRow);
      }
    });
  } finally {
    lock.releaseLock();
  }

  appendAuditLog(session.user_id, 'DevActivity', subject_id, null,
    { class_id: class_id, subject_id: subject_id, rows_saved: rows.length });

  return { ok: true };
}
