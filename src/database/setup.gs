// One-time setup script. Run setupDatabase() from the Apps Script editor:
//   1. Open the Apps Script project.
//   2. Select "setupDatabase" in the function dropdown.
//   3. Click Run. Approve the OAuth prompts.
//   4. The script creates a new Google Sheet with all 14 tabs (headers in row 1),
//      seeds a default admin user, and stores the Sheet's ID in
//      Script Property DB_SHEET_ID so the rest of the app finds it.
//
// To re-run safely: setupDatabase() is idempotent — existing tabs are left
// alone, missing tabs are added with the correct headers, and the admin user
// is only re-created if Users is empty. To start over from scratch, delete
// DB_SHEET_ID from Project Settings → Script properties first.

var TAB_SCHEMA = {
  'Users':            ['user_id', 'username', 'password_hash', 'salt', 'full_name', 'role', 'avatar', 'must_change_pwd', 'last_login_at', 'created_at'],
  'SchoolInfo':       ['school_name', 'district', 'province', 'academic_year', 'semester_start_date', 'required_attendance_days', 'semester', 'school_address', 'phone_number', 'education_area', 'school_logo', 'measurement_head_name', 'academic_head_name', 'director_name'],
  'Classes':          ['class_id', 'level', 'section', 'homeroom_teacher_user_id', 'homeroom_teacher_user_ids'],
  'Subjects':         ['subject_id', 'class_id', 'subject_name', 'subject_code', 'hours_per_year', 'weight_group', 'subject_group'],
  'Enrollments':      ['enrollment_id', 'class_id', 'subject_id', 'teacher_user_id', 'dev_activity_result'],
  'Students':         ['student_id', 'class_id', 'seq_no', 'student_code', 'citizen_id', 'full_name', 'dob', 'note'],
  'Indicators':       ['indicator_id', 'subject_id', 'code', 'description', 'max_score', 'display_order'],
  'SubjectWeights':   ['subject_id', 'class_id', 'coursework_max', 'final_max', 'pre_mid_max', 'mid_max', 'post_mid_max', 'final_exam_max'],
  'Attendance':       ['attendance_id', 'student_id', 'subject_id', 'date', 'period', 'status', 'updated_by', 'updated_at'],
  'IndicatorScores':  ['id', 'student_id', 'subject_id', 'indicator_id', 'score', 'updated_by', 'updated_at'],
  'SummativeScores':  ['id', 'student_id', 'subject_id', 'coursework', 'midterm', 'final', 'total', 'computed_grade', 'makeup_grade', 'final_grade', 'updated_by', 'updated_at'],
  'Characteristics':  ['id', 'student_id', 'subject_id', 't1', 't2', 't3', 't4', 't5', 't6', 't7', 't8', 'total', 'label', 'updated_by', 'updated_at'],
  'ReadThinkWrite':   ['id', 'student_id', 'subject_id', 'r1', 'r2', 'r3', 't1', 't2', 't3', 't4', 'w1', 'w2', 'w3', 'total', 'label', 'updated_by', 'updated_at'],
  'AuditLog':         ['timestamp', 'user_id', 'entity', 'entity_id', 'old_value', 'new_value'],
  'DevActivity':      ['id', 'student_id', 'class_id', 'subject_id', 'result', 'updated_by', 'updated_at'],
  'Holidays':         ['holiday_id', 'start_date', 'end_date', 'name', 'type', 'description', 'created_by', 'updated_at']
};

var TAB_ORDER = [
  'Users', 'SchoolInfo', 'Classes', 'Subjects', 'Enrollments',
  'Students', 'Indicators', 'SubjectWeights', 'Attendance',
  'IndicatorScores', 'SummativeScores', 'Characteristics',
  'ReadThinkWrite', 'AuditLog', 'DevActivity', 'Holidays'
];

