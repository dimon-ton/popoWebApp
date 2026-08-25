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

var CHARACTERISTIC_FIELDS = ['t1','t2','t3','t4','t5','t6','t7','t8'];

function characteristicSubjectBelongsToClass(subject, class_id, enrollments) {
  if (!subject) return false;
  if (String(subject.class_id || '') === String(class_id)) return true;
  return enrollments.some(function(enrollment) {
    return String(enrollment.class_id) === String(class_id) &&
      String(enrollment.subject_id) === String(subject.subject_id);
  });
}

function requireCharacteristicsDestinationAccess(session, class_id, subject_id, enrollments) {
  var cls = dbFindOne('Classes', 'class_id', class_id);
  if (!cls) throw new Error('ไม่พบชั้นเรียน: ' + class_id);

  var subject = dbFindOne('Subjects', 'subject_id', subject_id);
  if (!subject || !characteristicSubjectBelongsToClass(subject, class_id, enrollments)) {
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

  return { class_info: cls, subject_info: subject };
}

function isCompleteCharacteristicValue(value) {
  if (value === '' || value === null || value === undefined) return false;
  var numberValue = Number(value);
  return !isNaN(numberValue) && numberValue >= 0 && numberValue <= 10;
}

function buildEligibleCharacteristicsSources(session, class_id, current_subject_id) {
  var enrollments = dbGetAll('Enrollments');
  requireCharacteristicsDestinationAccess(session, class_id, current_subject_id, enrollments);

  var students = dbFind('Students', 'class_id', class_id);
  if (students.length === 0) return [];

  var studentIds = {};
  students.forEach(function(student) { studentIds[String(student.student_id)] = true; });

  var subjects = dbGetAll('Subjects');
  var users = dbGetAll('Users');
  var userNames = {};
  users.forEach(function(user) { userNames[String(user.user_id)] = user.full_name || ''; });

  var rowsBySubject = {};
  dbGetAll('Characteristics').forEach(function(row) {
    var subjectId = String(row.subject_id || '');
    if (!rowsBySubject[subjectId]) rowsBySubject[subjectId] = [];
    rowsBySubject[subjectId].push(row);
  });

  var sources = [];
  subjects.forEach(function(subject) {
    var subjectId = String(subject.subject_id || '');
    if (!subjectId || subjectId === String(current_subject_id)) return;
    if (!characteristicSubjectBelongsToClass(subject, class_id, enrollments)) return;

    var sourceEnrollments = enrollments.filter(function(enrollment) {
      return String(enrollment.class_id) === String(class_id) &&
        String(enrollment.subject_id) === subjectId && enrollment.teacher_user_id !== '';
    });
    if (sourceEnrollments.length === 0) return;

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
      if (rowsForStudents[studentId]) { valid = false; return; }
      if (!teacherIds[String(row.updated_by || '')]) { valid = false; return; }
      for (var i = 0; i < CHARACTERISTIC_FIELDS.length; i++) {
        if (!isCompleteCharacteristicValue(row[CHARACTERISTIC_FIELDS[i]])) {
          valid = false;
          return;
        }
      }
      rowsForStudents[studentId] = row;
    });
    if (!valid) return;

    for (var studentId in studentIds) {
      if (!rowsForStudents[studentId]) return;
    }

    var teacherNames = Object.keys(teacherIds).map(function(teacherId) {
      return userNames[teacherId] || teacherId;
    });
    var updatedAt = '';
    Object.keys(rowsForStudents).forEach(function(studentId) {
      var value = String(rowsForStudents[studentId].updated_at || '');
      if (value > updatedAt) updatedAt = value;
    });

    sources.push({
      subject_id: subjectId,
      subject_name: subject.subject_name || subjectId,
      teacher_names: teacherNames,
      status: 'complete',
      updated_at: updatedAt
    });
  });

  sources.sort(function(a, b) {
    return String(a.subject_name).localeCompare(String(b.subject_name), 'th');
  });
  return sources;
}

function getEligibleCharacteristicsSources(token, class_id, current_subject_id) {
  var session = getSession(token);
  if (!session) throw new Error('กรุณาเข้าสู่ระบบ');
  return { sources: buildEligibleCharacteristicsSources(session, class_id, current_subject_id) };
}

function getCharacteristicsSourceValues(token, class_id, current_subject_id, source_subject_id) {
  var session = getSession(token);
  if (!session) throw new Error('กรุณาเข้าสู่ระบบ');

  var sources = buildEligibleCharacteristicsSources(session, class_id, current_subject_id);
  var source = null;
  for (var i = 0; i < sources.length; i++) {
    if (String(sources[i].subject_id) === String(source_subject_id)) {
      source = sources[i];
      break;
    }
  }
  if (!source) throw new Error('แหล่งข้อมูลนี้ไม่มีสิทธิ์ใช้งานหรือข้อมูลยังไม่ครบถ้วน');

  var currentStudentIds = {};
  dbFind('Students', 'class_id', class_id).forEach(function(student) {
    currentStudentIds[String(student.student_id)] = true;
  });

  var values = dbGetAll('Characteristics').filter(function(row) {
    return String(row.subject_id) === String(source_subject_id) &&
      currentStudentIds[String(row.student_id)];
  }).map(function(row) {
    var item = { student_id: String(row.student_id) };
    CHARACTERISTIC_FIELDS.forEach(function(field) { item[field] = Number(row[field]); });
    return item;
  });

  appendAuditLog(session.user_id, 'CharacteristicsCopy', current_subject_id, null, {
    class_id: class_id,
    source_subject_id: source_subject_id,
    destination_subject_id: current_subject_id,
    rows_loaded: values.length
  });

  return { source: source, values: values };
}

// Returns all data needed to render the characteristics scoring grid.
// Returns: { students, scores, subject_info, class_info, can_edit }
// scores: map of student_id -> { t1..t8, total, label }
function getCharacteristicsData(token, class_id, subject_id) {
  var session = requireSession_(token);
  var access = requireSubjectAccess_(session, class_id, subject_id);
  var cls = access.class_info;
  var subj = access.subject_info;
  var can_edit = true;

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
  var session = requireSession_(token);
  requireSubjectAccess_(session, class_id, subject_id);

  if (!rows || rows.length === 0) return { ok: true };
  validateRowsBelongToClass_(rows, class_id);

  var now = new Date().toISOString();
  var upsertRows = rows.map(function(row) {
    var values = {};
    var total = 0;
    var allEmpty = true;
    CHARACTERISTIC_FIELDS.forEach(function(field) {
      var raw = row[field];
      var value = raw === '' || raw === null || raw === undefined ? '' : Number(raw);
      if (value !== '' && (isNaN(value) || value < 0 || value > 10)) {
        throw new Error('คะแนนคุณลักษณะต้องอยู่ระหว่าง 0 ถึง 10');
      }
      values[field] = value;
      if (value !== '') { total += value; allEmpty = false; }
    });
    var result = {
      student_id: String(row.student_id),
      subject_id: String(subject_id),
      total: allEmpty ? '' : total,
      label: allEmpty ? '' : computeCharacteristicsLabel(total),
      updated_by: session.user_id,
      updated_at: now
    };
    CHARACTERISTIC_FIELDS.forEach(function(field) { result[field] = values[field]; });
    return result;
  });
  dbBatchUpsertRows_('Characteristics', ['student_id', 'subject_id'], upsertRows, 'id', 'char');

  appendAuditLog(session.user_id, 'Characteristics', subject_id, null,
    { class_id: class_id, subject_id: subject_id, rows_saved: rows.length });

  return { ok: true };
}
