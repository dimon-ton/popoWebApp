// US-006: Indicator catalog (ตัวชี้วัด) CRUD

// Pre-seed English Grade-1 indicators for subj_eng (from source คะแนน1)
var PRESEED_INDICATORS = [
  { code: 'ต 1.1 ป.1/1', desc: '', order: 1 },
  { code: 'ต 1.1 ป.1/2', desc: '', order: 2 },
  { code: 'ต 1.1 ป.1/3', desc: '', order: 3 },
  { code: 'ต 1.1 ป.1/4', desc: '', order: 4 },
  { code: 'ต 1.2 ป.1/1', desc: '', order: 5 },
  { code: 'ต 1.2 ป.1/2', desc: '', order: 6 },
  { code: 'ต 1.2 ป.1/3', desc: '', order: 7 },
  { code: 'ต 1.2 ป.1/4', desc: '', order: 8 },
  { code: 'ต 1.3 ป.1/1', desc: '', order: 9 },
  { code: 'ต 2.1 ป.1/1', desc: '', order: 10 },
  { code: 'ต 2.1 ป.1/2', desc: '', order: 11 },
  { code: 'ต 2.1 ป.1/3', desc: '', order: 12 },
  { code: 'ต 2.2 ป.1/1', desc: '', order: 13 },
  { code: 'ต 3.1 ป.1/1', desc: '', order: 14 },
  { code: 'ต 4.1 ป.1/1', desc: '', order: 15 },
  { code: 'ต 4.2 ป.1/1', desc: '', order: 16 }
];

function getIndicatorsList(token, subject_id) {
  var session = getSession(token);
  if (!session) throw new Error('กรุณาเข้าสู่ระบบ');
  if (session.role !== 'admin') {
    var enrollment = dbGetAll('Enrollments').filter(function(e) {
      return e.subject_id === subject_id && e.teacher_user_id === session.user_id;
    });
    if (enrollment.length === 0) throw new Error('ไม่มีสิทธิ์เข้าถึงตัวชี้วัดของวิชานี้');
  }
  var indicators = dbFind('Indicators', 'subject_id', subject_id);
  indicators.sort(function(a, b) { return Number(a.display_order) - Number(b.display_order); });
  return { indicators: indicators };
}

function serverAddIndicator(token, subject_id, code, description, max_score, display_order) {
  var session = getSession(token);
  if (!session) throw new Error('กรุณาเข้าสู่ระบบ');
  if (session.role !== 'admin') {
    var enrollment = dbGetAll('Enrollments').filter(function(e) {
      return e.subject_id === subject_id && e.teacher_user_id === session.user_id;
    });
    if (enrollment.length === 0) throw new Error('ไม่มีสิทธิ์เพิ่มตัวชี้วัดของวิชานี้');
  }
  if (!subject_id) throw new Error('subject_id is required');
  if (!code) throw new Error('code is required');
  var indicator_id = generateId('ind');
  dbInsert('Indicators', {
    indicator_id: indicator_id,
    subject_id: subject_id,
    code: code,
    description: description || '',
    max_score: parseInt(max_score) || 3,
    display_order: parseInt(display_order) || 0
  });
  return { ok: true, indicator_id: indicator_id };
}

function serverDeleteIndicator(token, indicator_id) {
  var session = getSession(token);
  if (!session) throw new Error('กรุณาเข้าสู่ระบบ');
  var ind = dbFindOne('Indicators', 'indicator_id', indicator_id);
  if (!ind) throw new Error('ไม่พบตัวชี้วัด');
  var subject_id = ind.subject_id;
  if (session.role !== 'admin') {
    var enrollment = dbGetAll('Enrollments').filter(function(e) {
      return e.subject_id === subject_id && e.teacher_user_id === session.user_id;
    });
    if (enrollment.length === 0) throw new Error('ไม่มีสิทธิ์ลบตัวชี้วัดของวิชานี้');
  }
  dbDelete('Indicators', 'indicator_id', indicator_id);
  return { ok: true };
}

