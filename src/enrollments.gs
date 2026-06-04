// US-018: Teacher enrollment management (teacher-first flow)
// US-019: Bulk assignment

// ---- Server functions called from the admin enrollments page ----

function getEnrollmentsData() {
  // Returns all data needed for the /admin/enrollments page
  var teachers = dbGetAll('Users').filter(function(u) { return u.role === 'teacher'; });
  var classes = dbGetAll('Classes');
  var subjects = dbGetAll('Subjects');
  var enrollments = dbGetAll('Enrollments');

  // Compute pair count per teacher
  var pairCount = {};
  teachers.forEach(function(t) { pairCount[t.user_id] = 0; });
  enrollments.forEach(function(e) {
    if (pairCount[e.teacher_user_id] !== undefined) {
      pairCount[e.teacher_user_id]++;
    }
  });

  return {
    teachers: teachers.map(function(t) {
      return { user_id: t.user_id, full_name: t.full_name, pair_count: pairCount[t.user_id] || 0 };
    }),
    classes: classes,
    subjects: subjects,
    enrollments: enrollments
  };
}

function getTeacherEnrollments(teacherUserId) {
  var enrollments = dbGetAll('Enrollments').filter(function(e) {
    return e.teacher_user_id === teacherUserId;
  });
  var classes = {};
  dbGetAll('Classes').forEach(function(c) { classes[c.class_id] = c; });
  var subjects = {};
  dbGetAll('Subjects').forEach(function(s) { subjects[s.subject_id] = s; });

  return enrollments.map(function(e) {
    var cls = classes[e.class_id] || {};
    var sub = subjects[e.subject_id] || {};
    return {
      enrollment_id: e.enrollment_id,
      class_id: e.class_id,
      class_label: fmtClassLabel(cls.level, cls.section),
      subject_id: e.subject_id,
      subject_name: sub.subject_name || e.subject_id,
      subject_code: sub.subject_code || ''
    };
  });
}

function handleAddEnrollment(e, session) {
  requireAdmin(session);
  var params = e.parameter;
  var teacherUserId = params.teacher_user_id;
  var classId = params.class_id;
  var subjectId = params.subject_id;

  if (!teacherUserId || !classId || !subjectId) {
    return jsonResponse({ error: 'Missing required fields' });
  }

  // Check uniqueness: is this (class, subject) already assigned?
  var enrollments = dbGetAll('Enrollments');
  var existing = null;
  for (var i = 0; i < enrollments.length; i++) {
    if (enrollments[i].class_id === classId && enrollments[i].subject_id === subjectId) {
      existing = enrollments[i];
      break;
    }
  }

  if (existing) {
    if (existing.teacher_user_id === teacherUserId) {
      // Already assigned to this teacher — no change needed
      return jsonResponse({ status: 'unchanged', message: 'คู่นี้ถูกกำหนดให้ครูนี้อยู่แล้ว' });
    }
    // Assigned to a different teacher — return conflict for UI confirmation
    var otherTeacher = dbFindOne('Users', 'user_id', existing.teacher_user_id);
    return jsonResponse({
      status: 'conflict',
      existing_enrollment_id: existing.enrollment_id,
      other_teacher_name: otherTeacher ? otherTeacher.full_name : existing.teacher_user_id,
      other_teacher_id: existing.teacher_user_id,
      message: 'conflict'
    });
  }

  // Safe to insert
  var enrollmentId = generateId('enr');
  dbInsert('Enrollments', {
    enrollment_id: enrollmentId,
    class_id: classId,
    subject_id: subjectId,
    teacher_user_id: teacherUserId,
    dev_activity_result: ''
  });
  appendAuditLog(session.user_id, 'Enrollments', enrollmentId, null, {
    class_id: classId, subject_id: subjectId, teacher_user_id: teacherUserId
  });

  invalidateWorkloadCache();
  var newEnrollments = getTeacherEnrollments(teacherUserId);
  return jsonResponse({ status: 'created', enrollment_id: enrollmentId, enrollments: newEnrollments });
}

