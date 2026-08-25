// US-009: Summative scoring and grade computation (คะแนน2)

// Grade ladder per FR-4
function computeGrade(total) {
  if (total === '' || total === null || total === undefined) return '';
  var t = Number(total);
  if (isNaN(t)) return '';
  if (t >= 80) return 4;
  if (t >= 75) return 3.5;
  if (t >= 70) return 3;
  if (t >= 65) return 2.5;
  if (t >= 60) return 2;
  if (t >= 55) return 1.5;
  if (t >= 50) return 1;
  return 0;
}

function getSummativeScoreMaxes(subject_id) {
  var weights = dbFindOne('SubjectWeights', 'subject_id', subject_id) || {
    pre_mid_max: 25, mid_max: 20, post_mid_max: 25, final_exam_max: 30
  };
  var preMidMax = weights.pre_mid_max !== undefined && weights.pre_mid_max !== '' ? Number(weights.pre_mid_max) : 25;
  var postMidMax = weights.post_mid_max !== undefined && weights.post_mid_max !== '' ? Number(weights.post_mid_max) : 25;
  var midtermMax = weights.mid_max !== undefined && weights.mid_max !== '' ? Number(weights.mid_max) : 20;
  var finalMax = weights.final_exam_max !== undefined && weights.final_exam_max !== '' ? Number(weights.final_exam_max) : 30;
  return {
    coursework: (!isNaN(preMidMax) ? preMidMax : 25) + (!isNaN(postMidMax) ? postMidMax : 25),
    midterm: !isNaN(midtermMax) ? midtermMax : 20,
    final: !isNaN(finalMax) ? finalMax : 30
  };
}

function parseSummativeScore(value, max, label, student_id) {
  if (value === '' || value === null || value === undefined) return '';
  var n = Number(value);
  if (isNaN(n) || n < 0 || n > max) {
    throw new Error('คะแนน ' + label + ' ของนักเรียน ' + student_id + ' ต้องอยู่ระหว่าง 0 ถึง ' + max);
  }
  return n;
}

function parseMakeupGrade(value, student_id) {
  if (value === '' || value === null || value === undefined) return '';
  var n = Number(value);
  if (isNaN(n) || n < 0 || n > 4) {
    throw new Error('คะแนนสอบแก้ตัวของนักเรียน ' + student_id + ' ต้องอยู่ระหว่าง 0 ถึง 4');
  }
  return n;
}

// Returns all data needed to render the summative scoring grid.
// Returns: { students, weights, scores, subject_info, class_info, can_edit }
// scores: map of student_id -> { coursework, midterm, final, total, computed_grade, makeup_grade, final_grade }
function getSummativeData(token, class_id, subject_id) {
  var session = requireSession_(token);
  var access = requireSubjectAccess_(session, class_id, subject_id);
  var cls = access.class_info;
  var subj = access.subject_info;
  var can_edit = true;

  // Get students ordered by seq_no
  var students = dbFind('Students', 'class_id', class_id);
  students.sort(function(a, b) { return Number(a.seq_no) - Number(b.seq_no); });

  // Get subject weights
  var weightsRow = dbFindOne('SubjectWeights', 'subject_id', subject_id);
  var weights = weightsRow || {
    subject_id: subject_id,
    coursework_max: 70, final_max: 30,
    pre_mid_max: 25, mid_max: 20, post_mid_max: 25, final_exam_max: 30
  };

  // Get all existing summative scores for this subject
  var allScores = dbGetAll('SummativeScores');
  var scoreMap = {};
  allScores.forEach(function(row) {
    if (row.subject_id !== subject_id) return;
    scoreMap[row.student_id] = {
      coursework: row.coursework !== '' ? Number(row.coursework) : '',
      midterm: row.midterm !== '' ? Number(row.midterm) : '',
      final: row.final !== '' ? Number(row.final) : '',
      total: row.total !== '' ? Number(row.total) : '',
      computed_grade: row.computed_grade !== '' ? row.computed_grade : '',
      makeup_grade: row.makeup_grade !== '' ? row.makeup_grade : '',
      final_grade: row.final_grade !== '' ? row.final_grade : ''
    };
  });

  return {
    students: students,
    weights: weights,
    scores: scoreMap,
    subject_info: subj,
    class_info: withClassLabel(cls),
    can_edit: can_edit
  };
}

// Save summative scores for a (class, subject) pair.
// rows: array of { student_id, coursework, midterm, final, makeup_grade }
// Uses upsert pattern inside one LockService acquisition.
function serverSaveSummative(token, class_id, subject_id, rows) {
  var session = requireSession_(token);
  requireSubjectAccess_(session, class_id, subject_id);

  if (!rows || rows.length === 0) return { ok: true };
  validateRowsBelongToClass_(rows, class_id);

  var maxes = getSummativeScoreMaxes(subject_id);

  var now = new Date().toISOString();
  var upsertRows = rows.map(function(row) {
    var student_id = String(row.student_id);
    var cw = parseSummativeScore(row.coursework, maxes.coursework, 'ระหว่างเรียน', student_id);
    var mid = parseSummativeScore(row.midterm, maxes.midterm, 'สอบกลางภาค', student_id);
    var fin = parseSummativeScore(row.final, maxes.final, 'สอบปลายภาค', student_id);
    var makeup = parseMakeupGrade(row.makeup_grade, student_id);

    var total = '';
    if (cw !== '' || mid !== '' || fin !== '') {
      total = (cw === '' ? 0 : Number(cw)) + (mid === '' ? 0 : Number(mid)) + (fin === '' ? 0 : Number(fin));
    }
    var computed_grade = computeGrade(total);
    var final_grade = (makeup !== '' && !isNaN(makeup)) ? makeup : computed_grade;
    return {
      student_id: student_id,
      subject_id: String(subject_id),
      coursework: cw,
      midterm: mid,
      final: fin,
      total: total,
      computed_grade: computed_grade,
      makeup_grade: makeup,
      final_grade: final_grade,
      updated_by: session.user_id,
      updated_at: now
    };
  });
  dbBatchUpsertRows_('SummativeScores', ['student_id', 'subject_id'], upsertRows, 'id', 'ssum');

  appendAuditLog(session.user_id, 'SummativeScores', subject_id, null,
    { class_id: class_id, subject_id: subject_id, rows_saved: rows.length });

  return { ok: true };
}
