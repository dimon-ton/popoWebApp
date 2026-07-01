// US-004: School info, classes, and subjects CRUD

var DEFAULT_WEIGHTS = {
  '1': { coursework_max: 70, final_max: 30, pre_mid_max: 25, mid_max: 20, post_mid_max: 25, final_exam_max: 30 },
  '2': { coursework_max: 80, final_max: 20, pre_mid_max: 30, mid_max: 20, post_mid_max: 30, final_exam_max: 20 }
};

// ── School Info ───────────────────────────────────────────────────────────────

function getSchoolInfo() {
  ensureColumns('SchoolInfo', ['semester_start_date', 'required_attendance_days']);
  var sheet = getSheet('SchoolInfo');
  if (sheet.getLastRow() < 2) {
    return {
      school_name: '', district: '', province: '', academic_year: '', semester_start_date: '', required_attendance_days: ''
    };
  }
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var values = sheet.getRange(2, 1, 1, headers.length).getValues()[0];
  var info = {};
  headers.forEach(function(header, index) {
    info[header] = values[index];
  });
  if (!Object.keys(info).length) {
    info = {
    school_name: '', district: '', province: '', academic_year: '', semester_start_date: '', required_attendance_days: ''
    };
  }
  info.semester_start_date = normalizeSchoolDateValue(info.semester_start_date);
  return info;
}

function serverSaveSchoolInfo(token, school_name, district, province, academic_year, semester_start_date, required_attendance_days) {
  var session = getSession(token);
  if (!session || session.role !== 'admin') throw new Error('ไม่มีสิทธิ์');
  ensureColumns('SchoolInfo', ['semester_start_date', 'required_attendance_days']);
  var normalizedStartDate = normalizeSchoolDateValue(semester_start_date);
  if (semester_start_date && !normalizedStartDate) throw new Error('รูปแบบวันเปิดภาคเรียนไม่ถูกต้อง');
  var attendanceDays = required_attendance_days === '' ? '' : parseInt(required_attendance_days, 10);
  if (attendanceDays !== '' && (!isFinite(attendanceDays) || attendanceDays < 1 || attendanceDays > 260)) {
    throw new Error('จำนวนวันเรียนต้องอยู่ระหว่าง 1 ถึง 260');
  }

  // SchoolInfo always has at most one data row (row 2); overwrite it directly.
  var lock = LockService.getDocumentLock();
  if (!lock.tryLock(30000)) throw new Error('Could not acquire lock');
  try {
    var sheet = getSheet('SchoolInfo');
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var rowObj = {
      school_name: school_name,
      district: district,
      province: province,
      academic_year: academic_year,
      semester_start_date: normalizedStartDate,
      required_attendance_days: attendanceDays
    };
    var values = headers.map(function(h) { return rowObj[h] !== undefined ? rowObj[h] : ''; });
    // Pad to header count
    while (values.length < headers.length) values.push('');
    if (sheet.getLastRow() >= 2) {
      sheet.getRange(2, 1, 1, headers.length).setValues([values]);
    } else {
      sheet.appendRow(values);
    }
    var startDateCol = headers.indexOf('semester_start_date');
    if (startDateCol !== -1) {
      var startDateCell = sheet.getRange(2, startDateCol + 1);
      startDateCell.setNumberFormat('@');
      startDateCell.setValue(normalizedStartDate);
    }
  } finally {
    lock.releaseLock();
  }
  try { CacheService.getScriptCache().remove('school_name'); } catch(e) {}
  return { ok: true };
}

function normalizeSchoolDateValue(value) {
  if (!value) return '';
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone() || 'Asia/Bangkok', 'yyyy-MM-dd');
  }
  var s = String(value).trim();
  var match = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return '';
  var year = Number(match[1]);
  var month = Number(match[2]);
  var day = Number(match[3]);
  var date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return '';
  return match[1] + '-' + match[2] + '-' + match[3];
}

// ── Classes ───────────────────────────────────────────────────────────────────

