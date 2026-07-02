// US-005: Student roster CRUD

// Returns students for a class, ordered by seq_no.
// Access: admin OR homeroom teacher of the class.
function getStudentsList(token, class_id) {
  var session = getSession(token);
  if (!session) throw new Error('กรุณาเข้าสู่ระบบ');

  var cls = dbFindOne('Classes', 'class_id', class_id);
  if (!cls) throw new Error('ไม่พบชั้นเรียน: ' + class_id);

  var isAdmin = session.role === 'admin';
  var isHomeroom = classHasHomeroomTeacher(cls, session.user_id);

  var students = dbFind('Students', 'class_id', class_id);
  students.sort(function(a, b) {
    return Number(a.seq_no) - Number(b.seq_no);
  });

  return {
    students: sanitizeRows(students),
    class_info: sanitizeRow(withClassLabel(cls)),
    can_edit: isAdmin || isHomeroom
  };
}

// Convert any non-serializable values (Date, etc.) to strings so
// google.script.run can send the object to the client without dropping it.
function sanitizeRow(row) {
  if (!row) return row;
  var out = {};
  function toDateInputValue(value) {
    if (value instanceof Date && !isNaN(value.getTime())) {
      return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    }
    var s = String(value || '').trim();
    return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.substring(0, 10) : '';
  }
  function toThaiBuddhistDateDisplay(value) {
    var iso = toDateInputValue(value);
    if (!iso) return String(value || '');
    var parts = iso.split('-');
    return parts[2] + '/' + parts[1] + '/' + (Number(parts[0]) + 543);
  }
  Object.keys(row).forEach(function(k) {
    var v = row[k];
    if (v instanceof Date) {
      if (isNaN(v.getTime())) {
        out[k] = '';
      } else {
        var d = v.getDate();
        var m = v.getMonth() + 1;
        var beYear = v.getFullYear() + 543;
        out[k] = (d < 10 ? '0' + d : d) + '/' + (m < 10 ? '0' + m : m) + '/' + beYear;
      }
    } else if (v === null || v === undefined) {
      out[k] = '';
    } else {
      out[k] = k === 'dob' ? toThaiBuddhistDateDisplay(v) : v;
    }
    if (k === 'dob') {
      out.dob_input = toDateInputValue(v);
    }
  });
  return out;
}

function sanitizeRows(rows) {
  return (rows || []).map(sanitizeRow);
}

// Add a student. Only admin or homeroom teacher of the class.
function serverAddStudent(token, class_id, seq_no, student_code, citizen_id, full_name, dob, note) {
  var session = getSession(token);
  if (!session) throw new Error('กรุณาเข้าสู่ระบบ');

  var cls = dbFindOne('Classes', 'class_id', class_id);
  if (!cls) throw new Error('ไม่พบชั้นเรียน: ' + class_id);

  if (session.role !== 'admin' && !classHasHomeroomTeacher(cls, session.user_id)) {
    throw new Error('ไม่มีสิทธิ์แก้ไขชั้นเรียนนี้');
  }

  // citizen_id uniqueness within class (if provided)
  if (citizen_id && citizen_id.trim() !== '') {
    var existing = dbFind('Students', 'class_id', class_id);
    for (var i = 0; i < existing.length; i++) {
      if (existing[i].citizen_id === citizen_id.trim()) {
        throw new Error('เลขประจำตัวประชาชนซ้ำในชั้นเรียนนี้');
      }
    }
  }

  var student_id = generateId('student');
  dbInsert('Students', {
    student_id: student_id,
    class_id: class_id,
    seq_no: parseInt(seq_no) || 0,
    student_code: student_code || '',
    citizen_id: citizen_id || '',
    full_name: full_name || '',
    dob: dob || '',
    note: note || ''
  });

  appendAuditLog(session.user_id, 'Students', student_id, null, {
    class_id: class_id, seq_no: seq_no, full_name: full_name
  });

  return { ok: true, student_id: student_id };
}

// Update a student's note (and other editable fields). Only admin or homeroom teacher.
function serverUpdateStudent(token, student_id, seq_no, student_code, citizen_id, full_name, dob, note) {
  var session = getSession(token);
  if (!session) throw new Error('กรุณาเข้าสู่ระบบ');

  var student = dbFindOne('Students', 'student_id', student_id);
  if (!student) throw new Error('ไม่พบนักเรียน');

  var cls = dbFindOne('Classes', 'class_id', student.class_id);
  if (session.role !== 'admin' && (!cls || !classHasHomeroomTeacher(cls, session.user_id))) {
    throw new Error('ไม่มีสิทธิ์แก้ไขชั้นเรียนนี้');
  }

  // citizen_id uniqueness within class (if changed)
  if (citizen_id && citizen_id.trim() !== '' && citizen_id.trim() !== student.citizen_id) {
    var classStudents = dbFind('Students', 'class_id', student.class_id);
    for (var i = 0; i < classStudents.length; i++) {
      if (classStudents[i].student_id !== student_id && classStudents[i].citizen_id === citizen_id.trim()) {
        throw new Error('เลขประจำตัวประชาชนซ้ำในชั้นเรียนนี้');
      }
    }
  }

  var oldVal = JSON.parse(JSON.stringify(student));
  dbUpdate('Students', 'student_id', student_id, {
    seq_no: parseInt(seq_no) || student.seq_no,
    student_code: student_code !== undefined ? student_code : student.student_code,
    citizen_id: citizen_id !== undefined ? citizen_id : student.citizen_id,
    full_name: full_name !== undefined ? full_name : student.full_name,
    dob: dob !== undefined ? dob : student.dob,
    note: note !== undefined ? note : student.note
  });

  appendAuditLog(session.user_id, 'Students', student_id, oldVal, {
    seq_no: seq_no, student_code: student_code, full_name: full_name, note: note
  });

  return { ok: true };
}

