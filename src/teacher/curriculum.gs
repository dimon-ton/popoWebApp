// P1-P3 learning outcomes and two 50-point terms. Legacy score tabs are not read here.
function isCurriculumLevel_(level) {
  return /^ป\.[123]$/.test(String(level || '').replace(/\s+/g, ''));
}

function ensureCurriculumTables_() {
  var names = ['LearningOutcomes', 'LearningOutcomeScores', 'TermAssessments'];
  var id = PropertiesService.getScriptProperties().getProperty('DB_SHEET_ID');
  var spreadsheet = SpreadsheetApp.openById(id);
  if (names.every(function(name) { return !!spreadsheet.getSheetByName(name); })) return;
  withDbLock_(function() {
    names.forEach(function(name) { ensureTab(spreadsheet, name, TAB_SCHEMA[name]); });
  });
}

function requireCurriculumAccess_(token, class_id, subject_id) {
  var session = requireSession_(token);
  var access = requireSubjectAccess_(session, class_id, subject_id);
  if (!isCurriculumLevel_(access.class_info.level)) throw new Error('ใช้การประเมินนี้ได้เฉพาะชั้น ป.1–ป.3');
  ensureCurriculumTables_();
  return { session: session, access: access };
}

function curriculumAbility_(grade) {
  if (grade === '' || grade === null || grade === undefined) return '';
  var n = Number(grade);
  if (n >= 3.5) return 'เชี่ยวชาญ';
  if (n >= 2.5) return 'ชำนาญ';
  if (n >= 1.5) return 'พัฒนา';
  return 'เริ่มต้น';
}

function curriculumTermResult_(outcomes, scoreMap, assessment) {
  if (!outcomes.length || assessment === '' || assessment === null || assessment === undefined || !isFinite(Number(assessment))) {
    return { raw: '', scaled: '', assessment: assessment === undefined ? '' : assessment, total: '', grade: '', ability: '' };
  }
  var raw = 0;
  var max = 0;
  for (var i = 0; i < outcomes.length; i++) {
    var outcome = outcomes[i];
    var value = scoreMap[outcome.outcome_id];
    if (value === '' || value === null || value === undefined || !isFinite(Number(value))) {
      return { raw: '', scaled: '', assessment: assessment, total: '', grade: '', ability: '' };
    }
    raw += Number(value);
    max += Number(outcome.max_score);
  }
  if (!max) return { raw: '', scaled: '', assessment: assessment, total: '', grade: '', ability: '' };
  var scaled = Math.round(raw / max * 35);
  var total = scaled + Number(assessment);
  var grade = computeGrade(total * 2);
  return { raw: raw, scaled: scaled, assessment: Number(assessment), total: total, grade: grade, ability: curriculumAbility_(grade) };
}

function getCurriculumData(token, class_id, subject_id) {
  var context = requireCurriculumAccess_(token, class_id, subject_id);
  var students = dbFind('Students', 'class_id', class_id);
  students.sort(function(a, b) { return Number(a.seq_no) - Number(b.seq_no); });
  var outcomes = dbFind('LearningOutcomes', 'subject_id', subject_id);
  outcomes.sort(function(a, b) { return Number(a.term) - Number(b.term) || Number(a.display_order) - Number(b.display_order); });
  var byTerm = { '1': [], '2': [] };
  outcomes.forEach(function(item) { if (byTerm[String(item.term)]) byTerm[String(item.term)].push(item); });
  var scoreMap = {};
  dbFind('LearningOutcomeScores', 'subject_id', subject_id).forEach(function(row) {
    if (!scoreMap[row.student_id]) scoreMap[row.student_id] = {};
    scoreMap[row.student_id][row.outcome_id] = row.score === '' ? '' : Number(row.score);
  });
  var assessmentMap = {};
  dbFind('TermAssessments', 'subject_id', subject_id).forEach(function(row) {
    if (!assessmentMap[row.student_id]) assessmentMap[row.student_id] = {};
    assessmentMap[row.student_id][String(row.term)] = row.score === '' ? '' : Number(row.score);
  });
  var results = students.map(function(student) {
    var scores = scoreMap[student.student_id] || {};
    var assessments = assessmentMap[student.student_id] || {};
    var term1 = curriculumTermResult_(byTerm['1'], scores, assessments['1']);
    var term2 = curriculumTermResult_(byTerm['2'], scores, assessments['2']);
    var yearTotal = term1.total === '' || term2.total === '' ? '' : term1.total + term2.total;
    var grade = yearTotal === '' ? '' : computeGrade(yearTotal);
    return {
      student_id: student.student_id, seq_no: student.seq_no, full_name: student.full_name,
      student_code: student.student_code || '', scores: scores,
      assessments: { '1': assessments['1'] === undefined ? '' : assessments['1'], '2': assessments['2'] === undefined ? '' : assessments['2'] },
      term1: term1, term2: term2, year_total: yearTotal, final_grade: grade, ability: curriculumAbility_(grade)
    };
  });
  return {
    class_info: withClassLabel(context.access.class_info), subject_info: context.access.subject_info,
    students: results, outcomes: byTerm, can_edit: true, curriculum: 'p1_p3'
  };
}

