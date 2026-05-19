// FR-14: Test API — Bearer token gated endpoint for Playwright seed/cleanup
// Token is set in Script Properties as TEST_API_TOKEN
// Kill-switch: TEST_API_ENABLED=false

function handleTestApi(e) {
  var props = PropertiesService.getScriptProperties();

  // Kill-switch
  if (props.getProperty('TEST_API_ENABLED') === 'false') {
    return ContentService.createTextOutput(JSON.stringify({ error: 'Test API disabled' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // Bearer token check
  var authHeader = e.parameter.auth_token || '';
  var expected = props.getProperty('TEST_API_TOKEN') || '';
  if (!expected || authHeader !== expected) {
    return ContentService.createTextOutput(JSON.stringify({ error: 'Unauthorized' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  var api = e.parameter.api;
  var params = e.parameter;

  // Guard: all IDs must start with test_
  function ensureTestPrefix(val) {
    if (val && String(val).indexOf('test_') !== 0) {
      throw new Error('Test API: ID must start with test_. Got: ' + val);
    }
  }

  try {
    switch (api) {
      case 'seed_class':
        ensureTestPrefix(params.class_id);
        dbInsert('Classes', {
          class_id: params.class_id,
          level: params.level || 'ป.1',
          section: params.section || '1',
          homeroom_teacher_user_id: params.homeroom || ''
        });
        return jsonOk({ class_id: params.class_id });

      case 'seed_subject':
        ensureTestPrefix(params.subject_id);
        dbInsert('Subjects', {
          subject_id: params.subject_id,
          subject_name: params.name || params.subject_id,
          subject_code: params.code || 'TST0000',
          hours_per_year: params.hours || 40,
          weight_group: params.group || 1,
          description: ''
        });
        return jsonOk({ subject_id: params.subject_id });

      case 'seed_student':
        ensureTestPrefix(params.student_id);
        dbInsert('Students', {
          student_id: params.student_id,
          class_id: params.class_id,
          seq_no: params.seq || 99,
          student_code: params.student_id,
          citizen_id: '',
          full_name: params.full_name || params.student_id,
          dob: '',
          note: 'test'
        });
        return jsonOk({ student_id: params.student_id });

      case 'seed_user':
        ensureTestPrefix(params.user_id);
        var salt = Utilities.getUuid();
        var hash = computeHash(params.password || 'test1234', salt);
        dbInsert('Users', {
          user_id: params.user_id,
          username: params.user_id,
          password_hash: hash,
          salt: salt,
          full_name: params.full_name || params.user_id,
          role: params.role || 'teacher',
          created_at: new Date().toISOString()
        });
        return jsonOk({ user_id: params.user_id });

      case 'seed_enrollment':
        ensureTestPrefix(params.enrollment_id);
        dbInsert('Enrollments', {
          enrollment_id: params.enrollment_id,
          class_id: params.class_id,
          subject_id: params.subject_id,
          teacher_user_id: params.teacher_user_id,
          dev_activity_result: ''
        });
        return jsonOk({ enrollment_id: params.enrollment_id });

      case 'cleanup':
        var count = 0;
        var tabIdFields = {
          'Classes': 'class_id',
          'Subjects': 'subject_id',
          'Students': 'student_id',
          'Users': 'user_id',
          'Enrollments': 'enrollment_id',
          'Indicators': 'indicator_id',
          'Attendance': 'attendance_id',
          'IndicatorScores': 'id',
          'SummativeScores': 'id',
          'Characteristics': 'id',
          'ReadThinkWrite': 'id',
          'AuditLog': 'user_id'
        };
        Object.keys(tabIdFields).forEach(function(tab) {
          try {
            count += dbDeleteWhere(tab, tabIdFields[tab], 'test_');
          } catch (err) {
            // Ignore missing tabs during cleanup
          }
        });
        // Also clean Users by username prefix (catches UI-created test accounts)
        try { count += dbDeleteWhere('Users', 'username', 'test_'); } catch (err) {}
        return jsonOk({ deleted: count });

      case 'query_rows':
        // Returns all rows from a tab matching prefix (for assertions)
        var tab = params.tab;
        var field = params.field;
        var prefix = params.prefix || 'test_';
        var allRows = dbGetAll(tab);
        var matching = allRows.filter(function(r) { return String(r[field]).indexOf(prefix) === 0; });
        return jsonOk({ rows: matching, count: matching.length });

      default:
        return ContentService.createTextOutput(JSON.stringify({ error: 'Unknown api: ' + api }))
          .setMimeType(ContentService.MimeType.JSON);
    }
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function jsonOk(data) {
  data.ok = true;
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