function preseedIndicators(token, subject_id) {
  var session = getSession(token);
  if (!session) throw new Error('กรุณาเข้าสู่ระบบ');
  if (session.role !== 'admin') {
    var enrollment = dbGetAll('Enrollments').filter(function(e) {
      return e.subject_id === subject_id && e.teacher_user_id === session.user_id;
    });
    if (enrollment.length === 0) throw new Error('ไม่มีสิทธิ์จัดการตัวชี้วัดของวิชานี้');
  }
  if (!subject_id) throw new Error('subject_id is required');
  var existing = dbFind('Indicators', 'subject_id', subject_id);
  var existingCodes = existing.map(function(i) { return i.code; });
  var added = 0;
  PRESEED_INDICATORS.forEach(function(ind) {
    if (existingCodes.indexOf(ind.code) === -1) {
      dbInsert('Indicators', {
        indicator_id: generateId('ind'),
        subject_id: subject_id,
        code: ind.code,
        description: ind.desc,
        max_score: 3,
        display_order: ind.order
      });
      added++;
    }
  });
  return { ok: true, added: added };
}

function serverImportIndicatorsCSV(token, subject_id, rows) {
  var session = getSession(token);
  if (!session) throw new Error('กรุณาเข้าสู่ระบบ');
  if (session.role !== 'admin') {
    var enrollment = dbGetAll('Enrollments').filter(function(e) {
      return e.subject_id === subject_id && e.teacher_user_id === session.user_id;
    });
    if (enrollment.length === 0) throw new Error('ไม่มีสิทธิ์นำเข้าตัวชี้วัดของวิชานี้');
  }
  if (!subject_id) throw new Error('subject_id is required');

  var subject = dbFindOne('Subjects', 'subject_id', subject_id);
  if (!subject) throw new Error('ไม่พบวิชา: ' + subject_id);

  var existing = dbFind('Indicators', 'subject_id', subject_id);
  var byId = {};
  var byCode = {};
  existing.forEach(function(ind) {
    if (ind.indicator_id) byId[String(ind.indicator_id)] = ind;
    if (ind.code) byCode[String(ind.code).trim()] = ind;
  });

  var created = 0;
  var updated = 0;
  var warnings = [];

  (rows || []).forEach(function(row, idx) {
    var lineNum = idx + 1;
    var indicatorId = String(row.indicator_id || '').trim();
    var code = String(row.code || '').trim();
    var description = String(row.description || '').trim();
    var maxScore = parseInt(row.max_score, 10) || 3;
    var displayOrder = parseInt(row.display_order, 10) || 0;

    if (!code) {
      warnings.push('แถวที่ ' + lineNum + ': ข้ามรายการเพราะไม่ได้ระบุรหัสตัวชี้วัด');
      return;
    }
    if (maxScore < 1) maxScore = 1;

    var target = null;
    if (indicatorId && byId[indicatorId]) {
      target = byId[indicatorId];
    } else if (!indicatorId && byCode[code]) {
      target = byCode[code];
      indicatorId = target.indicator_id;
    }

    if (target) {
      var oldVal = JSON.parse(JSON.stringify(target));
      dbUpdate('Indicators', 'indicator_id', target.indicator_id, {
        code: code,
        description: description,
        max_score: maxScore,
        display_order: displayOrder
      });
      target.code = code;
      target.description = description;
      target.max_score = maxScore;
      target.display_order = displayOrder;
      byCode[code] = target;
      appendAuditLog(session.user_id, 'Indicators', target.indicator_id, oldVal, { imported: true, action: 'update' });
      updated++;
    } else {
      var newId = indicatorId || generateId('ind');
      var newIndicator = {
        indicator_id: newId,
        subject_id: subject_id,
        code: code,
        description: description,
        max_score: maxScore,
        display_order: displayOrder
      };
      dbInsert('Indicators', newIndicator);
      byId[newId] = newIndicator;
      byCode[code] = newIndicator;
      appendAuditLog(session.user_id, 'Indicators', newId, null, { imported: true, action: 'create', subject_id: subject_id });
      created++;
    }
  });

  return { ok: true, success_count: created + updated, created_count: created, updated_count: updated, warnings: warnings };
}
