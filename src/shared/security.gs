// Shared authorization, validation, and safe-rendering helpers.
// Functions ending in _ are internal helpers and are not callable through google.script.run.

function requireSession_(token) {
  var session = getSession(token);
  if (!session) throw new Error('กรุณาเข้าสู่ระบบ');
  return session;
}

function requireAdminToken_(token) {
  var session = requireSession_(token);
  requireAdmin(session);
  return session;
}

function requireClassRosterAccess_(session, classId) {
  var cls = dbFindOne('Classes', 'class_id', classId);
  if (!cls) throw new Error('ไม่พบชั้นเรียน: ' + classId);

  if (session.role !== 'admin' && !classHasHomeroomTeacher(cls, session.user_id)) {
    throw new Error('ไม่มีสิทธิ์เข้าถึงข้อมูลนักเรียนของชั้นเรียนนี้');
  }
  return cls;
}

function subjectBelongsToClass_(subject, classId, enrollments) {
  if (!subject) return false;
  if (String(subject.class_id || '') === String(classId)) return true;
  return (enrollments || []).some(function(enrollment) {
    return String(enrollment.class_id) === String(classId) &&
      String(enrollment.subject_id) === String(subject.subject_id);
  });
}

function requireSubjectAccess_(session, classId, subjectId) {
  var cls = dbFindOne('Classes', 'class_id', classId);
  if (!cls) throw new Error('ไม่พบชั้นเรียน: ' + classId);

  var subject = dbFindOne('Subjects', 'subject_id', subjectId);
  var enrollments = dbGetAll('Enrollments');
  if (!subject || !subjectBelongsToClass_(subject, classId, enrollments)) {
    throw new Error('ไม่พบวิชาในชั้นเรียนนี้');
  }

  if (session.role !== 'admin') {
    var assigned = enrollments.some(function(enrollment) {
      return String(enrollment.class_id) === String(classId) &&
        String(enrollment.subject_id) === String(subjectId) &&
        String(enrollment.teacher_user_id) === String(session.user_id);
    });
    if (!assigned) throw new Error('ไม่มีสิทธิ์เข้าถึงข้อมูลของวิชานี้');
  }

  return { class_info: cls, subject_info: subject };
}

function getClassStudentIdSet_(classId) {
  var ids = {};
  dbFind('Students', 'class_id', classId).forEach(function(student) {
    ids[String(student.student_id)] = true;
  });
  return ids;
}

function validateRowsBelongToClass_(rows, classId) {
  var allowed = getClassStudentIdSet_(classId);
  (rows || []).forEach(function(row) {
    var studentId = String(row.student_id || '');
    if (!allowed[studentId]) {
      throw new Error('พบนักเรียนที่ไม่ได้อยู่ในชั้นเรียนนี้');
    }
  });
}

function validateFormativeRows_(rows, classId, subjectId) {
  validateRowsBelongToClass_(rows, classId);

  var indicators = {};
  dbFind('Indicators', 'subject_id', subjectId).forEach(function(indicator) {
    indicators[String(indicator.indicator_id)] = indicator;
  });

  (rows || []).forEach(function(row) {
    var indicator = indicators[String(row.indicator_id || '')];
    if (!indicator) throw new Error('พบตัวชี้วัดที่ไม่ได้อยู่ในวิชานี้');

    if (row.score === '' || row.score === null || row.score === undefined) return;
    var score = Number(row.score);
    var maxScore = Number(indicator.max_score);
    if (isNaN(score) || score < 0 || isNaN(maxScore) || score > maxScore) {
      throw new Error('คะแนน ' + (indicator.code || indicator.indicator_id) + ' ต้องอยู่ระหว่าง 0 ถึง ' + maxScore);
    }
  });
}

function escapeHtml_(value) {
  return String(value === undefined || value === null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeErrorHtml_(prefix, err) {
  return '<div style="font-family:sans-serif;padding:32px;color:#c0392b">' +
    '<b>' + escapeHtml_(prefix) + ':</b> ' +
    escapeHtml_(err && err.message ? err.message : 'Unknown error') +
    '</div>';
}