function serverSaveLearningOutcome(token, class_id, subject_id, item) {
  var context = requireCurriculumAccess_(token, class_id, subject_id);
  item = item || {};
  var term = Number(item.term);
  var max = Number(item.max_score);
  var code = String(item.code || '').trim();
  var description = String(item.description || '').trim();
  var order = Number(item.display_order || 0);
  if ((term !== 1 && term !== 2) || !code || !description || !isFinite(max) || max <= 0 || !isFinite(order) || order < 0) {
    throw new Error('กรุณาระบุภาคเรียน รหัส คำอธิบาย คะแนนเต็ม และลำดับให้ถูกต้อง');
  }
  var existing = dbFind('LearningOutcomes', 'subject_id', subject_id);
  var outcomeId = String(item.outcome_id || '');
  if (existing.some(function(row) { return String(row.term) === String(term) && String(row.code).trim() === code && row.outcome_id !== outcomeId; })) {
    throw new Error('รหัสผลลัพธ์การเรียนรู้ซ้ำในภาคเรียนเดียวกัน');
  }
  var record = { subject_id: String(subject_id), term: term, code: code, description: description, max_score: max, display_order: order };
  if (outcomeId) {
    var old = existing.filter(function(row) { return row.outcome_id === outcomeId; })[0];
    if (!old) throw new Error('ไม่พบผลลัพธ์การเรียนรู้');
    if ((Number(old.max_score) !== max || Number(old.term) !== term) && dbFind('LearningOutcomeScores', 'subject_id', subject_id).some(function(row) { return row.outcome_id === outcomeId && row.score !== ''; })) {
      throw new Error('มีคะแนนแล้ว จึงเปลี่ยนภาคเรียนหรือคะแนนเต็มไม่ได้');
    }
    dbUpdate('LearningOutcomes', 'outcome_id', outcomeId, record);
  } else {
    outcomeId = generateId('outcome');
    record.outcome_id = outcomeId;
    dbInsert('LearningOutcomes', record);
  }
  appendAuditLog(context.session.user_id, 'LearningOutcomes', outcomeId, null, record);
  return { ok: true, outcome_id: outcomeId };
}

function serverDeleteLearningOutcome(token, class_id, subject_id, outcome_id) {
  var context = requireCurriculumAccess_(token, class_id, subject_id);
  var outcome = dbFind('LearningOutcomes', 'subject_id', subject_id).filter(function(row) { return row.outcome_id === outcome_id; })[0];
  if (!outcome) throw new Error('ไม่พบผลลัพธ์การเรียนรู้');
  var scoreRows = dbFind('LearningOutcomeScores', 'subject_id', subject_id).filter(function(row) { return row.outcome_id === outcome_id; });
  if (scoreRows.some(function(row) { return row.score !== ''; })) {
    throw new Error('ลบผลลัพธ์ที่มีคะแนนแล้วไม่ได้');
  }
  scoreRows.forEach(function(row) { dbDelete('LearningOutcomeScores', 'id', row.id); });
  dbDelete('LearningOutcomes', 'outcome_id', outcome_id);
  appendAuditLog(context.session.user_id, 'LearningOutcomes', outcome_id, outcome, null);
  return { ok: true };
}

function serverSaveCurriculumScores(token, class_id, subject_id, term, rows) {
  var context = requireCurriculumAccess_(token, class_id, subject_id);
  term = Number(term);
  if (term !== 1 && term !== 2) throw new Error('ภาคเรียนไม่ถูกต้อง');
  if (!Array.isArray(rows) || !rows.length) return { ok: true };
  validateRowsBelongToClass_(rows, class_id);
  var outcomes = dbFind('LearningOutcomes', 'subject_id', subject_id).filter(function(item) { return Number(item.term) === term; });
  if (!outcomes.length) throw new Error('กรุณากำหนดผลลัพธ์การเรียนรู้สำหรับภาคเรียนนี้ก่อน');
  var outcomeRows = [];
  var assessmentRows = [];
  var now = new Date().toISOString();
  rows.forEach(function(row) {
    var studentId = String(row.student_id);
    var scores = row.scores || {};
    outcomes.forEach(function(item) {
      var value = scores[item.outcome_id];
      var score = value === '' || value === null || value === undefined ? '' : Number(value);
      if (score !== '' && (!isFinite(score) || score < 0 || score > Number(item.max_score))) throw new Error('คะแนนผลลัพธ์เกินช่วงที่กำหนด: ' + studentId);
      outcomeRows.push({ student_id: studentId, subject_id: String(subject_id), outcome_id: item.outcome_id, score: score, updated_by: context.session.user_id, updated_at: now });
    });
    var value = row.assessment;
    var assessment = value === '' || value === null || value === undefined ? '' : Number(value);
    if (assessment !== '' && (!isFinite(assessment) || assessment < 0 || assessment > 15)) throw new Error('คะแนนปลายภาคต้องอยู่ระหว่าง 0 ถึง 15: ' + studentId);
    assessmentRows.push({ student_id: studentId, subject_id: String(subject_id), term: term, score: assessment, updated_by: context.session.user_id, updated_at: now });
  });
  dbBatchUpsertRows_('LearningOutcomeScores', ['student_id', 'subject_id', 'outcome_id'], outcomeRows, 'id', 'los');
  dbBatchUpsertRows_('TermAssessments', ['student_id', 'subject_id', 'term'], assessmentRows, 'id', 'term');
  appendAuditLog(context.session.user_id, 'CurriculumScores', subject_id, null, { class_id: class_id, term: term, rows_saved: rows.length });
  return { ok: true };
}
