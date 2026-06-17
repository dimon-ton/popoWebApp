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
        dbDelete('Classes', 'class_id', params.class_id);
        dbInsert('Classes', {
          class_id: params.class_id,
          level: params.level || 'ป.1',
          section: params.section || '1',
          homeroom_teacher_user_id: params.homeroom || ''
        });
        return jsonOk({ class_id: params.class_id });

      case 'seed_subject':
        ensureTestPrefix(params.subject_id);
        ensureSubjectsSchema();
        dbDelete('Subjects', 'subject_id', params.subject_id);
        dbInsert('Subjects', {
          subject_id: params.subject_id,
          class_id: params.class_id || '',
          subject_name: params.name || params.subject_id,
          subject_code: params.code || 'TST0000',
          hours_per_year: params.hours || 40,
          weight_group: params.group || 1
        });
        return jsonOk({ subject_id: params.subject_id });

      case 'seed_student':
        ensureTestPrefix(params.student_id);
        dbDelete('Students', 'student_id', params.student_id);
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
        dbDelete('Users', 'user_id', params.user_id);
        dbDelete('Users', 'username', params.user_id);
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
        dbDelete('Enrollments', 'enrollment_id', params.enrollment_id);
        dbInsert('Enrollments', {
          enrollment_id: params.enrollment_id,
          class_id: params.class_id,
          subject_id: params.subject_id,
          teacher_user_id: params.teacher_user_id,
          dev_activity_result: ''
        });
        return jsonOk({ enrollment_id: params.enrollment_id });

      case 'seed_subject_weights':
        ensureTestPrefix(params.subject_id);
        // Upsert: delete existing then insert
        dbDeleteWhere('SubjectWeights', 'subject_id', params.subject_id);
        dbInsert('SubjectWeights', {
          subject_id: params.subject_id,
          coursework_max: parseInt(params.coursework_max) || 70,
          final_max: parseInt(params.final_max) || 30,
          pre_mid_max: parseInt(params.pre_mid_max) || 25,
          mid_max: parseInt(params.mid_max) || 20,
          post_mid_max: parseInt(params.post_mid_max) || 25,
          final_exam_max: parseInt(params.final_exam_max) || 30
        });
        return jsonOk({ subject_id: params.subject_id });

      case 'seed_indicator':
        ensureTestPrefix(params.indicator_id);
        dbDelete('Indicators', 'indicator_id', params.indicator_id);
        dbInsert('Indicators', {
          indicator_id: params.indicator_id,
          subject_id: params.subject_id,
          code: params.code || params.indicator_id,
          description: params.description || '',
          max_score: parseInt(params.max_score) || 3,
          display_order: parseInt(params.display_order) || 1
        });
        return jsonOk({ indicator_id: params.indicator_id });

      case 'seed_summative':
        // Seed a SummativeScores row directly (for report aggregate tests)
        // student_id must start with test_; id is auto-generated
        ensureTestPrefix(params.student_id);
        dbDeleteWhere('SummativeScores', 'student_id', params.student_id);
        var sTotal = parseFloat(params.total) || 0;
        var sGrade = computeGrade(sTotal);
        var sMakeup = params.makeup_grade !== '' && params.makeup_grade !== undefined ? parseFloat(params.makeup_grade) : '';
        var sFinalGrade = (sMakeup !== '' && !isNaN(sMakeup)) ? sMakeup : sGrade;
        dbInsert('SummativeScores', {
          id: generateId('ssum'),
          student_id: params.student_id,
          subject_id: params.subject_id,
          coursework: params.coursework || '',
          midterm: params.midterm || '',
          final: params.final || '',
          total: sTotal,
          computed_grade: sGrade,
          makeup_grade: sMakeup,
          final_grade: sFinalGrade,
          updated_by: 'test_api',
          updated_at: new Date().toISOString()
        });
        return jsonOk({ student_id: params.student_id, final_grade: sFinalGrade });

      case 'cleanup':
        var count = 0;
        var tabIdFields = {
          'Classes': 'class_id',
          'Subjects': 'subject_id',
          'SubjectWeights': 'subject_id',
          'Students': 'student_id',
          'Users': 'user_id',
          'Enrollments': 'enrollment_id',
          'Indicators': 'indicator_id',
          'Attendance': 'attendance_id',
          'IndicatorScores': 'id',
          'SummativeScores': 'id',
          'Characteristics': 'id',
          'ReadThinkWrite': 'id',
          'AuditLog': 'user_id',
          'DevActivity': 'id'
        };
        Object.keys(tabIdFields).forEach(function(tab) {
          if (tab === 'Enrollments' || tab === 'AuditLog') return;
          try {
            count += dbDeleteWhere(tab, tabIdFields[tab], 'test_');
            if (tab === 'Classes') {
              count += dbDeleteWhere(tab, tabIdFields[tab], 'class_test_');
            }
          } catch (err) {
            // Ignore missing tabs during cleanup
          }
        });
        // Also clean Users by username prefix (catches UI-created test accounts)
        try { count += dbDeleteWhere('Users', 'username', 'test_'); } catch (err) {}
        // Also clean score tables by student_id prefix (IDs are auto-generated, not test_-prefixed)
        var scoreTabs = ['IndicatorScores', 'SummativeScores', 'Characteristics', 'ReadThinkWrite', 'Attendance', 'DevActivity'];
        scoreTabs.forEach(function(tab) {
          try { count += dbDeleteWhere(tab, 'student_id', 'test_'); } catch (err) {}
        });

        // Clean Enrollments where class_id, subject_id, teacher_user_id, or enrollment_id starts with 'test_'
        try {
          var enrSheet = getSheet('Enrollments');
          var enrData = enrSheet.getDataRange().getValues();
          var enrHeaders = enrData[0];
          var classCol = enrHeaders.indexOf('class_id');
          var subjCol = enrHeaders.indexOf('subject_id');
          var teachCol = enrHeaders.indexOf('teacher_user_id');
          var enrIdCol = enrHeaders.indexOf('enrollment_id');
          
          var lock = LockService.getDocumentLock();
          if (lock.tryLock(30000)) {
            try {
              for (var i = enrData.length - 1; i >= 1; i--) {
                var isTest = String(enrData[i][classCol]).indexOf('test_') === 0 ||
                             String(enrData[i][classCol]).indexOf('class_test_') === 0 ||
                             String(enrData[i][subjCol]).indexOf('test_') === 0 ||
                             String(enrData[i][teachCol]).indexOf('test_') === 0 ||
                             String(enrData[i][enrIdCol]).indexOf('test_') === 0;
                if (isTest) {
                  enrSheet.deleteRow(i + 1);
                  count++;
                }
              }
            } finally {
              lock.releaseLock();
            }
          }
        } catch (err) {
          // Ignore
        }

        // Clean AuditLog where user_id starts with test_ OR entity_id starts with test_ OR old_value/new_value contains 'test_'
        try {
          var auditSheet = getSheet('AuditLog');
          var auditData = auditSheet.getDataRange().getValues();
          var auditHeaders = auditData[0];
          var uCol = auditHeaders.indexOf('user_id');
          var eCol = auditHeaders.indexOf('entity_id');
          var oCol = auditHeaders.indexOf('old_value');
          var nCol = auditHeaders.indexOf('new_value');
          
          var lock = LockService.getDocumentLock();
          if (lock.tryLock(30000)) {
            try {
              for (var i = auditData.length - 1; i >= 1; i--) {
                var isTest = String(auditData[i][uCol]).indexOf('test_') === 0 ||
                             String(auditData[i][eCol]).indexOf('test_') === 0 ||
                             String(auditData[i][oCol]).indexOf('test_') !== -1 ||
                             String(auditData[i][nCol]).indexOf('test_') !== -1;
                if (isTest) {
                  auditSheet.deleteRow(i + 1);
                  count++;
                }
              }
            } finally {
              lock.releaseLock();
            }
          }
        } catch (err) {
          // Ignore
        }

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
