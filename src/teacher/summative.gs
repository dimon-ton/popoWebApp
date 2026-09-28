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

var summativeCourseworkOverrideColumnReady_ = false;

function ensureSummativeCourseworkOverrideColumn_() {
  if (summativeCourseworkOverrideColumnReady_) return;
  ensureColumns('SummativeScores', ['coursework_override']);
  summativeCourseworkOverrideColumnReady_ = true;
}

function isBlankScore_(value) {
  return value === '' || value === null || value === undefined;
}

function roundScore_(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function getCourseworkMaxFromWeights_(weights) {
  weights = weights || {};
  var preMidMax = !isBlankScore_(weights.pre_mid_max) ? Number(weights.pre_mid_max) : 25;
  var postMidMax = !isBlankScore_(weights.post_mid_max) ? Number(weights.post_mid_max) : 25;
  return (isNaN(preMidMax) ? 25 : preMidMax) + (isNaN(postMidMax) ? 25 : postMidMax);
}

function buildIndicatorScoreContext_(subjectId, studentIds) {
  var subjectKey = String(subjectId);
  var studentSet = {};
  (studentIds || []).forEach(function(studentId) { studentSet[String(studentId)] = true; });

  var indicators = dbGetAll('Indicators').filter(function(indicator) {
    return String(indicator.subject_id) === subjectKey;
  });
  var scoresByStudent = {};
  dbGetAll('IndicatorScores').forEach(function(row) {
    var studentKey = String(row.student_id);
    if (String(row.subject_id) !== subjectKey || !studentSet[studentKey]) return;
    if (!scoresByStudent[studentKey]) scoresByStudent[studentKey] = {};
    scoresByStudent[studentKey][String(row.indicator_id)] = row.score;
  });

  return {
    indicators: indicators,
    scores_by_student: scoresByStudent,
    coursework_max: getCourseworkMaxFromWeights_(dbFindOne('SubjectWeights', 'subject_id', subjectId))
  };
}

function getIndicatorScoreSummary_(subjectId, studentId, context) {
  var scoreContext = context || buildIndicatorScoreContext_(subjectId, [studentId]);
  var scores = scoreContext.scores_by_student[String(studentId)] || {};
  var rawScore = 0;
  var rawMax = 0;
  var complete = scoreContext.indicators.length > 0;

  scoreContext.indicators.forEach(function(indicator) {
    var maxScore = Number(indicator.max_score);
    var score = scores[String(indicator.indicator_id)];
    if (isNaN(maxScore) || maxScore <= 0) complete = false;
    else rawMax += maxScore;
    if (isBlankScore_(score) || isNaN(Number(score))) complete = false;
    else rawScore += Number(score);
  });

  return {
    raw_indicator_score: rawScore,
    raw_indicator_max: rawMax,
    complete: complete && rawMax > 0
  };
}

function calculateCourseworkScore_(subjectId, studentId, context) {
  var scoreContext = context || buildIndicatorScoreContext_(subjectId, [studentId]);
  var summary = getIndicatorScoreSummary_(subjectId, studentId, scoreContext);
  if (!summary.complete) return '';
  return roundScore_((summary.raw_indicator_score / summary.raw_indicator_max) * scoreContext.coursework_max);
}

function validCourseworkOverride_(value, courseworkMax) {
  if (isBlankScore_(value)) return '';
  var score = Number(value);
  return isNaN(score) || score < 0 || score > courseworkMax ? '' : score;
}

function validStoredMakeupGrade_(value) {
  if (isBlankScore_(value)) return '';
  var grade = Number(value);
  return isNaN(grade) || grade < 0 || grade > 4 ? '' : grade;
}

function calculateSummativeResult_(coursework, midterm, finalScore, makeupGrade) {
  var complete = !isBlankScore_(coursework) && !isBlankScore_(midterm) && !isBlankScore_(finalScore);
  var total = '';
  if (!isBlankScore_(coursework) || !isBlankScore_(midterm) || !isBlankScore_(finalScore)) {
    total = roundScore_((isBlankScore_(coursework) ? 0 : Number(coursework)) +
      (isBlankScore_(midterm) ? 0 : Number(midterm)) +
      (isBlankScore_(finalScore) ? 0 : Number(finalScore)));
  }
  var computedGrade = complete ? computeGrade(total) : '';
  var validMakeup = validStoredMakeupGrade_(makeupGrade);
  return {
    total: total,
    computed_grade: computedGrade,
    makeup_grade: validMakeup,
    final_grade: validMakeup !== '' ? validMakeup : computedGrade
  };
}

function syncSummativeCoursework_(classId, subjectId, studentIds, updatedBy) {
  var cls = dbFindOne('Classes', 'class_id', classId);
  if (!cls || isCurriculumLevel_(cls.level)) return { skipped: true, rows_synced: 0 };

  var ids = (studentIds || []).map(function(studentId) { return String(studentId); });
  if (!ids.length) return { skipped: false, rows_synced: 0 };
  ensureSummativeCourseworkOverrideColumn_();
  var idSet = {};
  ids.forEach(function(studentId) { idSet[studentId] = true; });
  var context = buildIndicatorScoreContext_(subjectId, ids);
  var existingByStudent = {};
  dbGetAll('SummativeScores').forEach(function(row) {
    if (String(row.subject_id) === String(subjectId) && idSet[String(row.student_id)]) {
      existingByStudent[String(row.student_id)] = row;
    }
  });
  var now = new Date().toISOString();
  var upsertRows = ids.map(function(studentId) {
    var existing = existingByStudent[studentId] || {};
    var derivedCoursework = calculateCourseworkScore_(subjectId, studentId, context);
    var courseworkOverride = validCourseworkOverride_(existing.coursework_override, context.coursework_max);
    var coursework = courseworkOverride !== '' ? courseworkOverride : derivedCoursework;
    var result = calculateSummativeResult_(coursework, existing.midterm, existing.final, existing.makeup_grade);
    return {
      student_id: studentId,
      subject_id: String(subjectId),
      coursework: coursework,
      coursework_override: courseworkOverride,
      midterm: isBlankScore_(existing.midterm) ? '' : existing.midterm,
      final: isBlankScore_(existing.final) ? '' : existing.final,
      total: result.total,
      computed_grade: result.computed_grade,
      makeup_grade: result.makeup_grade,
      final_grade: result.final_grade,
      updated_by: updatedBy || existing.updated_by || '',
      updated_at: now
    };
  });
  dbBatchUpsertRows_('SummativeScores', ['student_id', 'subject_id'], upsertRows, 'id', 'ssum');
  return { skipped: false, rows_synced: upsertRows.length };
}

function syncAllSummativeCourseworkForSubject_(classId, subjectId, updatedBy) {
  var studentIds = dbFind('Students', 'class_id', classId).map(function(student) {
    return String(student.student_id);
  });
  return syncSummativeCoursework_(classId, subjectId, studentIds, updatedBy);
}

function syncSummativeCourseworkForSubjectClasses_(subjectId, updatedBy) {
  var classIds = {};
  var subject = dbFindOne('Subjects', 'subject_id', subjectId);
  if (subject && subject.class_id) classIds[String(subject.class_id)] = true;
  dbGetAll('Enrollments').forEach(function(enrollment) {
    if (String(enrollment.subject_id) === String(subjectId) && enrollment.class_id) {
      classIds[String(enrollment.class_id)] = true;
    }
  });
  Object.keys(classIds).forEach(function(classId) {
    syncAllSummativeCourseworkForSubject_(classId, subjectId, updatedBy);
  });
}

// Returns all data needed to render the summative scoring grid.
// Returns: { students, weights, scores, subject_info, class_info, can_edit }
// scores: map of student_id -> { coursework, midterm, final, total, computed_grade, makeup_grade, final_grade }
function getSummativeData(token, class_id, subject_id) {
  var session = requireSession_(token);
  var access = requireSubjectAccess_(session, class_id, subject_id);
  var cls = access.class_info;
  if (isCurriculumLevel_(cls.level)) throw new Error('ชั้น ป.1–ป.3 ใช้คะแนนรายภาคเรียน');
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
  var access = requireSubjectAccess_(session, class_id, subject_id);
  if (isCurriculumLevel_(access.class_info.level)) throw new Error('ชั้น ป.1–ป.3 ใช้คะแนนรายภาคเรียน');

  if (!rows || rows.length === 0) return { ok: true };
  validateRowsBelongToClass_(rows, class_id);
  ensureSummativeCourseworkOverrideColumn_();

  var maxes = getSummativeScoreMaxes(subject_id);
  var studentIds = rows.map(function(row) { return String(row.student_id); });
  var courseworkContext = buildIndicatorScoreContext_(subject_id, studentIds);

  var now = new Date().toISOString();
  var upsertRows = rows.map(function(row) {
    var student_id = String(row.student_id);
    var derivedCoursework = calculateCourseworkScore_(subject_id, student_id, courseworkContext);
    var submittedCoursework = parseSummativeScore(row.coursework, maxes.coursework, 'ระหว่างเรียน', student_id);
    var courseworkOverride = submittedCoursework;
    if (submittedCoursework === '' || (derivedCoursework !== '' && roundScore_(submittedCoursework) === roundScore_(derivedCoursework))) {
      courseworkOverride = '';
    }
    var cw = courseworkOverride !== '' ? courseworkOverride : derivedCoursework;
    var mid = parseSummativeScore(row.midterm, maxes.midterm, 'สอบกลางภาค', student_id);
    var fin = parseSummativeScore(row.final, maxes.final, 'สอบปลายภาค', student_id);
    var makeup = parseMakeupGrade(row.makeup_grade, student_id);
    var result = calculateSummativeResult_(cw, mid, fin, makeup);
    return {
      student_id: student_id,
      subject_id: String(subject_id),
      coursework: cw,
      coursework_override: courseworkOverride,
      midterm: mid,
      final: fin,
      total: result.total,
      computed_grade: result.computed_grade,
      makeup_grade: result.makeup_grade,
      final_grade: result.final_grade,
      updated_by: session.user_id,
      updated_at: now
    };
  });
  dbBatchUpsertRows_('SummativeScores', ['student_id', 'subject_id'], upsertRows, 'id', 'ssum');

  appendAuditLog(session.user_id, 'SummativeScores', subject_id, null,
    { class_id: class_id, subject_id: subject_id, rows_saved: rows.length });

  return { ok: true };
}
