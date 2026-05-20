// US-012: Read-Think-Write scoring (อ่านคิด)

// Ladder per FR-6: max 100
function computeReadThinkWriteLabel(total) {
  if (total === '' || total === null || total === undefined) return '';
  var t = Number(total);
  if (isNaN(t)) return '';
  if (t >= 90) return 'ดีเยี่ยม';
  if (t >= 80) return 'ดี';
  if (t >= 70) return 'ผ่านเกณฑ์';
  return 'ไม่ผ่าน';
}

// Returns all data needed to render the read-think-write scoring grid.
// Returns: { students, scores, subject_info, class_info, can_edit }
// scores: map of student_id -> { r1..r3, t1..t4, w1..w3, total, label }
function getReadThinkWriteData(token, class_id, subject_id) {
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

  // Get all existing read-think-write scores for this subject
  var allRows = dbGetAll('ReadThinkWrite');
  var scoreMap = {};
  var rtFields = ['r1','r2','r3','t1','t2','t3','t4','w1','w2','w3'];
  allRows.forEach(function(row) {
    if (row.subject_id !== subject_id) return;
    var entry = { total: row.total !== '' ? Number(row.total) : '', label: row.label || '' };
    rtFields.forEach(function(f) {
      entry[f] = row[f] !== '' ? Number(row[f]) : '';
    });
    scoreMap[row.student_id] = entry;
  });

  return {
    students: students,
    scores: scoreMap,
    subject_info: subj,
    class_info: cls,
    can_edit: can_edit
  };
}

// Save read-think-write scores for a (class, subject) pair.
// rows: array of { student_id, r1..r3, t1..t4, w1..w3 }
// Uses upsert pattern inside one LockService acquisition.
function serverSaveReadThinkWrite(token, class_id, subject_id, rows) {
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

  var rtFields = ['r1','r2','r3','t1','t2','t3','t4','w1','w2','w3'];

  var lock = LockService.getDocumentLock();
  if (!lock.tryLock(30000)) throw new Error('ไม่สามารถบันทึกได้ กรุณาลองใหม่');
  try {
    var sheet = getSheet('ReadThinkWrite');
    var data = sheet.getDataRange().getValues();
    var headers = data[0];
    var idCol = headers.indexOf('id');
    var sidCol = headers.indexOf('student_id');
    var subjCol = headers.indexOf('subject_id');
    var fieldCols = {};
    rtFields.forEach(function(f) { fieldCols[f] = headers.indexOf(f); });
    var totCol = headers.indexOf('total');
    var lblCol = headers.indexOf('label');
    var updByCol = headers.indexOf('updated_by');
    var updAtCol = headers.indexOf('updated_at');

    var now = new Date().toISOString();

    rows.forEach(function(row) {
      var vals = {};
      rtFields.forEach(function(f) {
        var v = row[f];
        vals[f] = (v !== '' && v !== null && v !== undefined) ? Math.min(10, Math.max(0, Number(v))) : '';
      });

      var total = 0;
      var allEmpty = true;
      rtFields.forEach(function(f) {
        if (vals[f] !== '') { total += vals[f]; allEmpty = false; }
      });
      if (allEmpty) total = '';

      var label = allEmpty ? '' : computeReadThinkWriteLabel(total);
      var student_id = row.student_id;

      // Find existing row to update
      var found = false;
      for (var i = 1; i < data.length; i++) {
        if (data[i][sidCol] === student_id && data[i][subjCol] === subject_id) {
          rtFields.forEach(function(f) {
            sheet.getRange(i + 1, fieldCols[f] + 1).setValue(vals[f]);
            data[i][fieldCols[f]] = vals[f];
          });
          sheet.getRange(i + 1, totCol + 1).setValue(total);
          sheet.getRange(i + 1, lblCol + 1).setValue(label);
          sheet.getRange(i + 1, updByCol + 1).setValue(session.user_id);
          sheet.getRange(i + 1, updAtCol + 1).setValue(now);
          data[i][totCol] = total;
          data[i][lblCol] = label;
          found = true;
          break;
        }
      }

      if (!found) {
        var newId = generateId('rtw');
        var newRow = headers.map(function() { return ''; });
        newRow[idCol] = newId;
        newRow[sidCol] = student_id;
        newRow[subjCol] = subject_id;
        rtFields.forEach(function(f) { newRow[fieldCols[f]] = vals[f]; });
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

  appendAuditLog(session.user_id, 'ReadThinkWrite', subject_id, null,
    { class_id: class_id, subject_id: subject_id, rows_saved: rows.length });

  return { ok: true };
}