function handleConfirmReassign(e, session) {
  requireAdmin(session);
  var params = e.parameter;
  var existingEnrollmentId = params.existing_enrollment_id;
  var newTeacherUserId = params.new_teacher_user_id;
  var classId = params.class_id;
  var subjectId = params.subject_id;

  if (!existingEnrollmentId || !newTeacherUserId) {
    return jsonResponse({ error: 'Missing required fields' });
  }

  var existing = dbFindOne('Enrollments', 'enrollment_id', existingEnrollmentId);
  if (!existing) return jsonResponse({ error: 'Enrollment not found' });

  var oldTeacherId = existing.teacher_user_id;

  // Audit: removal from old teacher
  appendAuditLog(session.user_id, 'Enrollments', existingEnrollmentId,
    { class_id: classId, subject_id: subjectId, teacher_user_id: oldTeacherId },
    { class_id: classId, subject_id: subjectId, teacher_user_id: newTeacherUserId }
  );

  // Update the row
  dbUpdate('Enrollments', 'enrollment_id', existingEnrollmentId, {
    teacher_user_id: newTeacherUserId
  });

  // Audit: addition to new teacher
  appendAuditLog(session.user_id, 'Enrollments', existingEnrollmentId,
    null,
    { class_id: classId, subject_id: subjectId, teacher_user_id: newTeacherUserId }
  );

  invalidateWorkloadCache();
  var newEnrollments = getTeacherEnrollments(newTeacherUserId);
  return jsonResponse({ status: 'reassigned', enrollments: newEnrollments });
}

function handleRemoveEnrollment(e, session) {
  requireAdmin(session);
  var params = e.parameter;
  var enrollmentId = params.enrollment_id;
  var teacherUserId = params.teacher_user_id;

  if (!enrollmentId) return jsonResponse({ error: 'Missing enrollment_id' });

  var existing = dbFindOne('Enrollments', 'enrollment_id', enrollmentId);
  if (!existing) return jsonResponse({ error: 'Enrollment not found' });

  appendAuditLog(session.user_id, 'Enrollments', enrollmentId, {
    class_id: existing.class_id,
    subject_id: existing.subject_id,
    teacher_user_id: existing.teacher_user_id
  }, null);

  dbDelete('Enrollments', 'enrollment_id', enrollmentId);
  invalidateWorkloadCache();

  var updated = teacherUserId ? getTeacherEnrollments(teacherUserId) : [];
  return jsonResponse({ status: 'removed', enrollments: updated });
}

function getAllPairsMatrix() {
  // Returns full school matrix for the "All pairs" tab
  var classes = dbGetAll('Classes');
  var subjects = dbGetAll('Subjects');
  var enrollments = dbGetAll('Enrollments');
  var users = {};
  dbGetAll('Users').forEach(function(u) { users[u.user_id] = u; });

  // Build lookup
  var pairMap = {};
  enrollments.forEach(function(e) {
    var key = e.class_id + '|' + e.subject_id;
    pairMap[key] = e.teacher_user_id;
  });

  var rows = [];
  classes.forEach(function(cls) {
    subjects.forEach(function(sub) {
      var key = cls.class_id + '|' + sub.subject_id;
      var teacherId = pairMap[key];
      var teacherName = teacherId && users[teacherId] ? users[teacherId].full_name : 'ยังไม่ได้กำหนด';
      rows.push({
        class_id: cls.class_id,
        class_label: fmtClassLabel(cls.level, cls.section),
        subject_id: sub.subject_id,
        subject_name: sub.subject_name,
        subject_code: sub.subject_code || '',
        teacher_user_id: teacherId || '',
        teacher_name: teacherName
      });
    });
  });
  return rows;
}

// ---- US-019: Bulk assign ----

