// US-011: Characteristics scoring (คุณลักษณะ)

// Ladder per FR-5: max 80
function computeCharacteristicsLabel(total) {
  if (total === '' || total === null || total === undefined) return '';
  var t = Number(total);
  if (isNaN(t)) return '';
  if (t >= 70) return 'ดีเยี่ยม';
  if (t >= 60) return 'ดี';
  if (t >= 50) return 'ผ่านเกณฑ์';
  return 'ไม่ผ่าน';
}

// Returns all data needed to render the characteristics scoring grid.
// Returns: { students, scores, subject_info, class_info, can_edit }
// scores: map of student_id -> { t1..t8, total, label }
function getCharacteristicsData(token, class_id, subject_id) {
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

  // Get all existing characteristics scores for this subject
  var allRows = dbGetAll('Characteristics');
  var scoreMap = {};
  allRows.forEach(function(row) {
    if (row.subject_id !== subject_id) return;
    scoreMap[row.student_id] = {
      t1: row.t1 !== '' ? Number(row.t1) : '',
      t2: row.t2 !== '' ? Number(row.t2) : '',
      t3: row.t3 !== '' ? Number(row.t3) : '',
      t4: row.t4 !== '' ? Number(row.t4) : '',
      t5: row.t5 !== '' ? Number(row.t5) : '',
      t6: row.t6 !== '' ? Number(row.t6) : '',
      t7: row.t7 !== '' ? Number(row.t7) : '',
      t8: row.t8 !== '' ? Number(row.t8) : '',
      total: row.total !== '' ? Number(row.total) : '',
      label: row.label || ''
    };
  });

  return {
    students: students,
    scores: scoreMap,
    subject_info: subj,
    class_info: withClassLabel(cls),
    can_edit: can_edit
  };
}

// Save characteristics scores for a (class, subject) pair.
// rows: array of { student_id, t1..t8 }
// Uses upsert pattern inside one LockService acquisition.
function serverSaveCharacteristics(token, class_id, subject_id, rows) {
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
    var sheet = getSheet('Characteristics');
    var data = sheet.getDataRange().getValues();
    var headers = data[0];
    var idCol = headers.indexOf('id');
    var sidCol = headers.indexOf('student_id');
    var subjCol = headers.indexOf('subject_id');
    var t1Col = headers.indexOf('t1');
    var t2Col = headers.indexOf('t2');
    var t3Col = headers.indexOf('t3');
    var t4Col = headers.indexOf('t4');
    var t5Col = headers.indexOf('t5');
    var t6Col = headers.indexOf('t6');
    var t7Col = headers.indexOf('t7');
    var t8Col = headers.indexOf('t8');
    var totCol = headers.indexOf('total');
    var lblCol = headers.indexOf('label');
    var updByCol = headers.indexOf('updated_by');
    var updAtCol = headers.indexOf('updated_at');

    var now = new Date().toISOString();

    rows.forEach(function(row) {
      var vals = [1,2,3,4,5,6,7,8].map(function(n) {
        var v = row['t' + n];
        return (v !== '' && v !== null && v !== undefined) ? Math.min(10, Math.max(0, Number(v))) : '';
      });

      var total = 0;
      var allEmpty = true;
      vals.forEach(function(v) {
        if (v !== '') { total += v; allEmpty = false; }
      });
      if (allEmpty) total = '';

      var label = allEmpty ? '' : computeCharacteristicsLabel(total);
      var student_id = row.student_id;

      // Find existing row to update
      var found = false;
      for (var i = 1; i < data.length; i++) {
        if (data[i][sidCol] === student_id && data[i][subjCol] === subject_id) {
          sheet.getRange(i + 1, t1Col + 1).setValue(vals[0]);
          sheet.getRange(i + 1, t2Col + 1).setValue(vals[1]);
          sheet.getRange(i + 1, t3Col + 1).setValue(vals[2]);
          sheet.getRange(i + 1, t4Col + 1).setValue(vals[3]);
          sheet.getRange(i + 1, t5Col + 1).setValue(vals[4]);
          sheet.getRange(i + 1, t6Col + 1).setValue(vals[5]);
          sheet.getRange(i + 1, t7Col + 1).setValue(vals[6]);
          sheet.getRange(i + 1, t8Col + 1).setValue(vals[7]);
          sheet.getRange(i + 1, totCol + 1).setValue(total);
          sheet.getRange(i + 1, lblCol + 1).setValue(label);
          sheet.getRange(i + 1, updByCol + 1).setValue(session.user_id);
          sheet.getRange(i + 1, updAtCol + 1).setValue(now);
          data[i][t1Col] = vals[0]; data[i][t2Col] = vals[1];
          data[i][t3Col] = vals[2]; data[i][t4Col] = vals[3];
          data[i][t5Col] = vals[4]; data[i][t6Col] = vals[5];
          data[i][t7Col] = vals[6]; data[i][t8Col] = vals[7];
          data[i][totCol] = total;
          data[i][lblCol] = label;
          found = true;
          break;
        }
      }

      if (!found) {
        var newId = generateId('char');
        var newRow = headers.map(function() { return ''; });
        newRow[idCol] = newId;
        newRow[sidCol] = student_id;
        newRow[subjCol] = subject_id;
        newRow[t1Col] = vals[0]; newRow[t2Col] = vals[1];
        newRow[t3Col] = vals[2]; newRow[t4Col] = vals[3];
        newRow[t5Col] = vals[4]; newRow[t6Col] = vals[5];
        newRow[t7Col] = vals[6]; newRow[t8Col] = vals[7];
        newRow[totCol] = total;
        newRow[lblCol] = label;
        newRow[updByCol] = session.user_id;
        newRow[updAtCol] = now;
        sheet.appendRow(newRow);
        data.push(newRow);
      }
    });
  } finally {
    lock.releaseLock();
  }

  appendAuditLog(session.user_id, 'Characteristics', subject_id, null,
    { class_id: class_id, subject_id: subject_id, rows_saved: rows.length });

  return { ok: true };
}
