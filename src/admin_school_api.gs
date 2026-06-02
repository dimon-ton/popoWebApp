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

var PRESETS = {
  p1_3: [
    { id: 'subj_thai_p1', name: 'ภาษาไทย ป.1', code: 'ท11101', hours: 200, group: 1 },
    { id: 'subj_thai_p2', name: 'ภาษาไทย ป.2', code: 'ท12101', hours: 200, group: 1 },
    { id: 'subj_thai_p3', name: 'ภาษาไทย ป.3', code: 'ท13101', hours: 200, group: 1 },
    { id: 'subj_math_p1', name: 'คณิตศาสตร์ ป.1', code: 'ค11101', hours: 200, group: 1 },
    { id: 'subj_math_p2', name: 'คณิตศาสตร์ ป.2', code: 'ค12101', hours: 200, group: 1 },
    { id: 'subj_math_p3', name: 'คณิตศาสตร์ ป.3', code: 'ค13101', hours: 200, group: 1 },
    { id: 'subj_eng_p1', name: 'ภาษาอังกฤษ ป.1', code: 'อ11101', hours: 120, group: 1 },
    { id: 'subj_eng_p2', name: 'ภาษาอังกฤษ ป.2', code: 'อ12101', hours: 120, group: 1 },
    { id: 'subj_eng_p3', name: 'ภาษาอังกฤษ ป.3', code: 'อ13101', hours: 120, group: 1 },
    { id: 'subj_sci_p1', name: 'วิทยาศาสตร์และเทคโนโลยี ป.1', code: 'ว11101', hours: 80, group: 1 },
    { id: 'subj_sci_p2', name: 'วิทยาศาสตร์และเทคโนโลยี ป.2', code: 'ว12101', hours: 80, group: 1 },
    { id: 'subj_sci_p3', name: 'วิทยาศาสตร์และเทคโนโลยี ป.3', code: 'ว13101', hours: 80, group: 1 },
    { id: 'subj_soc_p1', name: 'สังคมศึกษาฯ ป.1', code: 'ส11101', hours: 80, group: 1 },
    { id: 'subj_soc_p2', name: 'สังคมศึกษาฯ ป.2', code: 'ส12101', hours: 80, group: 1 },
    { id: 'subj_soc_p3', name: 'สังคมศึกษาฯ ป.3', code: 'ส13101', hours: 80, group: 1 },
    { id: 'subj_hist_p1', name: 'ประวัติศาสตร์ ป.1', code: 'ส11102', hours: 40, group: 1 },
    { id: 'subj_hist_p2', name: 'ประวัติศาสตร์ ป.2', code: 'ส12102', hours: 40, group: 1 },
    { id: 'subj_hist_p3', name: 'ประวัติศาสตร์ ป.3', code: 'ส13102', hours: 40, group: 1 },
    { id: 'subj_pe_p1', name: 'สุขศึกษาและพลศึกษา ป.1', code: 'พ11101', hours: 40, group: 2 },
    { id: 'subj_pe_p2', name: 'สุขศึกษาและพลศึกษา ป.2', code: 'พ12101', hours: 40, group: 2 },
    { id: 'subj_pe_p3', name: 'สุขศึกษาและพลศึกษา ป.3', code: 'พ13101', hours: 40, group: 2 },
    { id: 'subj_art_p1', name: 'ศิลปะ ป.1', code: 'ศ11101', hours: 40, group: 2 },
    { id: 'subj_art_p2', name: 'ศิลปะ ป.2', code: 'ศ12101', hours: 40, group: 2 },
    { id: 'subj_art_p3', name: 'ศิลปะ ป.3', code: 'ศ13101', hours: 40, group: 2 },
    { id: 'subj_career_p1', name: 'การงานอาชีพ ป.1', code: 'ง11101', hours: 40, group: 2 },
    { id: 'subj_career_p2', name: 'การงานอาชีพ ป.2', code: 'ง12101', hours: 40, group: 2 },
    { id: 'subj_career_p3', name: 'การงานอาชีพ ป.3', code: 'ง13101', hours: 40, group: 2 },
    { id: 'subj_defense_p1', name: 'ป้องกันการทุจริต ป.1', code: 'ส11201', hours: 40, group: 2 },
    { id: 'subj_defense_p2', name: 'ป้องกันการทุจริต ป.2', code: 'ส12201', hours: 40, group: 2 },
    { id: 'subj_defense_p3', name: 'ป้องกันการทุจริต ป.3', code: 'ส13201', hours: 40, group: 2 }
  ],
  p4_6: [
    { id: 'subj_thai_p4', name: 'ภาษาไทย ป.4', code: 'ท14101', hours: 160, group: 1 },
    { id: 'subj_thai_p5', name: 'ภาษาไทย ป.5', code: 'ท15101', hours: 160, group: 1 },
    { id: 'subj_thai_p6', name: 'ภาษาไทย ป.6', code: 'ท16101', hours: 160, group: 1 },
    { id: 'subj_math_p4', name: 'คณิตศาสตร์ ป.4', code: 'ค14101', hours: 160, group: 1 },
    { id: 'subj_math_p5', name: 'คณิตศาสตร์ ป.5', code: 'ค15101', hours: 160, group: 1 },
    { id: 'subj_math_p6', name: 'คณิตศาสตร์ ป.6', code: 'ค16101', hours: 160, group: 1 },
    { id: 'subj_eng_p4', name: 'ภาษาอังกฤษ ป.4', code: 'อ14101', hours: 80, group: 1 },
    { id: 'subj_eng_p5', name: 'ภาษาอังกฤษ ป.5', code: 'อ15101', hours: 80, group: 1 },
    { id: 'subj_eng_p6', name: 'ภาษาอังกฤษ ป.6', code: 'อ16101', hours: 80, group: 1 },
    { id: 'subj_sci_p4', name: 'วิทยาศาสตร์และเทคโนโลยี ป.4', code: 'ว14101', hours: 80, group: 1 },
    { id: 'subj_sci_p5', name: 'วิทยาศาสตร์และเทคโนโลยี ป.5', code: 'ว15101', hours: 80, group: 1 },
    { id: 'subj_sci_p6', name: 'วิทยาศาสตร์และเทคโนโลยี ป.6', code: 'ว16101', hours: 80, group: 1 },
    { id: 'subj_soc_p4', name: 'สังคมศึกษาฯ ป.4', code: 'ส14101', hours: 80, group: 1 },
    { id: 'subj_soc_p5', name: 'สังคมศึกษาฯ ป.5', code: 'ส15101', hours: 80, group: 1 },
    { id: 'subj_soc_p6', name: 'สังคมศึกษาฯ ป.6', code: 'ส16101', hours: 80, group: 1 },
    { id: 'subj_hist_p4', name: 'ประวัติศาสตร์ ป.4', code: 'ส14102', hours: 40, group: 1 },
    { id: 'subj_hist_p5', name: 'ประวัติศาสตร์ ป.5', code: 'ส15102', hours: 40, group: 1 },
    { id: 'subj_hist_p6', name: 'ประวัติศาสตร์ ป.6', code: 'ส16102', hours: 40, group: 1 },
    { id: 'subj_pe_p4', name: 'สุขศึกษาและพลศึกษา ป.4', code: 'พ14101', hours: 80, group: 2 },
    { id: 'subj_pe_p5', name: 'สุขศึกษาและพลศึกษา ป.5', code: 'พ15101', hours: 80, group: 2 },
    { id: 'subj_pe_p6', name: 'สุขศึกษาและพลศึกษา ป.6', code: 'พ16101', hours: 80, group: 2 },
    { id: 'subj_art_p4', name: 'ศิลปะ ป.4', code: 'ศ14101', hours: 80, group: 2 },
    { id: 'subj_art_p5', name: 'ศิลปะ ป.5', code: 'ศ15101', hours: 80, group: 2 },
    { id: 'subj_art_p6', name: 'ศิลปะ ป.6', code: 'ศ16101', hours: 80, group: 2 },
    { id: 'subj_career_p4', name: 'การงานอาชีพ ป.4', code: 'ง14101', hours: 80, group: 2 },
    { id: 'subj_career_p5', name: 'การงานอาชีพ ป.5', code: 'ง15101', hours: 80, group: 2 },
    { id: 'subj_career_p6', name: 'การงานอาชีพ ป.6', code: 'ง16101', hours: 80, group: 2 },
    { id: 'subj_defense_p4', name: 'ป้องกันการทุจริต ป.4', code: 'ส14201', hours: 40, group: 2 },
    { id: 'subj_defense_p5', name: 'ป้องกันการทุจริต ป.5', code: 'ส15201', hours: 40, group: 2 },
    { id: 'subj_defense_p6', name: 'ป้องกันการทุจริต ป.6', code: 'ส16201', hours: 40, group: 2 }
  ],
  m1_3: [
    { id: 'subj_thai_m1', name: 'ภาษาไทย ม.1', code: 'ท21101', hours: 120, group: 1 },
    { id: 'subj_thai_m2', name: 'ภาษาไทย ม.2', code: 'ท22101', hours: 120, group: 1 },
    { id: 'subj_thai_m3', name: 'ภาษาไทย ม.3', code: 'ท23101', hours: 120, group: 1 },
    { id: 'subj_math_m1', name: 'คณิตศาสตร์ ม.1', code: 'ค21101', hours: 120, group: 1 },
    { id: 'subj_math_m2', name: 'คณิตศาสตร์ ม.2', code: 'ค22101', hours: 120, group: 1 },
    { id: 'subj_math_m3', name: 'คณิตศาสตร์ ม.3', code: 'ค23101', hours: 120, group: 1 },
    { id: 'subj_eng_m1', name: 'ภาษาอังกฤษ ม.1', code: 'อ21101', hours: 120, group: 1 },
    { id: 'subj_eng_m2', name: 'ภาษาอังกฤษ ม.2', code: 'อ22101', hours: 120, group: 1 },
    { id: 'subj_eng_m3', name: 'ภาษาอังกฤษ ม.3', code: 'อ23101', hours: 120, group: 1 },
    { id: 'subj_sci_m1', name: 'วิทยาศาสตร์ ม.1', code: 'ว21101', hours: 120, group: 1 },
    { id: 'subj_sci_m2', name: 'วิทยาศาสตร์ ม.2', code: 'ว22101', hours: 120, group: 1 },
    { id: 'subj_sci_m3', name: 'วิทยาศาสตร์ ม.3', code: 'ว23101', hours: 120, group: 1 },
    { id: 'subj_soc_m1', name: 'สังคมศึกษาฯ ม.1', code: 'ส21101', hours: 120, group: 1 },
    { id: 'subj_soc_m2', name: 'สังคมศึกษาฯ ม.2', code: 'ส22101', hours: 120, group: 1 },
    { id: 'subj_soc_m3', name: 'สังคมศึกษาฯ ม.3', code: 'ส23101', hours: 120, group: 1 },
    { id: 'subj_hist_m1', name: 'ประวัติศาสตร์ ม.1', code: 'ส21102', hours: 40, group: 1 },
    { id: 'subj_hist_m2', name: 'ประวัติศาสตร์ ม.2', code: 'ส22102', hours: 40, group: 1 },
    { id: 'subj_hist_m3', name: 'ประวัติศาสตร์ ม.3', code: 'ส23102', hours: 40, group: 1 },
    { id: 'subj_pe_m1', name: 'สุขศึกษาและพลศึกษา ม.1', code: 'พ21101', hours: 80, group: 2 },
    { id: 'subj_pe_m2', name: 'สุขศึกษาและพลศึกษา ม.2', code: 'พ22101', hours: 80, group: 2 },
    { id: 'subj_pe_m3', name: 'สุขศึกษาและพลศึกษา ม.3', code: 'พ23101', hours: 80, group: 2 },
    { id: 'subj_art_m1', name: 'ศิลปะ ม.1', code: 'ศ21101', hours: 80, group: 2 },
    { id: 'subj_art_m2', name: 'ศิลปะ ม.2', code: 'ศ22101', hours: 80, group: 2 },
    { id: 'subj_art_m3', name: 'ศิลปะ ม.3', code: 'ศ23101', hours: 80, group: 2 },
    { id: 'subj_career_m1', name: 'การงานอาชีพ ม.1', code: 'ง21101', hours: 80, group: 2 },
    { id: 'subj_career_m2', name: 'การงานอาชีพ ม.2', code: 'ง22101', hours: 80, group: 2 },
    { id: 'subj_career_m3', name: 'การงานอาชีพ ม.3', code: 'ง23101', hours: 80, group: 2 },
    { id: 'subj_defense_m1', name: 'ป้องกันการทุจริต ม.1', code: 'ส21201', hours: 40, group: 2 },
    { id: 'subj_defense_m2', name: 'ป้องกันการทุจริต ม.2', code: 'ส22201', hours: 40, group: 2 },
    { id: 'subj_defense_m3', name: 'ป้องกันการทุจริต ม.3', code: 'ส23201', hours: 40, group: 2 }
  ],
  generic: PRESEED_SUBJECTS
};

