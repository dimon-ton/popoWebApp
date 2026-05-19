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
  if (!session || session.role !== 'admin') throw new Error('ไม่มีสิทธิ์');
  var indicators = dbFind('Indicators', 'subject_id', subject_id);
  indicators.sort(function(a, b) { return Number(a.display_order) - Number(b.display_order); });
  return { indicators: indicators };
}

function serverAddIndicator(token, subject_id, code, description, max_score, display_order) {
  var session = getSession(token);
  if (!session || session.role !== 'admin') throw new Error('ไม่มีสิทธิ์');
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
  if (!session || session.role !== 'admin') throw new Error('ไม่มีสิทธิ์');
  dbDelete('Indicators', 'indicator_id', indicator_id);
  return { ok: true };
}

function preseedIndicators(token, subject_id) {
  var session = getSession(token);
  if (!session || session.role !== 'admin') throw new Error('ไม่มีสิทธิ์');
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
