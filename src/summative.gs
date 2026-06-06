// US-009: Summative scoring and grade computation (คะแนน2)

// Grade ladder per FR-4
function computeGrade(total) {
  if (total === '' || total === null || total === undefined) return '';
  var t = Number(total);
  if (isNaN(t)) return '';
  if (t >= 80) return 4;
  if (t >= 75) return 3.5;
  if (t >= 70) return 3;
  if (t >= 65) return 2.5;
  if (t >= 60) return 2;
  if (t >= 55) return 1.5;
  if (t >= 50) return 1;
  return 0;
}

// Returns all data needed to render the summative scoring grid.
// Returns: { students, weights, scores, subject_info, class_info, can_edit }
// scores: map of student_id -> { coursework, midterm, final, total, computed_grade, makeup_grade, final_grade }
function getSummativeData(token, class_id, subject_id) {
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

  // Get subject weights
  var weightsRow = dbFindOne('SubjectWeights', 'subject_id', subject_id);
  var weights = weightsRow || {
    subject_id: subject_id,
    coursework_max: 70, final_max: 30,
    pre_mid_max: 25, mid_max: 20, post_mid_max: 25, final_exam_max: 30
  };

  // Get all existing summative scores for this subject
  var allScores = dbGetAll('SummativeScores');
  var scoreMap = {};
  allScores.forEach(function(row) {
    if (row.subject_id !== subject_id) return;
    scoreMap[row.student_id] = {
      coursework: row.coursework !== '' ? Number(row.coursework) : '',
      midterm: row.midterm !== '' ? Number(row.midterm) : '',
      final: row.final !== '' ? Number(row.final) : '',
      total: row.total !== '' ? Number(row.total) : '',
      computed_grade: row.computed_grade !== '' ? row.computed_grade : '',
      makeup_grade: row.makeup_grade !== '' ? row.makeup_grade : '',
      final_grade: row.final_grade !== '' ? row.final_grade : ''
    };
  });

  return {
    students: students,
    weights: weights,
    scores: scoreMap,
    subject_info: subj,
    class_info: withClassLabel(cls),
    can_edit: can_edit
  };
}

// Save summative scores for a (class, subject) pair.
// rows: array of { student_id, coursework, midterm, final, makeup_grade }
// Uses upsert pattern inside one LockService acquisition.
function serverSaveSummative(token, class_id, subject_id, rows) {
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
    var sheet = getSheet('SummativeScores');
    var data = sheet.getDataRange().getValues();
    var headers = data[0];
    var idCol = headers.indexOf('id');
    var sidCol = headers.indexOf('student_id');
    var subjCol = headers.indexOf('subject_id');
    var cwCol = headers.indexOf('coursework');
    var midCol = headers.indexOf('midterm');
    var finCol = headers.indexOf('final');
    var totCol = headers.indexOf('total');
    var cgCol = headers.indexOf('computed_grade');
    var mgCol = headers.indexOf('makeup_grade');
    var fgCol = headers.indexOf('final_grade');
    var updByCol = headers.indexOf('updated_by');
    var updAtCol = headers.indexOf('updated_at');

    var now = new Date().toISOString();

    rows.forEach(function(row) {
      var cw = row.coursework !== '' && row.coursework !== null && row.coursework !== undefined ? Number(row.coursework) : '';
      var mid = row.midterm !== '' && row.midterm !== null && row.midterm !== undefined ? Number(row.midterm) : '';
      var fin = row.final !== '' && row.final !== null && row.final !== undefined ? Number(row.final) : '';
      var makeup = row.makeup_grade !== '' && row.makeup_grade !== null && row.makeup_grade !== undefined ? Number(row.makeup_grade) : '';

      var total = '';
      if (cw !== '' && mid !== '' && fin !== '') {
        total = Number(cw) + Number(mid) + Number(fin);
      } else if (cw !== '' || mid !== '' || fin !== '') {
        var sum = 0;
        if (cw !== '') sum += Number(cw);
        if (mid !== '') sum += Number(mid);
        if (fin !== '') sum += Number(fin);
        total = sum;
      }

      var computed_grade = computeGrade(total);
      var final_grade = (makeup !== '' && !isNaN(makeup)) ? makeup : computed_grade;

      var student_id = row.student_id;

      // Find existing row to update
      var found = false;
      for (var i = 1; i < data.length; i++) {
        if (data[i][sidCol] === student_id && data[i][subjCol] === subject_id) {
          sheet.getRange(i + 1, cwCol + 1).setValue(cw);
          sheet.getRange(i + 1, midCol + 1).setValue(mid);
          sheet.getRange(i + 1, finCol + 1).setValue(fin);
          sheet.getRange(i + 1, totCol + 1).setValue(total);
          sheet.getRange(i + 1, cgCol + 1).setValue(computed_grade);
          sheet.getRange(i + 1, mgCol + 1).setValue(makeup);
          sheet.getRange(i + 1, fgCol + 1).setValue(final_grade);
          sheet.getRange(i + 1, updByCol + 1).setValue(session.user_id);
          sheet.getRange(i + 1, updAtCol + 1).setValue(now);
          data[i][cwCol] = cw;
          data[i][midCol] = mid;
          data[i][finCol] = fin;
          data[i][totCol] = total;
          data[i][cgCol] = computed_grade;
          data[i][mgCol] = makeup;
          data[i][fgCol] = final_grade;
          found = true;
          break;
        }
      }

      if (!found) {
        var newId = generateId('ssum');
        var newRow = headers.map(function() { return ''; });
        newRow[idCol] = newId;
        newRow[sidCol] = student_id;
        newRow[subjCol] = subject_id;
        newRow[cwCol] = cw;
        newRow[midCol] = mid;
        newRow[finCol] = fin;
        newRow[totCol] = total;
        newRow[cgCol] = computed_grade;
        newRow[mgCol] = makeup;
        newRow[fgCol] = final_grade;
        newRow[updByCol] = session.user_id;
        newRow[updAtCol] = now;
        sheet.appendRow(newRow);
        data.push(newRow);
      }
    });
  } finally {
    lock.releaseLock();
  }

  appendAuditLog(session.user_id, 'SummativeScores', subject_id, null,
    { class_id: class_id, subject_id: subject_id, rows_saved: rows.length });

  return { ok: true };
}
