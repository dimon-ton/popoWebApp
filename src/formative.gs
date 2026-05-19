// US-008: Formative indicator scoring (คะแนน1)

// Returns all data needed to render the formative scoring grid.
// Returns: { students, indicators, scores, subject_info, class_info, can_edit }
// scores: map of student_id -> indicator_id -> score
function getFormativeData(token, class_id, subject_id) {
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

  // Get students ordered by seq_no
  var students = dbFind('Students', 'class_id', class_id);
  students.sort(function(a, b) { return Number(a.seq_no) - Number(b.seq_no); });

  // Get indicators ordered by display_order
  var indicators = dbFind('Indicators', 'subject_id', subject_id);
  indicators.sort(function(a, b) { return Number(a.display_order) - Number(b.display_order); });

  // Get all existing scores for this subject
  var allScores = dbGetAll('IndicatorScores');
  // Build map: student_id -> indicator_id -> score
  var scoreMap = {};
  allScores.forEach(function(row) {
    if (row.subject_id !== subject_id) return;
    if (!scoreMap[row.student_id]) scoreMap[row.student_id] = {};
    scoreMap[row.student_id][row.indicator_id] = Number(row.score) || 0;
  });

  return {
    students: students,
    indicators: indicators,
    scores: scoreMap,
    subject_info: subj,
    class_info: cls,
    can_edit: can_edit
  };
}

// Save formative scores for a (class, subject) pair.
// rows: array of { student_id, indicator_id, score }
// Uses upsert pattern inside one LockService acquisition.
function serverSaveFormative(token, class_id, subject_id, rows) {
  var session = getSession(token);
  if (!session) throw new Error('กรุณาเข้าสู่ระบบ');

  // Authorization check
  if (session.role !== 'admin') {
    var enrollment = dbGetAll('Enrollments').filter(function(e) {
      return e.class_id === class_id && e.subject_id === subject_id && e.teacher_user_id === session.user_id;
    });
    if (enrollment.length === 0) throw new Error('ไม่มีสิทธิ์แก้ไขคะแนนของวิชานี้');
  }

  if (!rows || rows.length === 0) return { ok: true };

  var lock = LockService.getDocumentLock();
  if (!lock.tryLock(30000)) throw new Error('ไม่สามารถบันทึกได้ กรุณาลองใหม่');
  try {
    var sheet = getSheet('IndicatorScores');
    var data = sheet.getDataRange().getValues();
    var headers = data[0];
    var idCol = headers.indexOf('id');
    var sidCol = headers.indexOf('student_id');
    var subjCol = headers.indexOf('subject_id');
    var indCol = headers.indexOf('indicator_id');
    var scoreCol = headers.indexOf('score');
    var updByCol = headers.indexOf('updated_by');
    var updAtCol = headers.indexOf('updated_at');

    var now = new Date().toISOString();

    rows.forEach(function(row) {
      var score = Number(row.score);
      if (isNaN(score) || score < 0) score = 0;
      var student_id = row.student_id;
      var indicator_id = row.indicator_id;

      // Find existing row to update
      var found = false;
      for (var i = 1; i < data.length; i++) {
        if (data[i][sidCol] === student_id &&
            data[i][subjCol] === subject_id &&
            data[i][indCol] === indicator_id) {
          sheet.getRange(i + 1, scoreCol + 1).setValue(score);
          sheet.getRange(i + 1, updByCol + 1).setValue(session.user_id);
          sheet.getRange(i + 1, updAtCol + 1).setValue(now);
          data[i][scoreCol] = score;
          found = true;
          break;
        }
      }

      if (!found) {
        var newId = generateId('iscore');
        var newRow = headers.map(function() { return ''; });
        newRow[idCol] = newId;
        newRow[sidCol] = student_id;
        newRow[subjCol] = subject_id;
        newRow[indCol] = indicator_id;
        newRow[scoreCol] = score;
        newRow[updByCol] = session.user_id;
        newRow[updAtCol] = now;
        sheet.appendRow(newRow);
        data.push(newRow);
      }
    });
  } finally {
    lock.releaseLock();
  }

  appendAuditLog(session.user_id, 'IndicatorScores', subject_id, null,
    { class_id: class_id, subject_id: subject_id, rows_saved: rows.length });

  return { ok: true };
}
