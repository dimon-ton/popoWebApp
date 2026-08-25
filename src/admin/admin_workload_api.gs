// US-020: Teacher workload aggregations
// Cached for 60s per FR-18 to keep /admin/workload under 3s

var WORKLOAD_CACHE_KEY = 'workload_v1';
var WORKLOAD_CACHE_TTL = 60; // seconds

function getWorkloadData_() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get(WORKLOAD_CACHE_KEY);
  if (cached) {
    return JSON.parse(cached);
  }

  var teachers = dbGetAll('Users').filter(function(u) { return u.role === 'teacher'; });
  var enrollments = dbGetAll('Enrollments');
  var subjects = {};
  dbGetAll('Subjects').forEach(function(s) { subjects[s.subject_id] = s; });
  var classRows = dbGetAll('Classes');
  var levelCounts = buildClassLevelCounts(classRows);
  var classes = {};
  classRows.forEach(function(c) { classes[c.class_id] = c; });
  var students = dbGetAll('Students');

  // Build student count per class (distinct)
  var studentsPerClass = {};
  students.forEach(function(s) {
    if (!studentsPerClass[s.class_id]) studentsPerClass[s.class_id] = 0;
    studentsPerClass[s.class_id]++;
  });

  // Group enrollments by teacher
  var enrollmentsByTeacher = {};
  teachers.forEach(function(t) { enrollmentsByTeacher[t.user_id] = []; });
  enrollments.forEach(function(e) {
    if (enrollmentsByTeacher[e.teacher_user_id] !== undefined) {
      enrollmentsByTeacher[e.teacher_user_id].push(e);
    }
  });

  var result = teachers.map(function(t) {
    var pairs = enrollmentsByTeacher[t.user_id] || [];
    var subjectNames = [];
    var classesCountedForStudents = {};
    var totalStudents = 0;

    pairs.forEach(function(e) {
      var sub = subjects[e.subject_id];
      var cls = classes[e.class_id] || {};
      var classLabel = fmtClassLabelWithCounts(cls.level, cls.section, levelCounts);
      if (sub) subjectNames.push((sub.subject_name || e.subject_id) + (classLabel ? ' - ' + classLabel : ''));
      // Count distinct classes for student totals
      if (!classesCountedForStudents[e.class_id]) {
        classesCountedForStudents[e.class_id] = true;
        totalStudents += (studentsPerClass[e.class_id] || 0);
      }
    });

    return {
      user_id: t.user_id,
      full_name: t.full_name,
      pair_count: pairs.length,
      subject_names: subjectNames.join(', '),
      student_count: totalStudents,
      pairs: pairs.map(function(e) {
        var cls = classes[e.class_id] || {};
        var sub = subjects[e.subject_id] || {};
        var classLabel = fmtClassLabelWithCounts(cls.level, cls.section, levelCounts);
        return {
          class_id: e.class_id,
          class_label: classLabel,
          subject_id: e.subject_id,
          subject_name: sub.subject_name || e.subject_id,
          subject_title: (sub.subject_name || e.subject_id) + (classLabel ? ' - ' + classLabel : '')
        };
      })
    };
  });

  // Sort by pair_count descending (FR-US-020)
  result.sort(function(a, b) { return b.pair_count - a.pair_count; });

  var payload = { teachers: result };
  cache.put(WORKLOAD_CACHE_KEY, JSON.stringify(payload), WORKLOAD_CACHE_TTL);
  return payload;
}

function invalidateWorkloadCache() {
  CacheService.getScriptCache().remove(WORKLOAD_CACHE_KEY);
}

function clientGetWorkloadData(token) {
  try {
    var session = getSession(token);
    requireAdmin(session);
    return getWorkloadData_();
  } catch (err) {
    return { error: err.message };
  }
}

function clientGetTeacherOwnClasses(token) {
  try {
    var session = getSession(token);
    if (!session) throw new Error('กรุณาเข้าสู่ระบบ');

    var enrollments = dbGetAll('Enrollments').filter(function(e) {
      return e.teacher_user_id === session.user_id;
    });

    var subjects = {};
    dbGetAll('Subjects').forEach(function(s) { subjects[s.subject_id] = s; });
    var classRows = dbGetAll('Classes');
    var levelCounts = buildClassLevelCounts(classRows);
    var classes = {};
    classRows.forEach(function(c) { classes[c.class_id] = c; });
    var students = dbGetAll('Students');
    var studentsPerClass = {};
    students.forEach(function(s) {
      if (!studentsPerClass[s.class_id]) studentsPerClass[s.class_id] = 0;
      studentsPerClass[s.class_id]++;
    });

    var pairs = enrollments.map(function(e) {
      var cls = classes[e.class_id] || {};
      var sub = subjects[e.subject_id] || {};
      return {
        class_id: e.class_id,
        class_label: fmtClassLabelWithCounts(cls.level, cls.section, levelCounts),
        subject_id: e.subject_id,
        subject_name: sub.subject_name || e.subject_id,
        student_count: studentsPerClass[e.class_id] || 0
      };
    });

    return { pairs: pairs };
  } catch (err) {
    return { error: err.message };
  }
}
