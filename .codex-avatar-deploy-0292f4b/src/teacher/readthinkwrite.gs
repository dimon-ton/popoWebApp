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

var READ_THINK_WRITE_FIELDS = ['r1','r2','r3','t1','t2','t3','t4','w1','w2','w3'];

function readThinkWriteSubjectBelongsToClass(subject, class_id, enrollments) {
  if (!subject) return false;
  if (String(subject.class_id || '') === String(class_id)) return true;
  return enrollments.some(function(enrollment) {
    return String(enrollment.class_id) === String(class_id) &&
      String(enrollment.subject_id) === String(subject.subject_id);
  });
}

function requireReadThinkWriteDestinationAccess(session, class_id, subject_id, enrollments) {
  var cls = dbFindOne('Classes', 'class_id', class_id);
  if (!cls) throw new Error('ไม่พบชั้นเรียน: ' + class_id);
  var subject = dbFindOne('Subjects', 'subject_id', subject_id);
  if (!subject || !readThinkWriteSubjectBelongsToClass(subject, class_id, enrollments)) {
    throw new Error('ไม่พบวิชาในชั้นเรียนนี้');
  }
  if (session.role !== 'admin') {
    var assigned = enrollments.some(function(enrollment) {
      return String(enrollment.class_id) === String(class_id) &&
        String(enrollment.subject_id) === String(subject_id) &&
        String(enrollment.teacher_user_id) === String(session.user_id);
    });
    if (!assigned) throw new Error('ไม่มีสิทธิ์แก้ไขคะแนนของวิชานี้');
  }
}

function isCompleteReadThinkWriteValue(value) {
  if (value === '' || value === null || value === undefined) return false;
  var numberValue = Number(value);
  return !isNaN(numberValue) && numberValue >= 0 && numberValue <= 10;
}

function buildEligibleReadThinkWriteSources(session, class_id, current_subject_id) {
  var enrollments = dbGetAll('Enrollments');
  requireReadThinkWriteDestinationAccess(session, class_id, current_subject_id, enrollments);
  var students = dbFind('Students', 'class_id', class_id);
  if (!students.length) return [];

  var studentIds = {};
  students.forEach(function(student) { studentIds[String(student.student_id)] = true; });
  var userNames = {};
  dbGetAll('Users').forEach(function(user) { userNames[String(user.user_id)] = user.full_name || ''; });
  var rowsBySubject = {};
  dbGetAll('ReadThinkWrite').forEach(function(row) {
    var subjectId = String(row.subject_id || '');
    if (!rowsBySubject[subjectId]) rowsBySubject[subjectId] = [];
    rowsBySubject[subjectId].push(row);
  });

  var sources = [];
  dbGetAll('Subjects').forEach(function(subject) {
    var subjectId = String(subject.subject_id || '');
    if (!subjectId || subjectId === String(current_subject_id)) return;
    if (!readThinkWriteSubjectBelongsToClass(subject, class_id, enrollments)) return;
    var sourceEnrollments = enrollments.filter(function(enrollment) {
      return String(enrollment.class_id) === String(class_id) &&
        String(enrollment.subject_id) === subjectId && enrollment.teacher_user_id !== '';
    });
    if (!sourceEnrollments.length) return;

    var teacherIds = {};
    sourceEnrollments.forEach(function(enrollment) {
      var teacherId = String(enrollment.teacher_user_id || '');
      teacherIds[teacherId] = true;
    });

    var rowsForStudents = {};
    var valid = true;
    (rowsBySubject[subjectId] || []).forEach(function(row) {
      var studentId = String(row.student_id || '');
      if (!studentIds[studentId]) return;
      if (rowsForStudents[studentId] || !teacherIds[String(row.updated_by || '')]) { valid = false; return; }
      for (var i = 0; i < READ_THINK_WRITE_FIELDS.length; i++) {
        if (!isCompleteReadThinkWriteValue(row[READ_THINK_WRITE_FIELDS[i]])) { valid = false; return; }
      }
      rowsForStudents[studentId] = row;
    });
    if (!valid) return;
    for (var studentId in studentIds) if (!rowsForStudents[studentId]) return;

    var updatedAt = '';
    Object.keys(rowsForStudents).forEach(function(studentId) {
      var value = String(rowsForStudents[studentId].updated_at || '');
      if (value > updatedAt) updatedAt = value;
    });
    sources.push({
      subject_id: subjectId,
      subject_name: subject.subject_name || subjectId,
      teacher_names: Object.keys(teacherIds).map(function(teacherId) { return userNames[teacherId] || teacherId; }),
      status: 'complete',
      updated_at: updatedAt
    });
  });
  sources.sort(function(a, b) { return String(a.subject_name).localeCompare(String(b.subject_name), 'th'); });
  return sources;
}

function getEligibleReadThinkWriteSources(token, class_id, current_subject_id) {
  var session = getSession(token);
  if (!session) throw new Error('กรุณาเข้าสู่ระบบ');
  return { sources: buildEligibleReadThinkWriteSources(session, class_id, current_subject_id) };
}

function getReadThinkWriteSourceValues(token, class_id, current_subject_id, source_subject_id) {
  var session = getSession(token);
  if (!session) throw new Error('กรุณาเข้าสู่ระบบ');
  var sources = buildEligibleReadThinkWriteSources(session, class_id, current_subject_id);
  var source = null;
  for (var i = 0; i < sources.length; i++) {
    if (String(sources[i].subject_id) === String(source_subject_id)) { source = sources[i]; break; }
  }
  if (!source) throw new Error('แหล่งข้อมูลนี้ไม่มีสิทธิ์ใช้งานหรือข้อมูลยังไม่ครบถ้วน');

  var studentIds = {};
  dbFind('Students', 'class_id', class_id).forEach(function(student) { studentIds[String(student.student_id)] = true; });
  var values = dbGetAll('ReadThinkWrite').filter(function(row) {
    return String(row.subject_id) === String(source_subject_id) && studentIds[String(row.student_id)];
  }).map(function(row) {
    var item = { student_id: String(row.student_id) };
    READ_THINK_WRITE_FIELDS.forEach(function(field) { item[field] = Number(row[field]); });
    return item;
  });
  appendAuditLog(session.user_id, 'ReadThinkWriteCopy', current_subject_id, null, {
    class_id: class_id,
    source_subject_id: source_subject_id,
    destination_subject_id: current_subject_id,
    rows_loaded: values.length
  });
  return { source: source, values: values };
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
    class_info: withClassLabel(cls),
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
