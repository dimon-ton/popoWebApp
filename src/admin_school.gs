// US-004: School info, classes, and subjects CRUD

// ── Pre-seed subject list (FR-7) ──────────────────────────────────────────────

var PRESEED_SUBJECTS = [
  { id: 'subj_thai',    name: 'ภาษาไทย',           code: 'T01', hours: 200, group: 1 },
  { id: 'subj_math',    name: 'คณิตศาสตร์',          code: 'T02', hours: 160, group: 1 },
  { id: 'subj_sci',     name: 'วิทยาศาสตร์',          code: 'T03', hours: 80,  group: 1 },
  { id: 'subj_soc',     name: 'สังคมศึกษา',           code: 'T04', hours: 80,  group: 1 },
  { id: 'subj_hist',    name: 'ประวัติศาสตร์',         code: 'T05', hours: 40,  group: 1 },
  { id: 'subj_eng',     name: 'ภาษาอังกฤษ',           code: 'T06', hours: 80,  group: 1 },
  { id: 'subj_art',     name: 'ศิลปะ',               code: 'T07', hours: 80,  group: 2 },
  { id: 'subj_pe',      name: 'สุขศึกษาพลศึกษา',      code: 'T08', hours: 80,  group: 2 },
  { id: 'subj_career',  name: 'การงานอาชีพ',          code: 'T09', hours: 40,  group: 2 },
  { id: 'subj_comp',    name: 'วิทยาการคำนวณ',        code: 'T10', hours: 40,  group: 2 },
  { id: 'subj_defense', name: 'การป้องกัน',           code: 'T11', hours: 40,  group: 2 }
];

var DEFAULT_WEIGHTS = {
  '1': { coursework_max: 70, final_max: 30, pre_mid_max: 25, mid_max: 20, post_mid_max: 25, final_exam_max: 30 },
  '2': { coursework_max: 80, final_max: 20, pre_mid_max: 30, mid_max: 20, post_mid_max: 30, final_exam_max: 20 }
};

function preseedSubjects() {
  var existing = dbGetAll('Subjects');
  var existingIds = existing.map(function(s) { return s.subject_id; });
  var existingWeights = dbGetAll('SubjectWeights');
  var existingWeightIds = existingWeights.map(function(w) { return w.subject_id; });

  PRESEED_SUBJECTS.forEach(function(s) {
    if (existingIds.indexOf(s.id) === -1) {
      dbInsert('Subjects', {
        subject_id: s.id,
        subject_name: s.name,
        subject_code: s.code,
        hours_per_year: s.hours,
        weight_group: s.group,
        description: ''
      });
    }
    if (existingWeightIds.indexOf(s.id) === -1) {
      var w = DEFAULT_WEIGHTS[String(s.group)];
      dbInsert('SubjectWeights', {
        subject_id: s.id,
        coursework_max: w.coursework_max,
        final_max: w.final_max,
        pre_mid_max: w.pre_mid_max,
        mid_max: w.mid_max,
        post_mid_max: w.post_mid_max,
        final_exam_max: w.final_exam_max
      });
    }
  });
  return { ok: true };
}

// ── School Info ───────────────────────────────────────────────────────────────

function getSchoolInfo() {
  var rows = dbGetAll('SchoolInfo');
  return rows.length > 0 ? rows[0] : {
    school_name: '', district: '', province: '', academic_year: ''
  };
}

function serverSaveSchoolInfo(token, school_name, district, province, academic_year) {
  var session = getSession(token);
  if (!session || session.role !== 'admin') throw new Error('ไม่มีสิทธิ์');

  // SchoolInfo always has at most one data row (row 2); overwrite it directly.
  var lock = LockService.getDocumentLock();
  if (!lock.tryLock(30000)) throw new Error('Could not acquire lock');
  try {
    var sheet = getSheet('SchoolInfo');
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var values = [school_name, district, province, academic_year].slice(0, headers.length);
    // Pad to header count
    while (values.length < headers.length) values.push('');
    if (sheet.getLastRow() >= 2) {
      sheet.getRange(2, 1, 1, headers.length).setValues([values]);
    } else {
      sheet.appendRow(values);
    }
  } finally {
    lock.releaseLock();
  }
  return { ok: true };
}

// ── Classes ───────────────────────────────────────────────────────────────────