function setupDatabase() {
  var props = PropertiesService.getScriptProperties();
  var existingId = props.getProperty('DB_SHEET_ID');

  var ss;
  if (existingId) {
    try {
      ss = SpreadsheetApp.openById(existingId);
      Logger.log('Using existing spreadsheet: ' + ss.getName() + ' (' + existingId + ')');
    } catch (err) {
      throw new Error('DB_SHEET_ID is set but the spreadsheet cannot be opened: ' + err.message
        + '. Remove DB_SHEET_ID from Script properties to create a new one.');
    }
  } else {
    ss = SpreadsheetApp.create('PopoWebApp DB');
    props.setProperty('DB_SHEET_ID', ss.getId());
    Logger.log('Created new spreadsheet: ' + ss.getUrl());
  }

  TAB_ORDER.forEach(function(tabName) {
    ensureTab(ss, tabName, TAB_SCHEMA[tabName]);
  });

  // Apps Script's default new Sheet has a tab called "Sheet1" — remove it
  // if it's still hanging around and is empty.
  var defaultSheet = ss.getSheetByName('Sheet1');
  if (defaultSheet && defaultSheet.getLastRow() === 0 && ss.getSheets().length > 1) {
    ss.deleteSheet(defaultSheet);
  }

  // Seed a default admin if Users is empty.
  var usersSheet = ss.getSheetByName('Users');
  if (usersSheet.getLastRow() < 2) {
    seedDefaultAdmin();
  }

  Logger.log('Setup complete.');
  Logger.log('Spreadsheet URL: ' + ss.getUrl());
  Logger.log('DB_SHEET_ID: ' + ss.getId());
  return { url: ss.getUrl(), id: ss.getId() };
}

function ensureTab(ss, tabName, headers) {
  var sheet = ss.getSheetByName(tabName);
  if (!sheet) {
    sheet = ss.insertSheet(tabName);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    Logger.log('Created tab: ' + tabName);
    return;
  }
  // Tab exists — verify headers in row 1 match. If row 1 is empty, write them.
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    Logger.log('Initialized empty existing tab: ' + tabName);
    return;
  }
  var existingHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var missing = headers.filter(function(h) { return existingHeaders.indexOf(h) === -1; });
  if (missing.length > 0) {
    Logger.log('WARNING: tab "' + tabName + '" is missing columns: ' + missing.join(', ')
      + '. Fix the headers in row 1 of that tab before using the app.');
  } else {
    Logger.log('Tab OK: ' + tabName);
  }
}

function seedDefaultAdmin() {
  // Creates a default admin user. CHANGE THE PASSWORD IMMEDIATELY AFTER FIRST LOGIN.
  var defaultPassword = 'admin1234';
  var salt = Utilities.getUuid();
  var hash = computeHash(defaultPassword, salt);
  dbInsert('Users', {
    user_id: 'admin_' + Utilities.getUuid().replace(/-/g, '').substring(0, 8),
    username: 'admin',
    password_hash: hash,
    salt: salt,
    full_name: 'ผู้ดูแลระบบ',
    role: 'admin',
    created_at: new Date().toISOString()
  });
  Logger.log('Seeded default admin — username: admin, password: ' + defaultPassword);
  Logger.log('⚠ CHANGE THIS PASSWORD IMMEDIATELY AFTER FIRST LOGIN.');
}

function setTestApiToken(token) {
  // Convenience for FR-14. Call setTestApiToken('your-secret-here') from the editor.
  if (!token) throw new Error('Provide a non-empty token.');
  PropertiesService.getScriptProperties().setProperty('TEST_API_TOKEN', token);
  Logger.log('TEST_API_TOKEN set.');
}

function disableTestApi() {
  PropertiesService.getScriptProperties().setProperty('TEST_API_ENABLED', 'false');
  Logger.log('Test API disabled.');
}

function enableTestApi() {
  PropertiesService.getScriptProperties().setProperty('TEST_API_ENABLED', 'true');
  Logger.log('Test API enabled.');
}
