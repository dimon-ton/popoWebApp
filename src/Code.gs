// Entry point for the Apps Script web app
// Handles routing based on `page` parameter and auth checks

var APP_TITLE = 'ระบบจัดการ ปพ.5 ออนไลน์ — โรงเรียนบ้านโพนแท่น';
var APP_FAVICON_URL = 'https://raw.githubusercontent.com/dimon-ton/popoWebApp/master/new-circular-logo.png';

function doGet(e) {
  try {
    var params = e ? e.parameter : {};
    var page = params.page || 'login';

    // Handle test API endpoint (FR-14)
    if (params.api) {
      return handleTestApi(e);
    }

    // US-017: If DB_SHEET_ID is not set, show the first-run setup wizard
    if (isFirstRun() && page !== 'setup_wizard') {
      return buildPage('setup_wizard', {});
    }

    var session = getSession(params.token);

    // Unauthenticated: show login (wizard page is accessible without auth)
    if (!session && page !== 'login' && page !== 'setup_wizard') {
      return buildPage('login', { error: null });
    }

    // Admin-only pages
    var adminPages = ['admin_enrollments', 'admin_workload', 'admin_users', 'admin_setup', 'admin_db_status', 'admin_school', 'admin_classes', 'admin_subjects', 'admin_indicators', 'admin_weights', 'admin_audit'];
    if (adminPages.indexOf(page) !== -1) {
      if (!session || session.role !== 'admin') {
        return buildPage('403', { message: 'คุณไม่มีสิทธิ์เข้าถึงหน้านี้' });
      }
    }

    // Handle read-action JSON calls (from client JS)
    var readAction = params.action;
    if (readAction && session) {
      return handleReadAction(readAction, params, session);
    }

    var token = params.token || '';
    switch (page) {
      case 'setup_wizard':
        return buildPage('setup_wizard', {});
      case 'login':
        return buildPage('login', { error: null });
      case 'admin_enrollments':
        return buildPage('admin_enrollments', { session: session, token: token });
      case 'admin_workload':
        return buildPage('admin_workload', { session: session, token: token, web_app_url: ScriptApp.getService().getUrl() });
      case 'admin_users':
        return buildPage('admin_users', { session: session, token: token });
      case 'admin_setup':
        return buildPage('admin_setup', { session: session, token: token });
      case 'admin_db_status':
        return buildPage('admin_db_status', { session: session, token: token });
      case 'admin_school':
        return buildPage('admin_school', { session: session, token: token });
      case 'admin_classes':
        return buildPage('admin_classes', { session: session, token: token });
      case 'admin_subjects':
        return buildPage('admin_subjects', { session: session, token: token });
      case 'admin_indicators':
        return buildPage('admin_indicators', {
          session: session, token: token,
          subject_id: params.subject_id || '',
          subject_name: params.subject_name || params.subject_id || ''
        });
      case 'admin_weights':
        return buildPage('admin_weights', { session: session, token: token });
      case 'admin_audit':
        return buildPage('admin_audit', { session: session, token: token });
      case 'class_students':
        return buildPage('class_students', { session: session, token: token, class_id: params.class_id || '' });
      case 'class_attendance':
        return buildPage('class_attendance', {
          session: session, token: token,
          class_id: params.class_id || '',
          subject_id: params.subject_id || '',
          week: parseInt(params.week) || 1
        });
      case 'class_formative':
        return buildPage('class_formative', {
          session: session, token: token,
          class_id: params.class_id || '',
          subject_id: params.subject_id || ''
        });
      case 'class_summative':
        return buildPage('class_summative', {
          session: session, token: token,
          class_id: params.class_id || '',
          subject_id: params.subject_id || ''
        });
      case 'class_characteristics':
        return buildPage('class_characteristics', {
          session: session, token: token,
          class_id: params.class_id || '',
          subject_id: params.subject_id || ''
        });
      case 'class_readthinkwrite':
        return buildPage('class_readthinkwrite', {
          session: session, token: token,
          class_id: params.class_id || '',
          subject_id: params.subject_id || ''
        });
      case 'class_report':
        return buildPage('class_report', {
          session: session, token: token,
          class_id: params.class_id || '',
          subject_id: params.subject_id || ''
        });
      case 'help':
        return buildPage('help', { session: session, token: token });
      case 'weights_ref':
        return buildPage('weights_ref', { session: session, token: token });
      case 'subject_description':
        return buildPage('subject_description', {
          session: session, token: token,
          subject_id: params.subject_id || ''
        });
      case 'subject_indicators_ref':
        return buildPage('subject_indicators_ref', {
          session: session, token: token,
          subject_id: params.subject_id || ''
        });
      case 'dashboard':
        return buildPage('dashboard', { session: session, token: token, web_app_url: ScriptApp.getService().getUrl() });
      default:
        return buildPage('404', { message: 'ไม่พบหน้าที่ต้องการ' });
    }
  } catch (err) {
    return HtmlService.createHtmlOutput(
      '<div style="font-family:sans-serif;padding:32px;color:#c0392b">' +
      '<b>เกิดข้อผิดพลาด (GET):</b> ' + err.message + '</div>'
    ).setTitle(APP_TITLE).setFaviconUrl(APP_FAVICON_URL).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
}

function doPost(e) {
  try {
    var params = e ? e.parameter : {};
    var action = params.action || '';

    if (action === 'login') {
      return handleLogin(e);
    }

    var session = getSession(params.token);
    if (!session) {
      return ContentService.createTextOutput(JSON.stringify({ error: 'Unauthorized' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    switch (action) {
      // Enrollments (US-018)
      case 'add_enrollment':
        return handleAddEnrollment(e, session);
      case 'remove_enrollment':
        return handleRemoveEnrollment(e, session);
      case 'confirm_reassign':
        return handleConfirmReassign(e, session);
      // Bulk assign (US-019)
      case 'bulk_assign':
        return handleBulkAssign(e, session);
      // User management (US-003)
      case 'add_user':
        requireAdmin(session);
        return ContentService.createTextOutput(JSON.stringify(
          serverAddUser(params.username, params.full_name, params.role, params.password)
        )).setMimeType(ContentService.MimeType.JSON);
      case 'reset_password':
        requireAdmin(session);
        return ContentService.createTextOutput(JSON.stringify(
          serverResetPassword(params.user_id, params.new_password)
        )).setMimeType(ContentService.MimeType.JSON);
      default:
        return ContentService.createTextOutput(JSON.stringify({ error: 'Unknown action' }))
          .setMimeType(ContentService.MimeType.JSON);
    }
  } catch (err) {
    return HtmlService.createHtmlOutput(
      '<div style="font-family:sans-serif;padding:32px;color:#c0392b">' +
      '<b>เกิดข้อผิดพลาด:</b> ' + err.message + '</div>'
    ).setTitle(APP_TITLE).setFaviconUrl(APP_FAVICON_URL).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
}

function buildPage(pageName, data) {
  var template = HtmlService.createTemplateFromFile(pageName);
  template.data = data || {};
  return template.evaluate()
    .setTitle(APP_TITLE)
    .setFaviconUrl(APP_FAVICON_URL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function fmtClassLabel(level, section) {
  if (!section || section === '1') return level || '';
  return (level || '') + '/' + section;
}

function getDashboardHtml(token) {
  var session = getSession(token);
  if (!session) return HtmlService.createTemplateFromFile('login').evaluate().getContent();
  var user = dbFindOne('Users', 'user_id', session.user_id);
  if (user) session.avatar = user.avatar || '';
  var tmpl = HtmlService.createTemplateFromFile('dashboard');
  tmpl.data = { session: session, token: token };
  return tmpl.evaluate().getContent();
}

// Generic page navigation — returns HTML string for document.write() navigation
function getPageHtml(token, page) {
  try {
    var session = getSession(token);
    if (!session) {
      return HtmlService.createTemplateFromFile('login').evaluate().getContent();
    }
    var adminPages = ['admin_enrollments', 'admin_workload', 'admin_users', 'admin_setup', 'admin_db_status', 'admin_school', 'admin_classes', 'admin_subjects', 'admin_indicators', 'admin_weights', 'admin_audit'];
    if (adminPages.indexOf(page) !== -1 && session.role !== 'admin') {
      return '<div style="font-family:sans-serif;padding:32px;color:#c0392b">คุณไม่มีสิทธิ์เข้าถึงหน้านี้</div>';
    }
    var user = dbFindOne('Users', 'user_id', session.user_id);
    if (user) session.avatar = user.avatar || '';
    var tmpl = HtmlService.createTemplateFromFile(page);
    tmpl.data = { session: session, token: token };
    return tmpl.evaluate().getContent();
  } catch (err) {
    return '<div style="font-family:sans-serif;padding:32px;color:#c0392b"><b>Error:</b> ' + err.message + '</div>';
  }
}

function getPageHtmlWithParams(token, page, classId, subjectId) {
  try {
    var session = getSession(token);
    if (!session) {
      return HtmlService.createTemplateFromFile('login').evaluate().getContent();
    }
    var user = dbFindOne('Users', 'user_id', session.user_id);
    if (user) session.avatar = user.avatar || '';
    var templateMap = {
      'class_students': 'class_students',
      'class_attendance': 'class_attendance',
      'class_formative': 'class_formative',
      'class_summative': 'class_summative',
      'class_characteristics': 'class_characteristics',
      'class_readthinkwrite': 'class_readthinkwrite',
      'class_report': 'class_report'
    };
    var tmplName = templateMap[page];
    if (!tmplName) return '<div style="font-family:sans-serif;padding:32px;color:#c0392b">ไม่พบหน้า: ' + page + '</div>';
    var tmpl = HtmlService.createTemplateFromFile(tmplName);
    tmpl.data = { session: session, token: token, class_id: classId || '', subject_id: subjectId || '' };
    return tmpl.evaluate().getContent();
  } catch (err) {
    return '<div style="font-family:sans-serif;padding:32px;color:#c0392b"><b>Error:</b> ' + err.message + '</div>';
  }
}

// US-005: navigate to class students page — carries class_id parameter
function getClassStudentsPageHtml(token, class_id) {
  try {
    var session = getSession(token);
    if (!session) {
      return HtmlService.createTemplateFromFile('login').evaluate().getContent();
    }
    var tmpl = HtmlService.createTemplateFromFile('class_students');
    tmpl.data = { session: session, token: token, class_id: class_id || '' };
    return tmpl.evaluate().getContent();
  } catch (err) {
    return '<div style="font-family:sans-serif;padding:32px;color:#c0392b"><b>Error:</b> ' + err.message + '</div>';
  }
}

// US-007: navigate to attendance page for a specific (class, subject, week)
function getAttendancePageHtml(token, class_id, subject_id, week) {
  try {
    var session = getSession(token);
    if (!session) {
      return HtmlService.createTemplateFromFile('login').evaluate().getContent();
    }
    var tmpl = HtmlService.createTemplateFromFile('class_attendance');
    tmpl.data = { session: session, token: token, class_id: class_id || '', subject_id: subject_id || '', week: parseInt(week) || 1 };
    return tmpl.evaluate().getContent();
  } catch (err) {
    return '<div style="font-family:sans-serif;padding:32px;color:#c0392b"><b>Error:</b> ' + err.message + '</div>';
  }
}

// US-009: navigate to summative scoring page for a specific (class, subject)
function getSummativePageHtml(token, class_id, subject_id) {
  try {
    var session = getSession(token);
    if (!session) {
      return HtmlService.createTemplateFromFile('login').evaluate().getContent();
    }
    var tmpl = HtmlService.createTemplateFromFile('class_summative');
    tmpl.data = { session: session, token: token, class_id: class_id || '', subject_id: subject_id || '' };
    return tmpl.evaluate().getContent();
  } catch (err) {
    return '<div style="font-family:sans-serif;padding:32px;color:#c0392b"><b>Error:</b> ' + err.message + '</div>';
  }
}

// US-011: navigate to characteristics scoring page for a specific (class, subject)
function getCharacteristicsPageHtml(token, class_id, subject_id) {
  try {
    var session = getSession(token);
    if (!session) {
      return HtmlService.createTemplateFromFile('login').evaluate().getContent();
    }
    var tmpl = HtmlService.createTemplateFromFile('class_characteristics');
    tmpl.data = { session: session, token: token, class_id: class_id || '', subject_id: subject_id || '' };
    return tmpl.evaluate().getContent();
  } catch (err) {
    return '<div style="font-family:sans-serif;padding:32px;color:#c0392b"><b>Error:</b> ' + err.message + '</div>';
  }
}

// US-012: navigate to read-think-write scoring page for a specific (class, subject)
function getReadThinkWritePageHtml(token, class_id, subject_id) {
  try {
    var session = getSession(token);
    if (!session) {
      return HtmlService.createTemplateFromFile('login').evaluate().getContent();
    }
    var tmpl = HtmlService.createTemplateFromFile('class_readthinkwrite');
    tmpl.data = { session: session, token: token, class_id: class_id || '', subject_id: subject_id || '' };
    return tmpl.evaluate().getContent();
  } catch (err) {
    return '<div style="font-family:sans-serif;padding:32px;color:#c0392b"><b>Error:</b> ' + err.message + '</div>';
  }
}

// US-013: navigate to cover report page for a specific (class, subject)
function getReportPageHtml(token, class_id, subject_id) {
  try {
    var session = getSession(token);
    if (!session) {
      return HtmlService.createTemplateFromFile('login').evaluate().getContent();
    }
    var tmpl = HtmlService.createTemplateFromFile('class_report');
    tmpl.data = { session: session, token: token, class_id: class_id || '', subject_id: subject_id || '' };
    return tmpl.evaluate().getContent();
  } catch (err) {
    return '<div style="font-family:sans-serif;padding:32px;color:#c0392b"><b>Error:</b> ' + err.message + '</div>';
  }
}

// US-008: navigate to formative scoring page for a specific (class, subject)
function getFormativePageHtml(token, class_id, subject_id) {
  try {
    var session = getSession(token);
    if (!session) {
      return HtmlService.createTemplateFromFile('login').evaluate().getContent();
    }
    var tmpl = HtmlService.createTemplateFromFile('class_formative');
    tmpl.data = { session: session, token: token, class_id: class_id || '', subject_id: subject_id || '' };
    return tmpl.evaluate().getContent();
  } catch (err) {
    return '<div style="font-family:sans-serif;padding:32px;color:#c0392b"><b>Error:</b> ' + err.message + '</div>';
  }
}

// US-006: navigate to indicators page for a specific subject
function getIndicatorsPageHtml(token, subject_id) {
  try {
    var session = getSession(token);
    if (!session) {
      return HtmlService.createTemplateFromFile('login').evaluate().getContent();
    }
    if (session.role !== 'admin') {
      return '<div style="font-family:sans-serif;padding:32px;color:#c0392b">คุณไม่มีสิทธิ์เข้าถึงหน้านี้</div>';
    }
    var subj = dbFindOne('Subjects', 'subject_id', subject_id);
    var subject_name = subj ? subj.subject_name : subject_id;
    var tmpl = HtmlService.createTemplateFromFile('admin_indicators');
    tmpl.data = { session: session, token: token, subject_id: subject_id, subject_name: subject_name };
    return tmpl.evaluate().getContent();
  } catch (err) {
    return '<div style="font-family:sans-serif;padding:32px;color:#c0392b"><b>Error:</b> ' + err.message + '</div>';
  }
}

// US-015: navigate to subject description reference page (any logged-in user)
function getSubjectDescriptionPageHtml(token, subject_id) {
  try {
    var session = getSession(token);
    if (!session) {
      return HtmlService.createTemplateFromFile('login').evaluate().getContent();
    }
    var tmpl = HtmlService.createTemplateFromFile('subject_description');
    tmpl.data = { session: session, token: token, subject_id: subject_id || '' };
    return tmpl.evaluate().getContent();
  } catch (err) {
    return '<div style="font-family:sans-serif;padding:32px;color:#c0392b"><b>Error:</b> ' + err.message + '</div>';
  }
}

// US-015: navigate to subject indicators reference page (any logged-in user)
function getSubjectIndicatorsRefPageHtml(token, subject_id) {
  try {
    var session = getSession(token);
    if (!session) {
      return HtmlService.createTemplateFromFile('login').evaluate().getContent();
    }
    var tmpl = HtmlService.createTemplateFromFile('subject_indicators_ref');
    tmpl.data = { session: session, token: token, subject_id: subject_id || '' };
    return tmpl.evaluate().getContent();
  } catch (err) {
    return '<div style="font-family:sans-serif;padding:32px;color:#c0392b"><b>Error:</b> ' + err.message + '</div>';
  }
}

// US-001: returns row counts for all DB tabs (admin-only, dev tool)
function getDbStatus() {
  var id = PropertiesService.getScriptProperties().getProperty('DB_SHEET_ID');
  if (!id) throw new Error('DB_SHEET_ID not set. Run setupDatabase() first.');
  var ss = SpreadsheetApp.openById(id);
  return TAB_ORDER.map(function(tabName) {
    var sheet = ss.getSheetByName(tabName);
    var count = sheet ? sheet.getLastRow() : 0;
    return { tab: tabName, count: count };
  });
}

function handleReadAction(action, params, session) {
  try {
    var result;
    switch (action) {
      case 'get_users_list':
        requireAdmin(session);
        result = { users: getUsersList() };
        break;
      case 'get_enrollments_data':
        requireAdmin(session);
        result = getEnrollmentsData();
        break;
      case 'get_teacher_enrollments':
        requireAdmin(session);
        result = { enrollments: getTeacherEnrollments(params.teacher_user_id) };
        break;
      case 'get_all_pairs_matrix':
        requireAdmin(session);
        result = { rows: getAllPairsMatrix() };
        break;
      case 'get_workload_data':
        requireAdmin(session);
        result = getWorkloadData();
        break;
      default:
        result = { error: 'Unknown read action: ' + action };
    }
    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
