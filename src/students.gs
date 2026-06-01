// US-005: Student roster CRUD

// Returns students for a class, ordered by seq_no.
// Access: admin OR homeroom teacher of the class.
function getStudentsList(token, class_id) {
  var session = getSession(token);
  if (!session) throw new Error('กรุณาเข้าสู่ระบบ');

  var cls = dbFindOne('Classes', 'class_id', class_id);
  if (!cls) throw new Error('ไม่พบชั้นเรียน: ' + class_id);

  var isAdmin = session.role === 'admin';
  var isHomeroom = String(cls.homeroom_teacher_user_id || '').trim() === session.user_id;

  var students = dbFind('Students', 'class_id', class_id);
  students.sort(function(a, b) {
    return Number(a.seq_no) - Number(b.seq_no);
  });

  return {
    students: sanitizeRows(students),
    class_info: sanitizeRow(cls),
    can_edit: isAdmin || isHomeroom
  };
}

// Convert any non-serializable values (Date, etc.) to strings so
// google.script.run can send the object to the client without dropping it.
function sanitizeRow(row) {
  if (!row) return row;
  var out = {};
  var THAI_MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  Object.keys(row).forEach(function(k) {
    var v = row[k];
    if (v instanceof Date) {
      if (isNaN(v.getTime())) {
        out[k] = '';
      } else {
        // Format as Thai short date: "04 ม.ค. 64"
        var d = v.getDate();
        var m = THAI_MONTHS[v.getMonth()];
        var fy = v.getFullYear();
        // If year < 2400, it's Gregorian -> add 543 to get BE
        var beYear = fy < 2400 ? fy + 543 : fy;
        var y = beYear % 100;
        out[k] = (d < 10 ? '0' + d : d) + ' ' + m + ' ' + (y < 10 ? '0' + y : y);
      }
    } else if (v === null || v === undefined) {
      out[k] = '';
    } else {
      out[k] = v;
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

  if (session.role !== 'admin' && String(cls.homeroom_teacher_user_id || '').trim() !== session.user_id) {
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
  if (session.role !== 'admin' && (!cls || String(cls.homeroom_teacher_user_id || '').trim() !== session.user_id)) {
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
  if (session.role !== 'admin' && (!cls || String(cls.homeroom_teacher_user_id || '').trim() !== session.user_id)) {
    throw new Error('ไม่มีสิทธิ์แก้ไขชั้นเรียนนี้');
  }

  appendAuditLog(session.user_id, 'Students', student_id, student, null);
  dbDelete('Students', 'student_id', student_id);
  return { ok: true };
}
