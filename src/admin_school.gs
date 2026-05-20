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

// ── Subject Weights (US-010) ──────────────────────────────────────────────────

// Returns all subject weights joined with subject info for the admin/weights page.
function getWeightsList(token) {
  var session = getSession(token);
  if (!session || session.role !== 'admin') throw new Error('ไม่มีสิทธิ์');
  var subjects = dbGetAll('Subjects');
  var weights = dbGetAll('SubjectWeights');
  var weightMap = {};
  weights.forEach(function(w) { weightMap[w.subject_id] = w; });

  var result = subjects.map(function(s) {
    var w = weightMap[s.subject_id] || {};
    return {
      subject_id: s.subject_id,
      subject_name: s.subject_name,
      weight_group: s.weight_group,
      coursework_max: w.coursework_max !== undefined ? w.coursework_max : '',
      final_max: w.final_max !== undefined ? w.final_max : '',
      pre_mid_max: w.pre_mid_max !== undefined ? w.pre_mid_max : '',
      mid_max: w.mid_max !== undefined ? w.mid_max : '',
      post_mid_max: w.post_mid_max !== undefined ? w.post_mid_max : '',
      final_exam_max: w.final_exam_max !== undefined ? w.final_exam_max : ''
    };
  });
  return { weights: result };
}

// Saves (upserts) weight rows for all subjects.
// rows: array of { subject_id, pre_mid_max, mid_max, post_mid_max, final_exam_max, coursework_max, final_max }
// Server-side validates pre_mid + mid + post_mid + final_exam === 100 for each row.
function serverSaveWeights(token, rows) {
  var session = getSession(token);
  if (!session || session.role !== 'admin') throw new Error('ไม่มีสิทธิ์');
  if (!rows || rows.length === 0) return { ok: true };

  // Validate all rows before writing anything
  var errors = [];
  rows.forEach(function(r) {
    var total = Number(r.pre_mid_max) + Number(r.mid_max) + Number(r.post_mid_max) + Number(r.final_exam_max);
    if (total !== 100) errors.push(r.subject_id);
  });
  if (errors.length > 0) {
    return { error: 'รวมต้องเท่ากับ 100 — ' + errors.join(', ') };
  }

  var lock = LockService.getDocumentLock();
  if (!lock.tryLock(30000)) throw new Error('ไม่สามารถบันทึกได้ กรุณาลองใหม่');
  try {
    var sheet = getSheet('SubjectWeights');
    var data = sheet.getDataRange().getValues();
    var headers = data[0];
    var sidCol = headers.indexOf('subject_id');
    var cwCol = headers.indexOf('coursework_max');
    var fmCol = headers.indexOf('final_max');
    var pmCol = headers.indexOf('pre_mid_max');
    var midCol = headers.indexOf('mid_max');
    var postCol = headers.indexOf('post_mid_max');
    var feCol = headers.indexOf('final_exam_max');

    rows.forEach(function(r) {
      var found = false;
      for (var i = 1; i < data.length; i++) {
        if (data[i][sidCol] === r.subject_id) {
          sheet.getRange(i + 1, cwCol + 1).setValue(Number(r.coursework_max));
          sheet.getRange(i + 1, fmCol + 1).setValue(Number(r.final_max));
          sheet.getRange(i + 1, pmCol + 1).setValue(Number(r.pre_mid_max));
          sheet.getRange(i + 1, midCol + 1).setValue(Number(r.mid_max));
          sheet.getRange(i + 1, postCol + 1).setValue(Number(r.post_mid_max));
          sheet.getRange(i + 1, feCol + 1).setValue(Number(r.final_exam_max));
          data[i][cwCol] = Number(r.coursework_max);
          data[i][fmCol] = Number(r.final_max);
          data[i][pmCol] = Number(r.pre_mid_max);
          data[i][midCol] = Number(r.mid_max);
          data[i][postCol] = Number(r.post_mid_max);
          data[i][feCol] = Number(r.final_exam_max);
          found = true;
          break;
        }
      }
      if (!found) {
        var newRow = headers.map(function() { return ''; });
        newRow[sidCol] = r.subject_id;
        newRow[cwCol] = Number(r.coursework_max);
        newRow[fmCol] = Number(r.final_max);
        newRow[pmCol] = Number(r.pre_mid_max);
        newRow[midCol] = Number(r.mid_max);
        newRow[postCol] = Number(r.post_mid_max);
        newRow[feCol] = Number(r.final_exam_max);
        sheet.appendRow(newRow);
        data.push(newRow);
      }
    });
  } finally {
    lock.releaseLock();
  }

  appendAuditLog(session.user_id, 'SubjectWeights', 'all', null, { rows_saved: rows.length });
  return { ok: true };
}

// ── US-015: Read-only reference functions (any logged-in user) ────────────────

// Returns weights + subject info for the read-only /weights_ref page.
function getWeightsForRef(token) {
  var session = getSession(token);
  if (!session) throw new Error('กรุณาเข้าสู่ระบบ');
  var subjects = dbGetAll('Subjects');
  var weights = dbGetAll('SubjectWeights');
  var weightMap = {};
  weights.forEach(function(w) { weightMap[w.subject_id] = w; });
  var result = subjects.map(function(s) {
    var w = weightMap[s.subject_id] || {};
    return {
      subject_id: s.subject_id,
      subject_name: s.subject_name,
      weight_group: s.weight_group,
      coursework_max: w.coursework_max !== undefined ? w.coursework_max : '',
      final_max: w.final_max !== undefined ? w.final_max : '',
      pre_mid_max: w.pre_mid_max !== undefined ? w.pre_mid_max : '',
      mid_max: w.mid_max !== undefined ? w.mid_max : '',
      post_mid_max: w.post_mid_max !== undefined ? w.post_mid_max : '',
      final_exam_max: w.final_exam_max !== undefined ? w.final_exam_max : ''
    };
  });
  return { weights: result };
}

// Returns a single subject's data for the read-only /subject_description page.
function getSubjectDescription(token, subject_id) {
  var session = getSession(token);
  if (!session) throw new Error('กรุณาเข้าสู่ระบบ');
  var subject = dbFindOne('Subjects', 'subject_id', subject_id);
  if (!subject) return { error: 'ไม่พบวิชานี้' };
  return { subject: subject };
}

// Returns indicators for a subject for the read-only /subject_indicators_ref page.
function getSubjectIndicatorsRef(token, subject_id) {
  var session = getSession(token);
  if (!session) throw new Error('กรุณาเข้าสู่ระบบ');
  var indicators = dbFind('Indicators', 'subject_id', subject_id);
  indicators.sort(function(a, b) { return Number(a.display_order) - Number(b.display_order); });
  var subject = dbFindOne('Subjects', 'subject_id', subject_id);
  var subject_name = subject ? subject.subject_name : subject_id;
  return { indicators: indicators, subject_name: subject_name };
}
