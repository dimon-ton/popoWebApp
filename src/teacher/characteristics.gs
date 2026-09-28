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

function requireCharacteristicsDestinationAccess(session, class_id, subject_id, enrollments, classes, subjects) {
  var cls = null;
  (classes || dbGetAll('Classes')).some(function(item) {
    if (String(item.class_id) === String(class_id)) { cls = item; return true; }
    return false;
  });
  if (!cls) throw new Error('ไม่พบชั้นเรียน: ' + class_id);

  var subject = null;
  (subjects || dbGetAll('Subjects')).some(function(item) {
    if (String(item.subject_id) === String(subject_id)) { subject = item; return true; }
    return false;
  });
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

function buildCharacteristicsSourceContext_(session, class_id, current_subject_id) {
  var enrollments = dbGetAll('Enrollments');
  var classes = dbGetAll('Classes');
  var subjects = dbGetAll('Subjects');
  var access = requireCharacteristicsDestinationAccess(session, class_id, current_subject_id, enrollments, classes, subjects);
  var destinationLevel = String(access.class_info.level);
  var allStudents = dbGetAll('Students');
  var destinationStudentIds = {};
  allStudents.forEach(function(student) {
    if (String(student.class_id) === String(class_id)) destinationStudentIds[String(student.student_id)] = true;
  });
  if (!Object.keys(destinationStudentIds).length) return { sources: [], values_by_subject: {} };

  var classById = {};
  classes.forEach(function(cls) { classById[String(cls.class_id)] = cls; });
  var users = dbGetAll('Users');
  var userNames = {};
  users.forEach(function(user) { userNames[String(user.user_id)] = user.full_name || ''; });

  var classIdsBySubject = {};
  var enrollmentsBySubject = {};
  subjects.forEach(function(subject) {
    var subjectId = String(subject.subject_id || '');
    if (subjectId && subject.class_id) classIdsBySubject[subjectId] = [String(subject.class_id)];
  });
  enrollments.forEach(function(enrollment) {
    var subjectId = String(enrollment.subject_id || '');
    var sourceClassId = String(enrollment.class_id || '');
    if (!enrollmentsBySubject[subjectId]) enrollmentsBySubject[subjectId] = [];
    enrollmentsBySubject[subjectId].push(enrollment);
    if (!classIdsBySubject[subjectId]) classIdsBySubject[subjectId] = [];
    if (sourceClassId && classIdsBySubject[subjectId].indexOf(sourceClassId) === -1) classIdsBySubject[subjectId].push(sourceClassId);
  });

  var rowsBySubject = {};
  dbGetAll('Characteristics').forEach(function(row) {
    var subjectId = String(row.subject_id || '');
    if (!rowsBySubject[subjectId]) rowsBySubject[subjectId] = [];
    rowsBySubject[subjectId].push(row);
  });

  var sources = [];
  var valuesBySubject = {};
  subjects.forEach(function(subject) {
    var subjectId = String(subject.subject_id || '');
    if (!subjectId || subjectId === String(current_subject_id)) return;
    var eligibleClasses = (classIdsBySubject[subjectId] || []).map(function(sourceClassId) {
      return classById[sourceClassId];
    }).filter(function(sourceClass) {
      return sourceClass && String(sourceClass.level) === destinationLevel;
    });
    if (!eligibleClasses.length) return;
    eligibleClasses.sort(function(a, b) {
      var aSame = String(a.class_id) === String(class_id) ? 0 : 1;
      var bSame = String(b.class_id) === String(class_id) ? 0 : 1;
      if (aSame !== bSame) return aSame - bSame;
      return String(a.section || '').localeCompare(String(b.section || ''), 'th', { numeric: true });
    });
    var sourceClass = eligibleClasses[0];
    var valuesForStudents = {};
    var matchingStudentIds = {};
    var filledValueCount = 0;
    var updatedAt = '';
    (rowsBySubject[subjectId] || []).forEach(function(row) {
      var studentId = String(row.student_id || '');
      if (!destinationStudentIds[studentId]) return;
      matchingStudentIds[studentId] = true;
      var item = valuesForStudents[studentId] || { student_id: studentId };
      CHARACTERISTIC_FIELDS.forEach(function(field) {
        if (isCompleteCharacteristicValue(row[field])) {
          if (item[field] === undefined) filledValueCount++;
          item[field] = Number(row[field]);
        }
      });
      if (Object.keys(item).length > 1) valuesForStudents[studentId] = item;
      var rowUpdatedAt = String(row.updated_at || '');
      if (rowUpdatedAt > updatedAt) updatedAt = rowUpdatedAt;
    });
    var matchingStudents = Object.keys(matchingStudentIds).length;
    var studentsWithData = Object.keys(valuesForStudents).length;
    if (!matchingStudents || !studentsWithData || !filledValueCount) return;

    var teacherIds = {};
    (enrollmentsBySubject[subjectId] || []).forEach(function(enrollment) {
      if (String(enrollment.class_id) === String(sourceClass.class_id) && enrollment.teacher_user_id) {
        teacherIds[String(enrollment.teacher_user_id)] = true;
      }
    });
    var teacherNames = Object.keys(teacherIds).map(function(teacherId) {
      return userNames[teacherId] || teacherId;
    });
    valuesBySubject[subjectId] = Object.keys(valuesForStudents).map(function(studentId) { return valuesForStudents[studentId]; });
    sources.push({
      subject_id: subjectId,
      subject_name: subject.subject_name || subjectId,
      class_id: String(sourceClass.class_id),
      class_label: withClassLabel(sourceClass).class_label,
      level: sourceClass.level,
      teacher_names: teacherNames,
      matching_students: matchingStudents,
      students_with_data: studentsWithData,
      filled_value_count: filledValueCount,
      status: 'partial',
      updated_at: updatedAt
    });
  });

  sources.sort(function(a, b) {
    var aSame = String(a.class_id) === String(class_id) ? 0 : 1;
    var bSame = String(b.class_id) === String(class_id) ? 0 : 1;
    if (aSame !== bSame) return aSame - bSame;
    if (a.updated_at !== b.updated_at) return String(b.updated_at).localeCompare(String(a.updated_at));
    return String(a.subject_name).localeCompare(String(b.subject_name), 'th', { numeric: true });
  });
  return { sources: sources, values_by_subject: valuesBySubject };
}

function buildEligibleCharacteristicsSources(session, class_id, current_subject_id) {
  return buildCharacteristicsSourceContext_(session, class_id, current_subject_id).sources;
}

function getEligibleCharacteristicsSources(token, class_id, current_subject_id) {
  var session = getSession(token);
  if (!session) throw new Error('กรุณาเข้าสู่ระบบ');
  return { sources: buildEligibleCharacteristicsSources(session, class_id, current_subject_id) };
}

function getCharacteristicsSourceValues(token, class_id, current_subject_id, source_subject_id) {
  var session = getSession(token);
  if (!session) throw new Error('กรุณาเข้าสู่ระบบ');

  var context = buildCharacteristicsSourceContext_(session, class_id, current_subject_id);
  var sources = context.sources;
  var source = null;
  for (var i = 0; i < sources.length; i++) {
    if (String(sources[i].subject_id) === String(source_subject_id)) {
      source = sources[i];
      break;
    }
  }
  if (!source) throw new Error('แหล่งข้อมูลนี้ไม่สามารถนำมาใช้กับวิชาปลายทางนี้');

  var values = context.values_by_subject[String(source_subject_id)] || [];

  appendAuditLog(session.user_id, 'CharacteristicsCopy', current_subject_id, null, {
    class_id: class_id,
    source_subject_id: source_subject_id,
    destination_subject_id: current_subject_id,
    rows_loaded: values.length,
    matched_student_count: source.matching_students,
    copied_value_count: source.filled_value_count
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
