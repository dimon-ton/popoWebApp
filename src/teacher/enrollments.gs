// US-018: Teacher enrollment management (teacher-first flow)
// US-019: Bulk assignment

// ---- Server functions called from the admin enrollments page ----

function getEnrollmentsData_() {
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

function getTeacherEnrollments_(teacherUserId) {
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

function addEnrollmentAtomic_(session, teacherUserId, classId, subjectId) {
  if (!teacherUserId || !classId || !subjectId) return { error: 'Missing required fields' };

  return withDbLock_(function() {
    var enrollments = dbGetAll('Enrollments');
    var existing = null;
    for (var i = 0; i < enrollments.length; i++) {
      if (String(enrollments[i].class_id) === String(classId) &&
          String(enrollments[i].subject_id) === String(subjectId)) {
        existing = enrollments[i];
        break;
      }
    }

    if (existing) {
      if (String(existing.teacher_user_id) === String(teacherUserId)) {
        return { status: 'unchanged', message: 'คู่นี้ถูกกำหนดให้ครูนี้อยู่แล้ว' };
      }
      var otherTeacher = dbFindOne('Users', 'user_id', existing.teacher_user_id);
      return {
        status: 'conflict',
        existing_enrollment_id: existing.enrollment_id,
        other_teacher_name: otherTeacher ? otherTeacher.full_name : existing.teacher_user_id,
        other_teacher_id: existing.teacher_user_id,
        message: 'conflict'
      };
    }

    var enrollmentId = generateId('enr');
    dbInsertUnlocked_('Enrollments', {
      enrollment_id: enrollmentId,
      class_id: classId,
      subject_id: subjectId,
      teacher_user_id: teacherUserId,
      dev_activity_result: ''
    });
    appendAuditLogUnlocked_(session.user_id, 'Enrollments', enrollmentId, null, {
      class_id: classId, subject_id: subjectId, teacher_user_id: teacherUserId
    });
    return { status: 'created', enrollment_id: enrollmentId };
  });
}

function handleAddEnrollment(e, session) {
  requireAdmin(session);
  var params = e.parameter;
  var result = addEnrollmentAtomic_(session, params.teacher_user_id, params.class_id, params.subject_id);
  if (result.status === 'created') {
    invalidateWorkloadCache();
    result.enrollments = getTeacherEnrollments_(params.teacher_user_id);
  }
  return jsonResponse(result);
}

function reassignEnrollmentAtomic_(session, enrollmentId, newTeacherUserId) {
  if (!enrollmentId || !newTeacherUserId) return { error: 'Missing required fields' };
  return withDbLock_(function() {
    var existing = dbFindOne('Enrollments', 'enrollment_id', enrollmentId);
    if (!existing) return { error: 'Enrollment not found' };
    var oldValue = {
      class_id: existing.class_id,
      subject_id: existing.subject_id,
      teacher_user_id: existing.teacher_user_id
    };
    var newValue = {
      class_id: existing.class_id,
      subject_id: existing.subject_id,
      teacher_user_id: newTeacherUserId
    };
    var updated = dbUpdateUnlocked_('Enrollments', 'enrollment_id', enrollmentId, {
      teacher_user_id: newTeacherUserId
    });
    if (!updated) return { error: 'Enrollment not found' };
    appendAuditLogUnlocked_(session.user_id, 'Enrollments', enrollmentId, oldValue, newValue);
    return { status: 'reassigned', old_teacher_id: existing.teacher_user_id };
  });
}

function removeEnrollmentAtomic_(session, enrollmentId) {
  if (!enrollmentId) return { error: 'Missing enrollment_id' };
  return withDbLock_(function() {
    var existing = dbFindOne('Enrollments', 'enrollment_id', enrollmentId);
    if (!existing) return { error: 'Enrollment not found' };
    var oldValue = {
      class_id: existing.class_id,
      subject_id: existing.subject_id,
      teacher_user_id: existing.teacher_user_id
    };
    var deleted = dbDeleteUnlocked_('Enrollments', 'enrollment_id', enrollmentId);
    if (!deleted) return { error: 'Enrollment not found' };
    appendAuditLogUnlocked_(session.user_id, 'Enrollments', enrollmentId, oldValue, null);
    return { status: 'removed', teacher_user_id: existing.teacher_user_id };
  });
}

function handleConfirmReassign(e, session) {
  requireAdmin(session);
  var params = e.parameter;
  var result = reassignEnrollmentAtomic_(session, params.existing_enrollment_id, params.new_teacher_user_id);
  if (result.status === 'reassigned') {
    invalidateWorkloadCache();
    result.enrollments = getTeacherEnrollments_(params.new_teacher_user_id);
  }
  return jsonResponse(result);
}

function handleRemoveEnrollment(e, session) {
  requireAdmin(session);
  var params = e.parameter;
  var result = removeEnrollmentAtomic_(session, params.enrollment_id);
  if (result.status === 'removed') {
    invalidateWorkloadCache();
    var teacherUserId = params.teacher_user_id || result.teacher_user_id;
    result.enrollments = teacherUserId ? getTeacherEnrollments_(teacherUserId) : [];
  }
  return jsonResponse(result);
}

function getAllPairsMatrix_() {
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
    return getEnrollmentsData_();
  } catch (err) {
    return { error: err.message };
  }
}

function clientGetTeacherEnrollments(token, teacherUserId) {
  try {
    var session = getSession(token);
    requireAdmin(session);
    return { enrollments: getTeacherEnrollments_(teacherUserId) };
  } catch (err) {
    return { error: err.message };
  }
}

function clientGetAllPairsMatrix(token) {
  try {
    var session = getSession(token);
    requireAdmin(session);
    return { rows: getAllPairsMatrix_() };
  } catch (err) {
    return { error: err.message };
  }
}

function clientAddEnrollment(token, teacherUserId, classId, subjectId) {
  try {
    var session = requireAdminToken_(token);
    var result = addEnrollmentAtomic_(session, teacherUserId, classId, subjectId);
    if (result.status === 'created') {
      invalidateWorkloadCache();
      result.enrollments = getTeacherEnrollments_(teacherUserId);
    }
    return result;
  } catch (err) {
    return { error: err.message };
  }
}

function clientRemoveEnrollment(token, enrollmentId, teacherUserId) {
  try {
    var session = requireAdminToken_(token);
    var result = removeEnrollmentAtomic_(session, enrollmentId);
    if (result.status === 'removed') {
      invalidateWorkloadCache();
      var ownerId = teacherUserId || result.teacher_user_id;
      result.enrollments = ownerId ? getTeacherEnrollments_(ownerId) : [];
    }
    return result;
  } catch (err) {
    return { error: err.message };
  }
}

function clientConfirmReassign(token, existingEnrollmentId, newTeacherUserId, classId, subjectId) {
  try {
    var session = requireAdminToken_(token);
    var result = reassignEnrollmentAtomic_(session, existingEnrollmentId, newTeacherUserId);
    if (result.status === 'reassigned') {
      invalidateWorkloadCache();
      result.enrollments = getTeacherEnrollments_(newTeacherUserId);
    }
    return result;
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
          dbInsertUnlocked_('Enrollments', {
            enrollment_id: newId,
            class_id: a.class_id,
            subject_id: a.subject_id,
            teacher_user_id: a.teacher_user_id,
            dev_activity_result: ''
          });
          enrollmentMap[key] = { enrollment_id: newId, class_id: a.class_id, subject_id: a.subject_id, teacher_user_id: a.teacher_user_id };
          appendAuditLogUnlocked_(session.user_id, 'Enrollments', newId, null, { imported: true, class_id: a.class_id, subject_id: a.subject_id, teacher_user_id: a.teacher_user_id });
          created++;
        } else if (existing.teacher_user_id === a.teacher_user_id) {
          unchanged++;
        } else {
          appendAuditLogUnlocked_(session.user_id, 'Enrollments', existing.enrollment_id,
            { class_id: a.class_id, subject_id: a.subject_id, teacher_user_id: existing.teacher_user_id },
            { imported: true, class_id: a.class_id, subject_id: a.subject_id, teacher_user_id: a.teacher_user_id });
          dbUpdateUnlocked_('Enrollments', 'enrollment_id', existing.enrollment_id, { teacher_user_id: a.teacher_user_id });
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