// Delete a student. Only admin or homeroom teacher.
function serverDeleteStudent(token, student_id) {
  var session = getSession(token);
  if (!session) throw new Error('กรุณาเข้าสู่ระบบ');

  var student = dbFindOne('Students', 'student_id', student_id);
  if (!student) throw new Error('ไม่พบนักเรียน');

  var cls = dbFindOne('Classes', 'class_id', student.class_id);
  if (session.role !== 'admin' && (!cls || !classHasHomeroomTeacher(cls, session.user_id))) {
    throw new Error('ไม่มีสิทธิ์แก้ไขชั้นเรียนนี้');
  }

  appendAuditLog(session.user_id, 'Students', student_id, student, null);
  dbDelete('Students', 'student_id', student_id);
  return { ok: true };
}

function serverImportStudentsCSV(token, class_id, rows) {
  var session = getSession(token);
  if (!session) throw new Error('กรุณาเข้าสู่ระบบ');

  var cls = dbFindOne('Classes', 'class_id', class_id);
  if (!cls) throw new Error('ไม่พบชั้นเรียน: ' + class_id);

  if (session.role !== 'admin' && !classHasHomeroomTeacher(cls, session.user_id)) {
    throw new Error('ไม่มีสิทธิ์แก้ไขชั้นเรียนนี้');
  }

  var existing = dbFind('Students', 'class_id', class_id);
  var byId = {};
  var byCode = {};
  var byCitizenId = {};
  existing.forEach(function(s) {
    if (s.student_id) byId[String(s.student_id)] = s;
    if (s.student_code) byCode[String(s.student_code).trim()] = s;
    if (s.citizen_id) byCitizenId[String(s.citizen_id).trim()] = s;
  });

  var created = 0;
  var updated = 0;
  var warnings = [];

  (rows || []).forEach(function(row, idx) {
    var lineNum = idx + 1;
    var studentId = String(row.student_id || '').trim();
    var seqNo = parseInt(row.seq_no, 10) || 0;
    var studentCode = String(row.student_code || '').trim();
    var citizenId = String(row.citizen_id || '').trim();
    var fullName = String(row.full_name || '').trim();
    var dob = String(row.dob || '').trim();
    var note = String(row.note || '').trim();

    if (!fullName) {
      warnings.push('แถวที่ ' + lineNum + ': ข้ามรายการเพราะไม่ได้ระบุชื่อ-สกุล');
      return;
    }

    var target = null;
    if (studentId && byId[studentId]) {
      target = byId[studentId];
    } else if (!studentId && studentCode && byCode[studentCode]) {
      target = byCode[studentCode];
      studentId = target.student_id;
    }

    if (citizenId) {
      var duplicate = byCitizenId[citizenId];
      if (duplicate && (!target || duplicate.student_id !== target.student_id)) {
        warnings.push('แถวที่ ' + lineNum + ': ข้ามรายการเพราะเลขประจำตัวประชาชนซ้ำในชั้นเรียนนี้');
        return;
      }
    }

    if (target) {
      var oldVal = JSON.parse(JSON.stringify(target));
      dbUpdate('Students', 'student_id', target.student_id, {
        seq_no: seqNo,
        student_code: studentCode,
        citizen_id: citizenId,
        full_name: fullName,
        dob: dob,
        note: note
      });
      target.seq_no = seqNo;
      target.student_code = studentCode;
      target.citizen_id = citizenId;
      target.full_name = fullName;
      target.dob = dob;
      target.note = note;
      if (studentCode) byCode[studentCode] = target;
      if (citizenId) byCitizenId[citizenId] = target;
      appendAuditLog(session.user_id, 'Students', target.student_id, oldVal, { imported: true, action: 'update' });
      updated++;
    } else {
      var newId = studentId || generateId('student');
      var newStudent = {
        student_id: newId,
        class_id: class_id,
        seq_no: seqNo,
        student_code: studentCode,
        citizen_id: citizenId,
        full_name: fullName,
        dob: dob,
        note: note
      };
      dbInsert('Students', newStudent);
      byId[newId] = newStudent;
      if (studentCode) byCode[studentCode] = newStudent;
      if (citizenId) byCitizenId[citizenId] = newStudent;
      appendAuditLog(session.user_id, 'Students', newId, null, { imported: true, action: 'create', class_id: class_id });
      created++;
    }
  });

  return { ok: true, success_count: created + updated, created_count: created, updated_count: updated, warnings: warnings };
}

function classHasHomeroomTeacher(cls, userId) {
  var ids = typeof parseHomeroomTeacherIds === 'function'
    ? parseHomeroomTeacherIds(cls && cls.homeroom_teacher_user_ids, cls && cls.homeroom_teacher_user_id)
    : [String(cls && cls.homeroom_teacher_user_id || '').trim()];
  return ids.indexOf(String(userId || '').trim()) !== -1;
}