var DEFAULT_WEIGHTS = {
  '1': { coursework_max: 70, final_max: 30, pre_mid_max: 25, mid_max: 20, post_mid_max: 25, final_exam_max: 30 },
  '2': { coursework_max: 80, final_max: 20, pre_mid_max: 30, mid_max: 20, post_mid_max: 30, final_exam_max: 20 }
};

function preseedSubjects(presetKey) {
  var key = presetKey || 'generic';
  var list = PRESETS[key] || PRESETS['generic'];

  var existing = dbGetAll('Subjects');
  var existingIds = existing.map(function(s) { return s.subject_id; });
  var existingWeights = dbGetAll('SubjectWeights');
  var existingWeightIds = existingWeights.map(function(w) { return w.subject_id; });

  list.forEach(function(s) {
    var sId = s.id || s.subject_id;
    var sName = s.name || s.subject_name;
    var sCode = s.code || s.subject_code;
    var sHours = s.hours || s.hours_per_year;
    var sGroup = s.group || s.weight_group;

    if (existingIds.indexOf(sId) === -1) {
      dbInsert('Subjects', {
        subject_id: sId,
        subject_name: sName,
        subject_code: sCode,
        hours_per_year: sHours,
        weight_group: sGroup,
        description: ''
      });
    }
    if (existingWeightIds.indexOf(sId) === -1) {
      var w = DEFAULT_WEIGHTS[String(sGroup)] || DEFAULT_WEIGHTS['1'];
      dbInsert('SubjectWeights', {
        subject_id: sId,
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
  try { CacheService.getScriptCache().remove('school_name'); } catch(e) {}
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
  if (!level || !section) throw new Error('กรุณาระบุระดับชั้นและห้อง');
  var autoId = 'class_' + level.replace(/[\.\s]/g, '') + '_' + section.replace(/[\.\s]/g, '');
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

// ── Subjects ──────────────────────────────────────────────────────────────────

function getSubjectsList(token) {
  var session = getSession(token);
  if (!session || session.role !== 'admin') throw new Error('ไม่มีสิทธิ์');
  return { subjects: dbGetAll('Subjects') };
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

function serverAddSubject(token, subject_id, subject_name, subject_code, hours_per_year, weight_group, description) {
  var session = getSession(token);
  if (!session || session.role !== 'admin') throw new Error('ไม่มีสิทธิ์');
  
  if (!subject_id) {
    subject_id = generateSubjectId(subject_code, subject_name);
  }
  
  var existing = dbFindOne('Subjects', 'subject_id', subject_id);
  if (existing) {
    subject_id += '_' + Math.random().toString(36).substring(2, 5);
    existing = dbFindOne('Subjects', 'subject_id', subject_id);
    if (existing) throw new Error('เกิดข้อผิดพลาดในการสร้าง subject_id กรุณาลองใหม่');
  }
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
  
  var oldSubject = dbFindOne('Subjects', 'subject_id', subject_id);
  var oldGroup = oldSubject ? oldSubject.weight_group : null;
  
  var newGroup = parseInt(weight_group) || 1;
  dbUpdate('Subjects', 'subject_id', subject_id, {
    subject_name: subject_name,
    subject_code: subject_code,
    hours_per_year: parseInt(hours_per_year) || 0,
    weight_group: newGroup,
    description: description || ''
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

function serverImportSubjectsCSV(token, rows) {
  var session = getSession(token);
  if (!session || session.role !== 'admin') throw new Error('ไม่มีสิทธิ์');

  var users = dbGetAll('Users');
  var classes = dbGetAll('Classes');
  var subjects = dbGetAll('Subjects');
  var enrollments = dbGetAll('Enrollments');

  var successCount = 0;
  var warningMessages = [];

  // Helper to find teacher by name
  function findTeacherByName(name) {
    if (!name) return null;
    var normName = name.trim().replace(/\s+/g, ' '); // normalize spaces
    for (var i = 0; i < users.length; i++) {
      var uName = (users[i].full_name || '').trim().replace(/\s+/g, ' ');
      if (uName === normName) {
        return users[i];
      }
    }
    return null;
  }

  // Process rows inside a transaction/lock
  var lock = LockService.getDocumentLock();
  if (!lock.tryLock(30000)) throw new Error('ไม่สามารถล็อกระบบฐานข้อมูลได้ กรุณาลองใหม่ภายหลัง');

  try {
    rows.forEach(function(row, idx) {
      var lineNum = idx + 1;
      var code = (row.subject_code || '').trim();
      var name = (row.subject_name || '').trim();
      var className = (row.class_name || '').trim();
      var hoursStr = (row.hours || '').trim();
      var hours = parseInt(hoursStr) || 0;
      var teacherName = (row.teacher_name || '').trim();

      if (!code || !name || !className) {
        warningMessages.push('แถวที่ ' + lineNum + ': ข้อมูลไม่ครบถ้วน (รหัสวิชา, ชื่อวิชา, ชั้นเรียน เป็นฟิลด์บังคับ)');
        return;
      }

      // 1. Parse Class (e.g. ป.1/1)
      var level = className;
      var section = '1';
      var slashIdx = className.indexOf('/');
      if (slashIdx !== -1) {
        level = className.substring(0, slashIdx).trim();
        section = className.substring(slashIdx + 1).trim();
      }

      var classId = 'class_' + level.replace(/[\.\s]/g, '') + '_' + section.replace(/[\.\s]/g, '');
      var existingClass = classes.find(function(c) { return c.class_id === classId; });
      if (!existingClass) {
        // Create Class
        var newClass = {
          class_id: classId,
          level: level,
          section: section,
          homeroom_teacher_user_id: ''
        };
        dbInsert('Classes', newClass);
        classes.push(newClass); // Cache update
      }

      // 2. Find Teacher
      var teacher = findTeacherByName(teacherName);
      var teacherId = '';
      if (teacher) {
        teacherId = teacher.user_id;
      } else if (teacherName) {
        warningMessages.push('แถวที่ ' + lineNum + ': ไม่พบครูชื่อ "' + teacherName + '" ในระบบ (รายวิชาจะยังไม่มีผู้สอน)');
      }

      // 3. Create/Find Subject
      var codeSlug = generateSubjectId(code, '').replace('subj_', '');
      var classSlug = classId.replace('class_', '');
      var subjectId = 'subj_' + codeSlug + '_' + classSlug;

      var existingSub = subjects.find(function(s) { return s.subject_id === subjectId; });
      if (!existingSub) {
        var newSub = {
          subject_id: subjectId,
          subject_name: name,
          subject_code: code,
          hours_per_year: hours,
          weight_group: 1,
          description: 'นำเข้าจาก CSV'
        };
        dbInsert('Subjects', newSub);
        subjects.push(newSub); // Cache update

        // SubjectWeights
        var w = DEFAULT_WEIGHTS['1'];
        dbInsert('SubjectWeights', {
          subject_id: subjectId,
          coursework_max: w.coursework_max,
          final_max: w.final_max,
          pre_mid_max: w.pre_mid_max,
          mid_max: w.mid_max,
          post_mid_max: w.post_mid_max,
          final_exam_max: w.final_exam_max
        });
      } else {
        // Update hours if needed or keep existing
        dbUpdate('Subjects', 'subject_id', subjectId, {
          subject_name: name,
          subject_code: code,
          hours_per_year: hours
        });
      }

      // 4. Enrollments
      var existingEnr = enrollments.find(function(e) { return e.class_id === classId && e.subject_id === subjectId; });
      if (!existingEnr) {
        var enrollmentId = generateId('enr');
        dbInsert('Enrollments', {
          enrollment_id: enrollmentId,
          class_id: classId,
          subject_id: subjectId,
          teacher_user_id: teacherId,
          dev_activity_result: ''
        });
        enrollments.push({
          enrollment_id: enrollmentId,
          class_id: classId,
          subject_id: subjectId,
          teacher_user_id: teacherId
        });
        appendAuditLog(session.user_id, 'Enrollments', enrollmentId, null, {
          class_id: classId,
          subject_id: subjectId,
          teacher_user_id: teacherId
        });
      } else {
        if (existingEnr.teacher_user_id !== teacherId) {
          var oldTeacherId = existingEnr.teacher_user_id;
          dbUpdate('Enrollments', 'enrollment_id', existingEnr.enrollment_id, {
            teacher_user_id: teacherId
          });
          existingEnr.teacher_user_id = teacherId; // Cache update
          appendAuditLog(session.user_id, 'Enrollments', existingEnr.enrollment_id, {
            teacher_user_id: oldTeacherId
          }, {
            teacher_user_id: teacherId
          });
        }
      }

      successCount++;
    });
  } finally {
    lock.releaseLock();
  }

  return { ok: true, success_count: successCount, warnings: warningMessages };
}