function handleBulkAssign(e, session) {
  requireAdmin(session);
  var params = e.parameter;
  var mode = params.mode; // 'A' or 'B'
  var teacherUserId = params.teacher_user_id;

  // mode A: many subjects, one class
  // mode B: many classes, one subject
  var classIds = params.class_ids ? params.class_ids.split(',') : [];
  var subjectIds = params.subject_ids ? params.subject_ids.split(',') : [];
  var classId = params.class_id;
  var subjectId = params.subject_id;

  var pairs = [];
  if (mode === 'A') {
    subjectIds.forEach(function(sid) { pairs.push({ class_id: classId, subject_id: sid }); });
  } else if (mode === 'B') {
    classIds.forEach(function(cid) { pairs.push({ class_id: cid, subject_id: subjectId }); });
  }

  var lock = LockService.getDocumentLock();
  if (!lock.tryLock(30000)) {
    return jsonResponse({ error: 'Could not acquire lock. Please try again.' });
  }

  var created = 0, reassigned = 0, unchanged = 0;
  try {
    var enrollments = dbGetAll('Enrollments');
    var pairMap = {};
    enrollments.forEach(function(en) {
      pairMap[en.class_id + '|' + en.subject_id] = en;
    });

    pairs.forEach(function(pair) {
      var key = pair.class_id + '|' + pair.subject_id;
      var existing = pairMap[key];
      if (!existing) {
        var newId = generateId('enr');
        dbInsert('Enrollments', {
          enrollment_id: newId,
          class_id: pair.class_id,
          subject_id: pair.subject_id,
          teacher_user_id: teacherUserId,
          dev_activity_result: ''
        });
        appendAuditLog(session.user_id, 'Enrollments', newId, null, {
          class_id: pair.class_id, subject_id: pair.subject_id, teacher_user_id: teacherUserId
        });
        created++;
      } else if (existing.teacher_user_id === teacherUserId) {
        unchanged++;
      } else {
        appendAuditLog(session.user_id, 'Enrollments', existing.enrollment_id,
          { class_id: pair.class_id, subject_id: pair.subject_id, teacher_user_id: existing.teacher_user_id },
          { class_id: pair.class_id, subject_id: pair.subject_id, teacher_user_id: teacherUserId }
        );
        dbUpdate('Enrollments', 'enrollment_id', existing.enrollment_id, { teacher_user_id: teacherUserId });
        reassigned++;
      }
    });
  } finally {
    lock.releaseLock();
  }

  if (created > 0 || reassigned > 0) {
    invalidateWorkloadCache();
  }
  return jsonResponse({ status: 'ok', created: created, reassigned: reassigned, unchanged: unchanged });
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ---- google.script.run wrappers (called directly from client JS) ----

function clientGetEnrollmentsData(token) {
  try {
    var session = getSession(token);
    requireAdmin(session);
    return getEnrollmentsData();
  } catch (err) {
    return { error: err.message };
  }
}

function clientGetTeacherEnrollments(token, teacherUserId) {
  try {
    var session = getSession(token);
    requireAdmin(session);
    return { enrollments: getTeacherEnrollments(teacherUserId) };
  } catch (err) {
    return { error: err.message };
  }
}

function clientGetAllPairsMatrix(token) {
  try {
    var session = getSession(token);
    requireAdmin(session);
    return { rows: getAllPairsMatrix() };
  } catch (err) {
    return { error: err.message };
  }
}

function clientAddEnrollment(token, teacherUserId, classId, subjectId) {
  try {
    var session = getSession(token);
    requireAdmin(session);
    if (!teacherUserId || !classId || !subjectId) return { error: 'Missing required fields' };

    var enrollments = dbGetAll('Enrollments');
    var existing = null;
    for (var i = 0; i < enrollments.length; i++) {
      if (enrollments[i].class_id === classId && enrollments[i].subject_id === subjectId) {
        existing = enrollments[i]; break;
      }
    }

    if (existing) {
      if (existing.teacher_user_id === teacherUserId) {
        return { status: 'unchanged', message: 'คู่นี้ถูกกำหนดให้ครูนี้อยู่แล้ว' };
      }
      var otherTeacher = dbFindOne('Users', 'user_id', existing.teacher_user_id);
      return {
        status: 'conflict',
        existing_enrollment_id: existing.enrollment_id,
        other_teacher_name: otherTeacher ? otherTeacher.full_name : existing.teacher_user_id,
        other_teacher_id: existing.teacher_user_id
      };
    }

    var enrollmentId = generateId('enr');
    dbInsert('Enrollments', {
      enrollment_id: enrollmentId,
      class_id: classId,
      subject_id: subjectId,
      teacher_user_id: teacherUserId,
      dev_activity_result: ''
    });
    appendAuditLog(session.user_id, 'Enrollments', enrollmentId, null, {
      class_id: classId, subject_id: subjectId, teacher_user_id: teacherUserId
    });
    invalidateWorkloadCache();
    return { status: 'created', enrollment_id: enrollmentId, enrollments: getTeacherEnrollments(teacherUserId) };
  } catch (err) {
    return { error: err.message };
  }
}

function clientRemoveEnrollment(token, enrollmentId, teacherUserId) {
  try {
    var session = getSession(token);
    requireAdmin(session);
    if (!enrollmentId) return { error: 'Missing enrollment_id' };

    var existing = dbFindOne('Enrollments', 'enrollment_id', enrollmentId);
    if (!existing) return { error: 'Enrollment not found' };

    appendAuditLog(session.user_id, 'Enrollments', enrollmentId, {
      class_id: existing.class_id, subject_id: existing.subject_id, teacher_user_id: existing.teacher_user_id
    }, null);
    dbDelete('Enrollments', 'enrollment_id', enrollmentId);
    invalidateWorkloadCache();
    return { status: 'removed', enrollments: teacherUserId ? getTeacherEnrollments(teacherUserId) : [] };
  } catch (err) {
    return { error: err.message };
  }
}

function clientConfirmReassign(token, existingEnrollmentId, newTeacherUserId, classId, subjectId) {
  try {
    var session = getSession(token);
    requireAdmin(session);
    if (!existingEnrollmentId || !newTeacherUserId) return { error: 'Missing required fields' };

    var existing = dbFindOne('Enrollments', 'enrollment_id', existingEnrollmentId);
    if (!existing) return { error: 'Enrollment not found' };

    var oldTeacherId = existing.teacher_user_id;
    appendAuditLog(session.user_id, 'Enrollments', existingEnrollmentId,
      { class_id: classId, subject_id: subjectId, teacher_user_id: oldTeacherId },
      { class_id: classId, subject_id: subjectId, teacher_user_id: newTeacherUserId }
    );
    dbUpdate('Enrollments', 'enrollment_id', existingEnrollmentId, { teacher_user_id: newTeacherUserId });
    invalidateWorkloadCache();
    return { status: 'reassigned', enrollments: getTeacherEnrollments(newTeacherUserId) };
  } catch (err) {
    return { error: err.message };
  }
}

function clientBulkAssign(token, mode, teacherUserId, classId, subjectId, classIds, subjectIds) {
  try {
    var session = getSession(token);
    requireAdmin(session);

    var classIdList = classIds ? classIds.split(',') : [];
    var subjectIdList = subjectIds ? subjectIds.split(',') : [];

    var pairs = [];
    if (mode === 'A') {
      subjectIdList.forEach(function(sid) { pairs.push({ class_id: classId, subject_id: sid }); });
    } else if (mode === 'B') {
      classIdList.forEach(function(cid) { pairs.push({ class_id: cid, subject_id: subjectId }); });
    }

    var lock = LockService.getDocumentLock();
    if (!lock.tryLock(30000)) return { error: 'Could not acquire lock. Please try again.' };

    var created = 0, reassigned = 0, unchanged = 0;
    try {
      var enrollments = dbGetAll('Enrollments');
      var pairMap = {};
      enrollments.forEach(function(en) { pairMap[en.class_id + '|' + en.subject_id] = en; });

      pairs.forEach(function(pair) {
        var key = pair.class_id + '|' + pair.subject_id;
        var ex = pairMap[key];
        if (!ex) {
          var newId = generateId('enr');
          dbInsert('Enrollments', {
            enrollment_id: newId, class_id: pair.class_id, subject_id: pair.subject_id,
            teacher_user_id: teacherUserId, dev_activity_result: ''
          });
          appendAuditLog(session.user_id, 'Enrollments', newId, null, {
            class_id: pair.class_id, subject_id: pair.subject_id, teacher_user_id: teacherUserId
          });
          created++;
        } else if (ex.teacher_user_id === teacherUserId) {
          unchanged++;
        } else {
          appendAuditLog(session.user_id, 'Enrollments', ex.enrollment_id,
            { class_id: pair.class_id, subject_id: pair.subject_id, teacher_user_id: ex.teacher_user_id },
            { class_id: pair.class_id, subject_id: pair.subject_id, teacher_user_id: teacherUserId }
          );
          dbUpdate('Enrollments', 'enrollment_id', ex.enrollment_id, { teacher_user_id: teacherUserId });
          reassigned++;
        }
      });
    } finally {
      lock.releaseLock();
    }

    if (created > 0 || reassigned > 0) invalidateWorkloadCache();
    return { status: 'ok', created: created, reassigned: reassigned, unchanged: unchanged };
  } catch (err) {
    return { error: err.message };
  }
}