function generateClassId(level, section) {
  return 'class_' + String(level || '').replace(/[\.\s]/g, '') + '_' + String(section || '').replace(/[\.\s]/g, '');
}

function getClassesList(token) {
  var session = getSession(token);
  if (!session || session.role !== 'admin') throw new Error('ไม่มีสิทธิ์');
  return { classes: sortClassRows(withClassLabels(dbGetAll('Classes'))) };
}

function serverAddClass(token, class_id, level, section, homeroom_teacher_user_id) {
  var session = getSession(token);
  if (!session || session.role !== 'admin') throw new Error('ไม่มีสิทธิ์');
  if (!level || !section) throw new Error('กรุณาระบุระดับชั้นและห้อง');
  var autoId = generateClassId(level, section);
  var existing = dbFindOne('Classes', 'class_id', autoId);
  if (existing) throw new Error('ชั้นเรียน ' + fmtClassLabel(level, section) + ' มีอยู่แล้ว');
  dbInsert('Classes', {
    class_id: autoId,
    level: level,
    section: section,
    homeroom_teacher_user_id: (homeroom_teacher_user_id || '').trim()
  });
  return { ok: true, class_id: autoId };
}

function serverUpdateClass(token, class_id, level, section, homeroom_teacher_user_id) {
  var session = getSession(token);
  if (!session || session.role !== 'admin') throw new Error('ไม่มีสิทธิ์');
  dbUpdate('Classes', 'class_id', class_id, {
    level: level,
    section: section,
    homeroom_teacher_user_id: (homeroom_teacher_user_id || '').trim()
  });
  return { ok: true };
}

function serverDeleteClass(token, class_id) {
  var session = getSession(token);
  if (!session || session.role !== 'admin') throw new Error('ไม่มีสิทธิ์');
  dbDelete('Classes', 'class_id', class_id);
  return { ok: true };
}

function serverImportClassesCSV(token, rows) {
  var session = getSession(token);
  if (!session || session.role !== 'admin') throw new Error('ไม่มีสิทธิ์');

  var users = dbGetAll('Users');
  var usersById = {};
  var usersByFullname = {};
  users.forEach(function(u) {
    if (u.user_id) usersById[String(u.user_id).trim()] = u;
    var fname = String(u.full_name || '').trim();
    if (fname) {
      if (!usersByFullname[fname]) {
        usersByFullname[fname] = u;
      } else {
        usersByFullname[fname] = '__DUPLICATE__';
      }
    }
  });

  var classes = dbGetAll('Classes');
  var byId = {};
  classes.forEach(function(c) { if (c.class_id) byId[String(c.class_id).trim()] = c; });

  var created = 0;
  var updated = 0;
  var warnings = [];

  (rows || []).forEach(function(row, idx) {
    var lineNum = idx + 1;
    var level = String(row.level || '').trim();
    var section = String(row.section || '').trim();
    var classId = String(row.class_id || '').trim();
    var teacherFullname = String(row.homeroom_teacher_fullname || '').trim();

    if (!level || !section) {
      warnings.push('แถวที่ ' + lineNum + ': ข้ามรายการเพราะไม่ได้ระบุระดับชั้นหรือห้อง');
      return;
    }
    if (!classId) classId = generateClassId(level, section);

    var teacherId = '';
    if (teacherFullname) {
      var matched = usersByFullname[teacherFullname];
      if (!matched) {
        warnings.push('แถวที่ ' + lineNum + ': ไม่พบชื่อครู "' + teacherFullname + '" ในระบบ จึงเว้นว่าง');
      } else if (matched === '__DUPLICATE__') {
        warnings.push('แถวที่ ' + lineNum + ': พบชื่อครู "' + teacherFullname + '" ซ้ำหลายคน กรุณาระบุให้ชัดเจน จึงเว้นว่าง');
      } else {
        teacherId = matched.user_id;
      }
    }

    if (byId[classId]) {
      var oldVal = JSON.parse(JSON.stringify(byId[classId]));
      dbUpdate('Classes', 'class_id', classId, {
        level: level,
        section: section,
        homeroom_teacher_user_id: teacherId
      });
      byId[classId].level = level;
      byId[classId].section = section;
      byId[classId].homeroom_teacher_user_id = teacherId;
      appendAuditLog(session.user_id, 'Classes', classId, oldVal, { imported: true, action: 'update' });
      updated++;
    } else {
      var newClass = {
        class_id: classId,
        level: level,
        section: section,
        homeroom_teacher_user_id: teacherId
      };
      dbInsert('Classes', newClass);
      byId[classId] = newClass;
      appendAuditLog(session.user_id, 'Classes', classId, null, { imported: true, action: 'create' });
      created++;
    }
  });

  return { ok: true, success_count: created + updated, created_count: created, updated_count: updated, warnings: warnings };
}

