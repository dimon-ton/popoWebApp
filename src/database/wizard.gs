// US-017: First-run setup wizard server functions

function isFirstRun() {
  var id = PropertiesService.getScriptProperties().getProperty('DB_SHEET_ID');
  return !id;
}

// Step 1: create the DB sheet and seed the default admin
function wizardCreateDatabase() {
  try {
    var result = setupDatabase();
    return { ok: true, sheetUrl: result.url };
  } catch (err) {
    return { error: err.message };
  }
}

// Step 2: save school info (SchoolInfo tab row)
function wizardSaveSchoolInfo(school_name, district, province, academic_year) {
  try {
    var sheet = getSheet('SchoolInfo');
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      sheet.appendRow([school_name, district, province, academic_year]);
    } else {
      sheet.getRange(2, 1, 1, 4).setValues([[school_name, district, province, academic_year]]);
    }
    try { CacheService.getScriptCache().remove('school_name'); } catch(e) {}
    return { ok: true };
  } catch (err) {
    return { error: err.message };
  }
}
