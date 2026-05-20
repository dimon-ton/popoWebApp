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

  // Homeroom teacher
  var homeroom_teacher_name = '';
  if (cls.homeroom_teacher_user_id) {
    var hroom = dbFindOne('Users', 'user_id', cls.homeroom_teacher_user_id);
    if (hroom) homeroom_teacher_name = hroom.full_name || '';
  }

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
    class_info: cls,
    subject_info: subj,
    teacher_name: teacher_name,
    homeroom_teacher_name: homeroom_teacher_name,
    total_students: total_students,
    grade_dist: grade_dist,
    char_dist: char_dist,
    rtw_dist: rtw_dist,
    dev_counts: devCounts,
    dev_students: dev_students,
    can_edit: session.role === 'admin' || (enrollment.length > 0 && enrollment[0].teacher_user_id === session.user_id)
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
