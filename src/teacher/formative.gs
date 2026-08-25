// US-008: Formative indicator scoring (คะแนน1)

// Returns all data needed to render the formative scoring grid.
// Returns: { students, indicators, scores, subject_info, class_info, can_edit }
// scores: map of student_id -> indicator_id -> score
function getFormativeData(token, class_id, subject_id) {
  var session = requireSession_(token);
  var access = requireSubjectAccess_(session, class_id, subject_id);
  var cls = access.class_info;
  var subj = access.subject_info;
  var can_edit = true;

  // Get students ordered by seq_no
  var students = dbFind('Students', 'class_id', class_id);
  students.sort(function(a, b) { return Number(a.seq_no) - Number(b.seq_no); });

  // Get indicators ordered by display_order
  var indicators = dbFind('Indicators', 'subject_id', subject_id);
  indicators.sort(function(a, b) { return Number(a.display_order) - Number(b.display_order); });

  // Get all existing scores for this subject
  var allScores = dbGetAll('IndicatorScores');
  // Build map: student_id -> indicator_id -> score
  var scoreMap = {};
  allScores.forEach(function(row) {
    if (row.subject_id !== subject_id) return;
    if (!scoreMap[row.student_id]) scoreMap[row.student_id] = {};
    scoreMap[row.student_id][row.indicator_id] = Number(row.score) || 0;
  });

  return {
    students: students,
    indicators: indicators,
    scores: scoreMap,
    subject_info: subj,
    class_info: withClassLabel(cls),
    can_edit: can_edit
  };
}

// Save formative scores for a (class, subject) pair.
// rows: array of { student_id, indicator_id, score }
// Uses upsert pattern inside one LockService acquisition.
function serverSaveFormative(token, class_id, subject_id, rows) {
  var session = requireSession_(token);
  requireSubjectAccess_(session, class_id, subject_id);

  if (!rows || rows.length === 0) return { ok: true };
  validateFormativeRows_(rows, class_id, subject_id);

  var now = new Date().toISOString();
  var upsertRows = rows.map(function(row) {
    return {
      student_id: String(row.student_id),
      subject_id: String(subject_id),
      indicator_id: String(row.indicator_id),
      score: row.score === '' || row.score === null || row.score === undefined ? '' : Number(row.score),
      updated_by: session.user_id,
      updated_at: now
    };
  });
  dbBatchUpsertRows_('IndicatorScores', ['student_id', 'subject_id', 'indicator_id'], upsertRows, 'id', 'iscore');

  appendAuditLog(session.user_id, 'IndicatorScores', subject_id, null,
    { class_id: class_id, subject_id: subject_id, rows_saved: rows.length });

  return { ok: true };
}
