// US-006: Indicator catalog (ตัวชี้วัด) CRUD

function parseIndicatorMaxScore_(value, defaultValue) {
  var text = String(value === null || value === undefined ? '' : value).trim();
  if (text === '' && defaultValue !== undefined) return Number(defaultValue);
  var score = Number(text);
  if (!isFinite(score) || score <= 0) {
    throw new Error('คะแนนเต็มต้องเป็นตัวเลขที่มากกว่า 0');
  }
  return score;
}

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
  var maxScore = parseIndicatorMaxScore_(max_score, 3);
  var indicator_id = generateId('ind');
  dbInsert('Indicators', {
    indicator_id: indicator_id,
    subject_id: subject_id,
    code: code,
    description: description || '',
    max_score: maxScore,
    display_order: parseInt(display_order) || 0
  });
  syncSummativeCourseworkForSubjectClasses_(subject_id, session.user_id);
  return { ok: true, indicator_id: indicator_id };
}

function serverUpdateIndicator(token, indicator_id, code, description, max_score, display_order) {
  var session = getSession(token);
  if (!session) throw new Error('กรุณาเข้าสู่ระบบ');

  var indicatorId = String(indicator_id || '').trim();
  var cleanCode = String(code || '').trim();
  var cleanDescription = String(description || '').trim();
  var maxScore = parseIndicatorMaxScore_(max_score);
  var displayOrder = Number(display_order);

  if (!indicatorId) throw new Error('indicator_id is required');
  if (!cleanCode) throw new Error('กรุณากรอกรหัสตัวชี้วัด');
  if (!isFinite(displayOrder) || Math.floor(displayOrder) !== displayOrder || displayOrder < 0) {
    throw new Error('ลำดับต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป');
  }

  var indicator = dbFindOne('Indicators', 'indicator_id', indicatorId);
  if (!indicator) throw new Error('ไม่พบตัวชี้วัด');
  var previousMaxScore = Number(indicator.max_score);

  if (session.role !== 'admin') {
    var enrollment = dbGetAll('Enrollments').filter(function(e) {
      return String(e.subject_id) === String(indicator.subject_id) &&
        String(e.teacher_user_id) === String(session.user_id);
    });
    if (enrollment.length === 0) throw new Error('ไม่มีสิทธิ์แก้ไขตัวชี้วัดของวิชานี้');
  }

  var updates = {
    code: cleanCode,
    description: cleanDescription,
    max_score: maxScore,
    display_order: displayOrder
  };
  if (!dbUpdate('Indicators', 'indicator_id', indicatorId, updates)) {
    throw new Error('ไม่สามารถแก้ไขตัวชี้วัดได้');
  }
  appendAuditLog(session.user_id, 'Indicators', indicatorId, indicator, {
    indicator_id: indicatorId,
    subject_id: indicator.subject_id,
    code: cleanCode,
    description: cleanDescription,
    max_score: maxScore,
    display_order: displayOrder,
    action: 'update'
  });
  if (previousMaxScore !== maxScore) {
    syncSummativeCourseworkForSubjectClasses_(indicator.subject_id, session.user_id);
  }
  return { ok: true };
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
  syncSummativeCourseworkForSubjectClasses_(subject_id, session.user_id);
  return { ok: true };
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
    var maxScore;
    var displayOrder = parseInt(row.display_order, 10) || 0;

    if (!code) {
      warnings.push('แถวที่ ' + lineNum + ': ข้ามรายการเพราะไม่ได้ระบุรหัสตัวชี้วัด');
      return;
    }
    try {
      maxScore = parseIndicatorMaxScore_(row.max_score, 3);
    } catch (err) {
      warnings.push('แถวที่ ' + lineNum + ': ข้ามรายการเพราะคะแนนเต็มต้องเป็นตัวเลขที่มากกว่า 0');
      return;
    }

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

  if (created > 0 || updated > 0) {
    syncSummativeCourseworkForSubjectClasses_(subject_id, session.user_id);
  }

  return { ok: true, success_count: created + updated, created_count: created, updated_count: updated, warnings: warnings };
}
