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
var STUDENT_DOB_THAI_MONTHS = {
  'ม.ค.': 1, 'มค': 1, 'มกราคม': 1,
  'ก.พ.': 2, 'กพ': 2, 'กุมภาพันธ์': 2,
  'มี.ค.': 3, 'มีค': 3, 'มีนาคม': 3,
  'เม.ย.': 4, 'เมย': 4, 'เมษายน': 4,
  'พ.ค.': 5, 'พค': 5, 'พฤษภาคม': 5,
  'มิ.ย.': 6, 'มิย': 6, 'มิถุนายน': 6,
  'ก.ค.': 7, 'กค': 7, 'กรกฎาคม': 7,
  'ส.ค.': 8, 'สค': 8, 'สิงหาคม': 8,
  'ก.ย.': 9, 'กย': 9, 'กันยายน': 9,
  'ต.ค.': 10, 'ตค': 10, 'ตุลาคม': 10,
  'พ.ย.': 11, 'พย': 11, 'พฤศจิกายน': 11,
  'ธ.ค.': 12, 'ธค': 12, 'ธันวาคม': 12
};

function padStudentDobPart(value) {
  value = Number(value);
  return value < 10 ? '0' + value : String(value);
}

function normalizeStudentDobYear(year) {
  year = Number(year);
  if (!year) return 0;
  if (year < 100) return 2500 + year - 543;
  return year > 2400 ? year - 543 : year;
}

function formatStudentDobISO(year, month, day) {
  year = Number(year);
  month = Number(month);
  day = Number(day);
  var date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return '';
  return year + '-' + padStudentDobPart(month) + '-' + padStudentDobPart(day);
}

function normalizeThaiMonthToken(value) {
  return String(value || '').replace(/\s+/g, '').replace(/[.]/g, '') || '';
}

function thaiMonthNumber(value) {
  var text = String(value || '').trim();
  return STUDENT_DOB_THAI_MONTHS[text] || STUDENT_DOB_THAI_MONTHS[normalizeThaiMonthToken(text)] || 0;
}

function normalizeStudentDobForStorage(value) {
  if (value === null || value === undefined || value === '') return { ok: true, value: '' };
  if (value instanceof Date && !isNaN(value.getTime())) {
    return { ok: true, value: Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd') };
  }

  var text = String(value || '').trim();
  if (!text) return { ok: true, value: '' };

  var ymd = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
  if (ymd) {
    var iso = formatStudentDobISO(ymd[1], ymd[2], ymd[3]);
    return iso ? { ok: true, value: iso } : { ok: false, value: '' };
  }

  var dmy = text.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (dmy) {
    var year = normalizeStudentDobYear(dmy[3]);
    var numericIso = formatStudentDobISO(year, dmy[2], dmy[1]);
    return numericIso ? { ok: true, value: numericIso } : { ok: false, value: '' };
  }

  var thai = text.match(/^(\d{1,2})\s*([^\d\s]+)\s*(\d{2,4})$/);
  if (thai) {
    var month = thaiMonthNumber(thai[2]);
    var thaiYear = normalizeStudentDobYear(thai[3]);
    var thaiIso = formatStudentDobISO(thaiYear, month, thai[1]);
    return thaiIso ? { ok: true, value: thaiIso } : { ok: false, value: '' };
  }

  return { ok: false, value: '' };
}

function sanitizeRow(row) {
  if (!row) return row;
  var out = {};
  function toDateInputValue(value) {
    if (value instanceof Date && !isNaN(value.getTime())) {
      return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    }
    var normalized = normalizeStudentDobForStorage(value);
    return normalized.ok ? normalized.value : '';
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

  var normalizedDob = normalizeStudentDobForStorage(dob);
  if (!normalizedDob.ok) throw new Error('รูปแบบวันเกิดไม่ถูกต้อง กรุณาใช้รูปแบบ yyyy-mm-dd เช่น 2017-01-01');

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
    dob: normalizedDob.value,
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

  var normalizedDob = dob !== undefined ? normalizeStudentDobForStorage(dob) : { ok: true, value: student.dob };
  if (!normalizedDob.ok) throw new Error('รูปแบบวันเกิดไม่ถูกต้อง กรุณาใช้รูปแบบ yyyy-mm-dd เช่น 2017-01-01');

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
  var updated = dbUpdate('Students', 'student_id', student_id, {
    seq_no: parseInt(seq_no) || student.seq_no,
    student_code: student_code !== undefined ? student_code : student.student_code,
    citizen_id: citizen_id !== undefined ? citizen_id : student.citizen_id,
    full_name: full_name !== undefined ? full_name : student.full_name,
    dob: dob !== undefined ? normalizedDob.value : student.dob,
    note: note !== undefined ? note : student.note
  });
  if (!updated) throw new Error('ไม่สามารถบันทึกข้อมูลนักเรียนได้');

  appendAuditLog(session.user_id, 'Students', student_id, oldVal, {
    seq_no: seq_no, student_code: student_code, full_name: full_name, dob: normalizedDob.value, note: note
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

    var normalizedDob = normalizeStudentDobForStorage(dob);
    if (!normalizedDob.ok) {
      warnings.push('แถวที่ ' + lineNum + ': ข้ามรายการเพราะรูปแบบวันเกิดไม่ถูกต้อง กรุณาใช้ yyyy-mm-dd เช่น 2017-01-01');
      return;
    }
    dob = normalizedDob.value;

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