// ── Subjects ──────────────────────────────────────────────────────────────────

function ensureSubjectsSchema() {
  ensureColumns('Subjects', ['class_id', 'subject_group']);
  removeColumns('Subjects', ['description']);
}

function getSubjectsList(token) {
  var session = getSession(token);
  if (!session) throw new Error('ไม่มีสิทธิ์');
  ensureSubjectsSchema();
  var classes = dbGetAll('Classes');
  var levelCounts = buildClassLevelCounts(classes);
  var classesById = {};
  classes.forEach(function(c) {
    classesById[c.class_id] = c;
  });
  var subjects = dbGetAll('Subjects');
  if (session.role !== 'admin') {
    var enrollments = dbGetAll('Enrollments').filter(function(e) {
      return e.teacher_user_id === session.user_id;
    });
    var enrolledSubjectIds = enrollments.map(function(e) { return e.subject_id; });
    subjects = subjects.filter(function(s) {
      return enrolledSubjectIds.indexOf(s.subject_id) !== -1;
    });
  }
  subjects = subjects.map(function(s) {
    var cls = classesById[s.class_id] || null;
    s.class_label = cls ? fmtClassLabelWithCounts(cls.level, cls.section, levelCounts) : '';
    return s;
  });
  return { subjects: subjects };
}

function generateSubjectId(subject_code, subject_name) {
  var str = (subject_code || subject_name || '').trim().toLowerCase();
  var mapped = '';
  var thaiToAscii = {
    'ก':'g', 'ข':'k', 'ค':'k', 'ฆ':'k',
    'ง':'ng', 'จ':'j', 'ฉ':'ch', 'ช':'ch', 'ซ':'s', 'ฌ':'ch',
    'ญ':'y', 'ฎ':'d', 'ฏ':'t', 'ฐ':'th', 'ฑ':'th', 'ฒ':'th',
    'ณ':'n', 'ด':'d', 'ต':'t', 'ถ':'th', 'ท':'t', 'ธ':'t',
    'น':'n', 'บ':'b', 'ป':'p', 'ผ':'ph', 'ฝ':'f', 'พ':'p',
    'ฟ':'f', 'ภ':'p', 'ม':'m', 'ย':'y', 'ร':'r', 'ล':'l',
    'ว':'w', 'ศ':'s', 'ษ':'s', 'ส':'s', 'ห':'h', 'ฬ':'l',
    'อ':'a', 'ฮ':'h',
    'ะ':'a', 'า':'a', 'ิ':'i', 'ี':'i', 'ึ':'ue', 'ื':'ue',
    'ุ':'u', 'ู':'u', 'เ':'e', 'แ':'ae', 'โ':'o', 'ใ':'ai', 'ไ':'ai'
  };
  for (var i = 0; i < str.length; i++) {
    var char = str.charAt(i);
    if (/[a-z0-9_-]/.test(char)) {
      mapped += char;
    } else if (thaiToAscii[char]) {
      mapped += thaiToAscii[char];
    }
  }
  mapped = mapped.replace(/[^a-z0-9_]/g, '');
  if (!mapped) {
    mapped = 'subject_' + Math.random().toString(36).substring(2, 8);
  }
  return 'subj_' + mapped;
}

