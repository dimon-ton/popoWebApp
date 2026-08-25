// US-017: First-run setup wizard server functions

function isFirstRun() {
  var id = PropertiesService.getScriptProperties().getProperty('DB_SHEET_ID');
  return !id;
}

// Step 1: create the DB sheet and seed the default admin
function wizardCreateDatabase() {
  try {
    if (!isFirstRun()) throw new Error('ระบบถูกตั้งค่าแล้ว');
    var result = setupDatabase_();
    var setupToken = generateToken();
    PropertiesService.getScriptProperties().setProperty('SETUP_WIZARD_TOKEN', setupToken);
    return { ok: true, sheetUrl: result.url, setup_token: setupToken };
  } catch (err) {
    return { error: err.message };
  }
}

// Step 2: save school info (SchoolInfo tab row)
function wizardSaveSchoolInfo(setup_token, school_name, district, province, academic_year) {
  try {
    var props = PropertiesService.getScriptProperties();
    var expectedToken = props.getProperty('SETUP_WIZARD_TOKEN') || '';
    if (!expectedToken || String(setup_token || '') !== expectedToken) {
      throw new Error('เซสชันตั้งค่าระบบไม่ถูกต้องหรือหมดอายุ');
    }
    var sheet = getSheet('SchoolInfo');
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      sheet.appendRow([school_name, district, province, academic_year]);
    } else {
      sheet.getRange(2, 1, 1, 4).setValues([[school_name, district, province, academic_year]]);
    }
    try { CacheService.getScriptCache().remove('school_name'); } catch(e) {}
    props.deleteProperty('SETUP_WIZARD_TOKEN');
    return { ok: true };
  } catch (err) {
    return { error: err.message };
  }
}
