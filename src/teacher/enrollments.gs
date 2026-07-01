// US-018: Teacher enrollment management (teacher-first flow)
// US-019: Bulk assignment

// ---- Server functions called from the admin enrollments page ----

function getEnrollmentsData() {
  // Returns all data needed for the /admin/enrollments page
  ensureColumns('Subjects', ['class_id']);
  var teachers = dbGetAll('Users').filter(function(u) { return u.role === 'teacher'; });
  var classes = withClassLabels(dbGetAll('Classes'));
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
  var classRows = dbGetAll('Classes');
  var levelCounts = buildClassLevelCounts(classRows);
  var classes = {};
  classRows.forEach(function(c) { classes[c.class_id] = c; });
  var subjects = {};
  dbGetAll('Subjects').forEach(function(s) { subjects[s.subject_id] = s; });

  return enrollments.map(function(e) {
    var cls = classes[e.class_id] || {};
    var sub = subjects[e.subject_id] || {};
    return {
      enrollment_id: e.enrollment_id,
      class_id: e.class_id,
      class_label: fmtClassLabelWithCounts(cls.level, cls.section, levelCounts),
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
  // Returns assignment-ready class-specific subject rows for the "All pairs" tab
  var classes = dbGetAll('Classes');
  var levelCounts = buildClassLevelCounts(classes);
  var subjects = dbGetAll('Subjects');
  var enrollments = dbGetAll('Enrollments');
  var users = {};
  var classMap = {};
  classes.forEach(function(cls) { classMap[cls.class_id] = cls; });
  dbGetAll('Users').forEach(function(u) { users[u.user_id] = u; });

  // Build lookup
  var pairMap = {};
  enrollments.forEach(function(e) {
    var key = e.class_id + '|' + e.subject_id;
    pairMap[key] = e.teacher_user_id;
  });

  var rows = [];
  subjects.forEach(function(sub) {
    if (!sub.class_id) return;
    var cls = classMap[sub.class_id];
    if (!cls) return;
    var key = sub.class_id + '|' + sub.subject_id;
    var teacherId = pairMap[key];
    var teacherName = teacherId && users[teacherId] ? users[teacherId].full_name : 'ยังไม่ได้กำหนด';
    rows.push({
      class_id: sub.class_id,
      class_label: fmtClassLabelWithCounts(cls.level, cls.section, levelCounts),
      subject_id: sub.subject_id,
      subject_name: sub.subject_name,
      subject_code: sub.subject_code || '',
      teacher_user_id: teacherId || '',
      teacher_name: teacherName
    });
  });
  return rows;
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

function clientImportEnrollmentsCSV(token, rows) {
  try {
    var session = getSession(token);
    requireAdmin(session);
    if (!rows || rows.length === 0) return { error: 'ไม่พบข้อมูลในไฟล์ CSV' };

    var teachers = dbGetAll('Users').filter(function(u) { return u.role === 'teacher'; });
    var teacherByUsername = {};
    var teacherByName = {};
    teachers.forEach(function(t) {
      if (t.username) teacherByUsername[String(t.username).trim().toLowerCase()] = t;
      if (t.full_name) teacherByName[String(t.full_name).trim().toLowerCase()] = t;
    });

    var classes = dbGetAll('Classes');
    var classMatches = {};
    classes.forEach(function(c) {
      var level = String(c.level || '').trim();
      var section = String(c.section || '').trim();
      var key = level + '|' + section;
      if (!classMatches[key]) classMatches[key] = [];
      classMatches[key].push(c);
      if (!classMatches[level + '|']) classMatches[level + '|'] = [];
      classMatches[level + '|'].push(c);
    });

    var subjects = dbGetAll('Subjects');
    var subjectsByClass = {};
    subjects.forEach(function(s) {
      if (!subjectsByClass[s.class_id]) subjectsByClass[s.class_id] = [];
      subjectsByClass[s.class_id].push(s);
    });

    var enrollments = dbGetAll('Enrollments');
    var enrollmentMap = {};
    enrollments.forEach(function(e) { enrollmentMap[e.class_id + '|' + e.subject_id] = e; });

    var errors = [];
    var assignments = [];
    rows.forEach(function(row, idx) {
      var line = idx + 2;
      var teacher = teacherByUsername[String(row.teacher_username || '').trim().toLowerCase()] ||
        teacherByName[String(row.teacher_full_name || '').trim().toLowerCase()];
      if (!teacher) {
        errors.push('แถวที่ ' + line + ': ไม่พบครูจาก username/full_name');
        return;
      }

      var level = String(row.grade_level || '').trim();
      var section = String(row.section || '').trim();
      var classId = String(row.class_id || '').trim();
      var cls = classId ? dbFindOne('Classes', 'class_id', classId) : null;
      if (!cls) {
        var matchedClasses = classMatches[level + '|' + section] || [];
        if (!section && matchedClasses.length > 1) {
          errors.push('แถวที่ ' + line + ': ระดับชั้น ' + level + ' มีหลายห้อง กรุณาระบุ section หรือ class_id');
          return;
        }
        cls = matchedClasses[0] || null;
      }
      if (!cls) {
        errors.push('แถวที่ ' + line + ': ไม่พบชั้นเรียน ' + (level || classId));
        return;
      }

      var subjectCode = String(row.subject_code || '').trim();
      var subjectName = String(row.subject_name || '').trim();
      if (!subjectCode || !subjectName || !level) {
        errors.push('แถวที่ ' + line + ': ต้องระบุ subject_code, subject_name และ grade_level');
        return;
      }

      var candidates = subjectsByClass[cls.class_id] || [];
      var matched = candidates.filter(function(s) {
        return String(s.subject_code || '').trim() === subjectCode &&
          String(s.subject_name || '').trim() === subjectName;
      });
      if (matched.length === 0) {
        errors.push('แถวที่ ' + line + ': ไม่พบวิชา ' + subjectCode + ' - ' + subjectName + ' ใน ' + level);
        return;
      }

      assignments.push({ teacher_user_id: teacher.user_id, class_id: cls.class_id, subject_id: matched[0].subject_id, line: line });
    });

    if (errors.length > 0) return { error: 'นำเข้าไม่สำเร็จ', errors: errors };

    var created = 0, reassigned = 0, unchanged = 0;
    var lock = LockService.getDocumentLock();
    if (!lock.tryLock(30000)) throw new Error('ไม่สามารถบันทึกได้ กรุณาลองใหม่');
    try {
      assignments.forEach(function(a) {
        var key = a.class_id + '|' + a.subject_id;
        var existing = enrollmentMap[key];
        if (!existing) {
          var newId = generateId('enr');
          dbInsert('Enrollments', {
            enrollment_id: newId,
            class_id: a.class_id,
            subject_id: a.subject_id,
            teacher_user_id: a.teacher_user_id,
            dev_activity_result: ''
          });
          enrollmentMap[key] = { enrollment_id: newId, class_id: a.class_id, subject_id: a.subject_id, teacher_user_id: a.teacher_user_id };
          appendAuditLog(session.user_id, 'Enrollments', newId, null, { imported: true, class_id: a.class_id, subject_id: a.subject_id, teacher_user_id: a.teacher_user_id });
          created++;
        } else if (existing.teacher_user_id === a.teacher_user_id) {
          unchanged++;
        } else {
          appendAuditLog(session.user_id, 'Enrollments', existing.enrollment_id,
            { class_id: a.class_id, subject_id: a.subject_id, teacher_user_id: existing.teacher_user_id },
            { imported: true, class_id: a.class_id, subject_id: a.subject_id, teacher_user_id: a.teacher_user_id });
          dbUpdate('Enrollments', 'enrollment_id', existing.enrollment_id, { teacher_user_id: a.teacher_user_id });
          existing.teacher_user_id = a.teacher_user_id;
          reassigned++;
        }
      });
    } finally {
      lock.releaseLock();
    }

    if (created || reassigned) invalidateWorkloadCache();
    return { ok: true, created: created, reassigned: reassigned, unchanged: unchanged, total: assignments.length };
  } catch (err) {
    return { error: err.message };
  }
}