function getClassesList(token) {
  var session = getSession(token);
  if (!session || session.role !== 'admin') throw new Error('ไม่มีสิทธิ์');
  return { classes: dbGetAll('Classes') };
}

function serverAddClass(token, class_id, level, section, homeroom_teacher_user_id) {
  var session = getSession(token);
  if (!session || session.role !== 'admin') throw new Error('ไม่มีสิทธิ์');
  if (!class_id) throw new Error('class_id is required');
  var existing = dbFindOne('Classes', 'class_id', class_id);
  if (existing) throw new Error('class_id นี้มีอยู่แล้ว');
  dbInsert('Classes', {
    class_id: class_id,
    level: level || '',
    section: section || '',
    homeroom_teacher_user_id: homeroom_teacher_user_id || ''
  });
  return { ok: true, class_id: class_id };
}

function serverUpdateClass(token, class_id, level, section, homeroom_teacher_user_id) {
  var session = getSession(token);
  if (!session || session.role !== 'admin') throw new Error('ไม่มีสิทธิ์');
  dbUpdate('Classes', 'class_id', class_id, {
    level: level,
    section: section,
    homeroom_teacher_user_id: homeroom_teacher_user_id || ''
  });
  return { ok: true };
}

function serverDeleteClass(token, class_id) {
  var session = getSession(token);
  if (!session || session.role !== 'admin') throw new Error('ไม่มีสิทธิ์');
  dbDelete('Classes', 'class_id', class_id);
  return { ok: true };
}

// ── Subjects ──────────────────────────────────────────────────────────────────

function getSubjectsList(token) {
  var session = getSession(token);
  if (!session || session.role !== 'admin') throw new Error('ไม่มีสิทธิ์');
  return { subjects: dbGetAll('Subjects') };
}

function serverAddSubject(token, subject_id, subject_name, subject_code, hours_per_year, weight_group, description) {
  var session = getSession(token);
  if (!session || session.role !== 'admin') throw new Error('ไม่มีสิทธิ์');
  if (!subject_id) throw new Error('subject_id is required');
  var existing = dbFindOne('Subjects', 'subject_id', subject_id);
  if (existing) throw new Error('subject_id นี้มีอยู่แล้ว');
  var grp = parseInt(weight_group) || 1;
  dbInsert('Subjects', {
    subject_id: subject_id,
    subject_name: subject_name || '',
    subject_code: subject_code || '',
    hours_per_year: parseInt(hours_per_year) || 0,
    weight_group: grp,
    description: description || ''
  });
  // Auto-seed SubjectWeights for this subject
  var existingWeight = dbFindOne('SubjectWeights', 'subject_id', subject_id);
  if (!existingWeight) {
    var w = DEFAULT_WEIGHTS[String(grp)] || DEFAULT_WEIGHTS['1'];
    dbInsert('SubjectWeights', {
      subject_id: subject_id,
      coursework_max: w.coursework_max,
      final_max: w.final_max,
      pre_mid_max: w.pre_mid_max,
      mid_max: w.mid_max,
      post_mid_max: w.post_mid_max,
      final_exam_max: w.final_exam_max
    });
  }
  return { ok: true, subject_id: subject_id };
}

function serverUpdateSubject(token, subject_id, subject_name, subject_code, hours_per_year, weight_group, description) {
  var session = getSession(token);
  if (!session || session.role !== 'admin') throw new Error('ไม่มีสิทธิ์');
  dbUpdate('Subjects', 'subject_id', subject_id, {
    subject_name: subject_name,
    subject_code: subject_code,
    hours_per_year: parseInt(hours_per_year) || 0,
    weight_group: parseInt(weight_group) || 1,
    description: description || ''
  });
  return { ok: true };
}

function serverDeleteSubject(token, subject_id) {
  var session = getSession(token);
  if (!session || session.role !== 'admin') throw new Error('ไม่มีสิทธิ์');
  dbDelete('Subjects', 'subject_id', subject_id);
  return { ok: true };
}

function getTeachersList(token) {
  var session = getSession(token);
  if (!session || session.role !== 'admin') throw new Error('ไม่มีสิทธิ์');
  var users = dbGetAll('Users');
  return { teachers: users.filter(function(u) { return u.role === 'teacher'; }) };
}