function normalizeClassIdSuffix(class_id) {
  return String(class_id || '').trim().toLowerCase().replace(/^class_/, '').replace(/^test_class_/, 'test_').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function generateClassSubjectId(subject_code, subject_name, class_id) {
  var base = generateSubjectId(subject_code, subject_name);
  var suffix = normalizeClassIdSuffix(class_id);
  return suffix ? base + '_' + suffix : base;
}

function insertSubjectWeightsIfMissing(subject_id, group) {
  ensureColumns('SubjectWeights', ['class_id']);
  var subject = dbFindOne('Subjects', 'subject_id', subject_id);
  var existingWeight = dbFindOne('SubjectWeights', 'subject_id', subject_id);
  if (existingWeight) return;
  var w = DEFAULT_WEIGHTS[String(group)] || DEFAULT_WEIGHTS['1'];
  dbInsert('SubjectWeights', {
    subject_id: subject_id,
    class_id: subject ? (subject.class_id || '') : '',
    coursework_max: w.coursework_max,
    final_max: w.final_max,
    pre_mid_max: w.pre_mid_max,
    mid_max: w.mid_max,
    post_mid_max: w.post_mid_max,
    final_exam_max: w.final_exam_max
  });
}

function serverAddSubject(token, subject_id, subject_name, subject_code, hours_per_year, weight_group, class_ids, subject_group) {
  var session = getSession(token);
  if (!session || session.role !== 'admin') throw new Error('ไม่มีสิทธิ์');
  ensureSubjectsSchema();

  var classIdList = String(class_ids || '').split(',').map(function(id) { return id.trim(); }).filter(Boolean);
  if (!subject_name) throw new Error('Missing subject_name');
  if (classIdList.length === 0 && !subject_id) throw new Error('กรุณาเลือกชั้นเรียนอย่างน้อย 1 รายการ');

  var grp = parseInt(weight_group) || 1;

  if (classIdList.length === 0) {
    classIdList = [''];
  }

  var createdIds = [];
  classIdList.forEach(function(classId, index) {
    var newSubjectId = subject_id && index === 0 ? subject_id : generateClassSubjectId(subject_code, subject_name, classId);
    var existing = dbFindOne('Subjects', 'subject_id', newSubjectId);
    if (existing) {
      newSubjectId += '_' + Math.random().toString(36).substring(2, 5);
      existing = dbFindOne('Subjects', 'subject_id', newSubjectId);
      if (existing) throw new Error('เกิดข้อผิดพลาดในการสร้าง subject_id กรุณาลองใหม่');
    }
    dbInsert('Subjects', {
      subject_id: newSubjectId,
      class_id: classId,
      subject_name: subject_name || '',
      subject_code: subject_code || '',
      hours_per_year: parseInt(hours_per_year) || 0,
      weight_group: grp,
      subject_group: subject_group || ''
    });
    insertSubjectWeightsIfMissing(newSubjectId, grp);
    createdIds.push(newSubjectId);
  });

  return { ok: true, subject_id: createdIds[0], subject_ids: createdIds };
}

function serverUpdateSubject(token, subject_id, subject_name, subject_code, hours_per_year, weight_group, subject_group) {
  var session = getSession(token);
  if (!session || session.role !== 'admin') throw new Error('ไม่มีสิทธิ์');
  ensureSubjectsSchema();
  
  var oldSubject = dbFindOne('Subjects', 'subject_id', subject_id);
  var oldGroup = oldSubject ? oldSubject.weight_group : null;
  
  var newGroup = parseInt(weight_group) || 1;
  dbUpdate('Subjects', 'subject_id', subject_id, {
    subject_name: subject_name,
    subject_code: subject_code,
    hours_per_year: parseInt(hours_per_year) || 0,
    weight_group: newGroup,
    subject_group: subject_group || ''
  });
  
  // If weight group changed, also sync SubjectWeights
  if (oldGroup !== null && parseInt(oldGroup) !== newGroup) {
    var w = DEFAULT_WEIGHTS[String(newGroup)] || DEFAULT_WEIGHTS['1'];
    var existingWeight = dbFindOne('SubjectWeights', 'subject_id', subject_id);
    if (existingWeight) {
      dbUpdate('SubjectWeights', 'subject_id', subject_id, {
        coursework_max: w.coursework_max,
        final_max: w.final_max,
        pre_mid_max: w.pre_mid_max,
        mid_max: w.mid_max,
        post_mid_max: w.post_mid_max,
        final_exam_max: w.final_exam_max
      });
    }
  }
  
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
  return { teachers: users };
}

// ── Subject Weights (US-010) ──────────────────────────────────────────────────

// Returns all subject weights joined with subject info for the admin/weights page.
function getWeightsList(token) {
  var session = getSession(token);
  if (!session || session.role !== 'admin') throw new Error('ไม่มีสิทธิ์');
  ensureColumns('SubjectWeights', ['class_id']);
  var subjects = dbGetAll('Subjects');
  var classes = {};
  dbGetAll('Classes').forEach(function(c) { classes[c.class_id] = c; });
  var weights = dbGetAll('SubjectWeights');
  var weightMap = {};
  weights.forEach(function(w) { weightMap[w.subject_id] = w; });

  var result = subjects.map(function(s) {
    var w = weightMap[s.subject_id] || {};
    var cls = classes[s.class_id] || {};
    var classLabel = cls.class_id ? fmtClassLabel(cls.level, cls.section) : '';
    return {
      subject_id: s.subject_id,
      class_id: s.class_id || w.class_id || '',
      class_label: classLabel,
      grade_level: cls.level || '',
      subject_name: s.subject_name,
      subject_code: s.subject_code || '',
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

  ensureColumns('SubjectWeights', ['class_id']);
  var lock = LockService.getDocumentLock();
  if (!lock.tryLock(30000)) throw new Error('ไม่สามารถบันทึกได้ กรุณาลองใหม่');
  try {
    var subjectMap = {};
    dbGetAll('Subjects').forEach(function(s) { subjectMap[s.subject_id] = s; });
    var sheet = getSheet('SubjectWeights');
    var data = sheet.getDataRange().getValues();
    var headers = data[0];
    var sidCol = headers.indexOf('subject_id');
    var clsCol = headers.indexOf('class_id');
    var cwCol = headers.indexOf('coursework_max');
    var fmCol = headers.indexOf('final_max');
    var pmCol = headers.indexOf('pre_mid_max');
    var midCol = headers.indexOf('mid_max');
    var postCol = headers.indexOf('post_mid_max');
    var feCol = headers.indexOf('final_exam_max');

    rows.forEach(function(r) {
      var found = false;
      var classId = (subjectMap[r.subject_id] && subjectMap[r.subject_id].class_id) || r.class_id || '';
      for (var i = 1; i < data.length; i++) {
        if (data[i][sidCol] === r.subject_id) {
          if (clsCol !== -1) {
            sheet.getRange(i + 1, clsCol + 1).setValue(classId);
            data[i][clsCol] = classId;
          }
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
        if (clsCol !== -1) newRow[clsCol] = classId;
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
  ensureColumns('SubjectWeights', ['class_id']);
  var subjects = dbGetAll('Subjects');
  var classes = {};
  dbGetAll('Classes').forEach(function(c) { classes[c.class_id] = c; });
  var weights = dbGetAll('SubjectWeights');
  var weightMap = {};
  weights.forEach(function(w) { weightMap[w.subject_id] = w; });
  var result = subjects.map(function(s) {
    var w = weightMap[s.subject_id] || {};
    var cls = classes[s.class_id] || {};
    var classLabel = cls.class_id ? fmtClassLabel(cls.level, cls.section) : '';
    return {
      subject_id: s.subject_id,
      class_id: s.class_id || w.class_id || '',
      class_label: classLabel,
      subject_name: s.subject_name,
      subject_code: s.subject_code || '',
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

function serverImportSubjectsCSV(token, rows) {
  var session = getSession(token);
  if (!session || session.role !== 'admin') throw new Error('ไม่มีสิทธิ์');
  ensureSubjectsSchema();

  var successCount = 0;
  var createdCount = 0;
  var updatedCount = 0;
  var warningMessages = [];
  var auditRows = [];

  // Process rows inside a transaction/lock
  var lock = LockService.getDocumentLock();
  if (!lock.tryLock(30000)) throw new Error('ไม่สามารถล็อกระบบฐานข้อมูลได้ กรุณาลองใหม่ภายหลัง');

  try {
    var subjectSheet = getSheet('Subjects');
    var subjectData = subjectSheet.getDataRange().getValues();
    var subjectHeaders = subjectData[0];
    var subjectIdCol = subjectHeaders.indexOf('subject_id');
    var classIdCol = subjectHeaders.indexOf('class_id');
    var subjectNameCol = subjectHeaders.indexOf('subject_name');
    var subjectCodeCol = subjectHeaders.indexOf('subject_code');
    var hoursCol = subjectHeaders.indexOf('hours_per_year');
    var groupCol = subjectHeaders.indexOf('weight_group');
    var subjectGroupCol = subjectHeaders.indexOf('subject_group');

    var weightsSheet = getSheet('SubjectWeights');
    var weightsData = weightsSheet.getDataRange().getValues();
    var weightsHeaders = weightsData[0];
    var weightsSubjectIdCol = weightsHeaders.indexOf('subject_id');
    var courseworkCol = weightsHeaders.indexOf('coursework_max');
    var finalMaxCol = weightsHeaders.indexOf('final_max');
    var preMidCol = weightsHeaders.indexOf('pre_mid_max');
    var midMaxCol = weightsHeaders.indexOf('mid_max');
    var postMidCol = weightsHeaders.indexOf('post_mid_max');
    var finalExamCol = weightsHeaders.indexOf('final_exam_max');

    var subjectsById = {};
    var subjectsByCodeAndClass = {};
    for (var s = 1; s < subjectData.length; s++) {
      var existingId = String(subjectData[s][subjectIdCol] || '');
      var existingCode = String(subjectData[s][subjectCodeCol] || '').trim();
      var existingClassId = classIdCol !== -1 ? String(subjectData[s][classIdCol] || '').trim() : '';
      if (existingId) subjectsById[existingId] = { rowIndex: s + 1, row: subjectData[s] };
      if (existingCode && existingClassId) subjectsByCodeAndClass[existingCode + '|' + existingClassId] = { rowIndex: s + 1, row: subjectData[s] };
    }

    var weightsBySubjectId = {};
    for (var wIdx = 1; wIdx < weightsData.length; wIdx++) {
      var weightSubjectId = String(weightsData[wIdx][weightsSubjectIdCol] || '');
      if (weightSubjectId) weightsBySubjectId[weightSubjectId] = { rowIndex: wIdx + 1, row: weightsData[wIdx] };
    }

    var classesById = {};
    var classesByLevelSection = {};
    dbGetAll('Classes').forEach(function(c) {
      if (c.class_id) classesById[String(c.class_id).trim()] = c;
      classesByLevelSection[String(c.level || '').trim() + '|' + String(c.section || '').trim()] = c;
    });

    function makeSubjectRow(subjectId, classId, name, code, hours, group, subjectGroup) {
      var row = subjectHeaders.map(function() { return ''; });
      row[subjectIdCol] = subjectId;
      if (classIdCol !== -1) row[classIdCol] = classId;
      row[subjectNameCol] = name;
      row[subjectCodeCol] = code;
      row[hoursCol] = hours;
      row[groupCol] = group;
      if (subjectGroupCol !== -1) row[subjectGroupCol] = subjectGroup;
      return row;
    }

    function getImportWeights(row, group, lineNum) {
      var hasAny = row.pre_mid_max !== '' || row.mid_max !== '' || row.post_mid_max !== '' || row.final_exam_max !== '';
      if (!hasAny) return null;
      var pre = parseInt(row.pre_mid_max, 10) || 0;
      var mid = parseInt(row.mid_max, 10) || 0;
      var post = parseInt(row.post_mid_max, 10) || 0;
      var finalExam = parseInt(row.final_exam_max, 10) || 0;
      if (pre + mid + post + finalExam !== 100) {
        warningMessages.push('แถวที่ ' + lineNum + ': ข้ามค่าน้ำหนักคะแนนเพราะรวมไม่เท่ากับ 100');
        return null;
      }
      return {
        coursework_max: pre + mid + post,
        final_max: finalExam,
        pre_mid_max: pre,
        mid_max: mid,
        post_mid_max: post,
        final_exam_max: finalExam
      };
    }

    function ensureSubjectWeights(subjectId, group, importWeights) {
      var values = importWeights || (DEFAULT_WEIGHTS[String(group)] || DEFAULT_WEIGHTS['1']);
      var existingWeight = weightsBySubjectId[subjectId];
      if (existingWeight) {
        if (!importWeights) return;
        weightsSheet.getRange(existingWeight.rowIndex, courseworkCol + 1).setValue(values.coursework_max);
        weightsSheet.getRange(existingWeight.rowIndex, finalMaxCol + 1).setValue(values.final_max);
        weightsSheet.getRange(existingWeight.rowIndex, preMidCol + 1).setValue(values.pre_mid_max);
        weightsSheet.getRange(existingWeight.rowIndex, midMaxCol + 1).setValue(values.mid_max);
        weightsSheet.getRange(existingWeight.rowIndex, postMidCol + 1).setValue(values.post_mid_max);
        weightsSheet.getRange(existingWeight.rowIndex, finalExamCol + 1).setValue(values.final_exam_max);
        return;
      }
      var weightRow = weightsHeaders.map(function() { return ''; });
      weightRow[weightsSubjectIdCol] = subjectId;
      weightRow[courseworkCol] = values.coursework_max;
      weightRow[finalMaxCol] = values.final_max;
      weightRow[preMidCol] = values.pre_mid_max;
      weightRow[midMaxCol] = values.mid_max;
      weightRow[postMidCol] = values.post_mid_max;
      weightRow[finalExamCol] = values.final_exam_max;
      weightsSheet.appendRow(weightRow);
      weightsBySubjectId[subjectId] = { rowIndex: weightsSheet.getLastRow(), row: weightRow };
    }

    function ensureImportClass(classId, level, section, lineNum) {
      classId = String(classId || '').trim();
      level = String(level || '').trim();
      section = String(section || '').trim();
      if (!classId && (!level || !section)) {
        warningMessages.push('แถวที่ ' + lineNum + ': ข้ามรายการเพราะไม่ได้ระบุชั้นเรียนหรือห้อง');
        return '';
      }
      if (!classId) {
        classId = generateClassId(level, section);
      }
      if (!classesById[classId]) {
        if (!level || !section) {
          warningMessages.push('แถวที่ ' + lineNum + ': ไม่พบ class_id และไม่มีระดับชั้น/ห้องให้สร้างอัตโนมัติ');
          return '';
        }
        var existingByLabel = classesByLevelSection[level + '|' + section];
        if (existingByLabel) {
          classesById[existingByLabel.class_id] = existingByLabel;
          return existingByLabel.class_id;
        }
        var newClass = {
          class_id: classId,
          level: level,
          section: section,
          homeroom_teacher_user_id: ''
        };
        dbInsert('Classes', newClass);
        classesById[classId] = newClass;
        classesByLevelSection[level + '|' + section] = newClass;
        appendAuditLog(session.user_id, 'Classes', classId, null, { imported: true, action: 'create_from_subject_import' });
      }
      return classId;
    }

    rows.forEach(function(row, idx) {
      var lineNum = idx + 1;
      var subjectId = (row.subject_id || '').trim();
      var classId = (row.class_id || '').trim();
      var classLevel = (row.class_level || row.level || '').trim();
      var classSection = (row.class_section || row.section || '').trim();
      var code = (row.subject_code || '').trim();
      var name = (row.subject_name || '').trim();
      var subjectGroup = (row.subject_group || '').trim();
      var hoursStr = (row.hours || '').trim();
      var hours = parseInt(hoursStr) || 0;
      var group = parseInt(row.weight_group, 10) || 1;
      var importWeights = getImportWeights(row, group, lineNum);

      if (!name) {
        warningMessages.push('แถวที่ ' + lineNum + ': ข้ามรายการเพราะไม่ได้ระบุชื่อวิชา');
        return;
      }
      classId = ensureImportClass(classId, classLevel, classSection, lineNum);
      if (!classId) {
        return;
      }

      if (group < 1) {
        group = 1;
      }

      var existing = null;
      if (subjectId && subjectsById[subjectId]) {
        existing = subjectsById[subjectId];
      } else if (!subjectId && code && subjectsByCodeAndClass[code + '|' + classId]) {
        existing = subjectsByCodeAndClass[code + '|' + classId];
        subjectId = String(existing.row[subjectIdCol] || '');
      }

      if (!subjectId) {
        subjectId = generateClassSubjectId(code, name, classId);
      }

      if (!existing && subjectsById[subjectId]) {
        existing = subjectsById[subjectId];
      }

      if (existing) {
        var oldValue = {
          subject_name: existing.row[subjectNameCol],
          class_id: classIdCol !== -1 ? existing.row[classIdCol] : '',
          subject_code: existing.row[subjectCodeCol],
          hours_per_year: existing.row[hoursCol],
          weight_group: existing.row[groupCol],
          subject_group: subjectGroupCol !== -1 ? existing.row[subjectGroupCol] : ''
        };
        if (classIdCol !== -1) subjectSheet.getRange(existing.rowIndex, classIdCol + 1).setValue(classId);
        subjectSheet.getRange(existing.rowIndex, subjectNameCol + 1).setValue(name);
        subjectSheet.getRange(existing.rowIndex, subjectCodeCol + 1).setValue(code);
        subjectSheet.getRange(existing.rowIndex, hoursCol + 1).setValue(hours);
        subjectSheet.getRange(existing.rowIndex, groupCol + 1).setValue(group);
        if (subjectGroupCol !== -1) subjectSheet.getRange(existing.rowIndex, subjectGroupCol + 1).setValue(subjectGroup);
        if (classIdCol !== -1) existing.row[classIdCol] = classId;
        existing.row[subjectNameCol] = name;
        existing.row[subjectCodeCol] = code;
        existing.row[hoursCol] = hours;
        existing.row[groupCol] = group;
        if (subjectGroupCol !== -1) existing.row[subjectGroupCol] = subjectGroup;
        ensureSubjectWeights(subjectId, group, importWeights);
        updatedCount++;
        auditRows.push({ entity_id: subjectId, old_value: oldValue, new_value: { imported: true, action: 'update' } });
      } else {
        var newRow = makeSubjectRow(subjectId, classId, name, code, hours, group, subjectGroup);
        subjectSheet.appendRow(newRow);
        subjectsById[subjectId] = { rowIndex: subjectSheet.getLastRow(), row: newRow };
        if (code) subjectsByCodeAndClass[code + '|' + classId] = subjectsById[subjectId];
        ensureSubjectWeights(subjectId, group, importWeights);
        createdCount++;
        auditRows.push({ entity_id: subjectId, old_value: null, new_value: { imported: true, action: 'create' } });
      }

      successCount++;
    });
  } finally {
    lock.releaseLock();
  }

  if (auditRows.length > 0) {
    appendAuditLog(session.user_id, 'SubjectsCSVImport', 'bulk', null, {
      rows_imported: successCount,
      created: createdCount,
      updated: updatedCount,
      subjects: auditRows
    });
  }

  return {
    ok: true,
    success_count: successCount,
    created_count: createdCount,
    updated_count: updatedCount,
    warnings: warningMessages
  };
}
