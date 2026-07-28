// Thin DB wrapper around Google Sheets
// All writes use LockService per FR-2

var TABS = [
  'Users', 'SchoolInfo', 'Classes', 'Subjects', 'Enrollments',
  'Students', 'Indicators', 'SubjectWeights', 'Attendance',
  'IndicatorScores', 'SummativeScores', 'Characteristics',
  'ReadThinkWrite', 'AuditLog', 'DevActivity', 'Holidays'
];

function getSheet(tabName) {
  var id = PropertiesService.getScriptProperties().getProperty('DB_SHEET_ID');
  var ss = SpreadsheetApp.openById(id);
  var sheet = ss.getSheetByName(tabName);
  if (!sheet) throw new Error('Tab not found: ' + tabName);
  return sheet;
}

function dbGetAll(tabName) {
  var sheet = getSheet(tabName);
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  var headers = data[0];
  return data.slice(1).map(function(row) {
    var obj = {};
    headers.forEach(function(h, i) {
      var v = row[i];
      obj[h] = (v instanceof Date) ? v.toISOString() : v;
    });
    return obj;
  });
}

function dbInsert(tabName, row) {
  var lock = LockService.getDocumentLock();
  if (!lock.tryLock(30000)) throw new Error('Could not acquire lock');
  try {
    var sheet = getSheet(tabName);
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var values = headers.map(function(h) { return row[h] !== undefined ? row[h] : ''; });
    sheet.appendRow(values);
  } finally {
    lock.releaseLock();
  }
}

function dbUpdate(tabName, idField, idValue, updates) {
  var lock = LockService.getDocumentLock();
  if (!lock.tryLock(30000)) throw new Error('Could not acquire lock');
  try {
    var sheet = getSheet(tabName);
    var data = sheet.getDataRange().getValues();
    var headers = data[0];
    var idCol = headers.indexOf(idField);
    if (idCol === -1) throw new Error('ID column not found: ' + idField);
    for (var i = 1; i < data.length; i++) {
      if (data[i][idCol] === idValue) {
        Object.keys(updates).forEach(function(key) {
          var col = headers.indexOf(key);
          if (col !== -1) {
            var range = sheet.getRange(i + 1, col + 1);
            var value = updates[key];
            // Keep application dates in the documented ISO text format. Without
            // this, Sheets may parse yyyy-mm-dd using the sheet locale and return
            // a Date later, which can shift the displayed day through timezone
            // conversion.
            if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
              range.setNumberFormat('@');
            }
            range.setValue(value);
          }
        });
        return true;
      }
    }
    return false;
  } finally {
    lock.releaseLock();
  }
}

function dbDelete(tabName, idField, idValue) {
  var lock = LockService.getDocumentLock();
  if (!lock.tryLock(30000)) throw new Error('Could not acquire lock');
  try {
    var sheet = getSheet(tabName);
    var data = sheet.getDataRange().getValues();
    var headers = data[0];
    var idCol = headers.indexOf(idField);
    if (idCol === -1) throw new Error('ID column not found: ' + idField);
    for (var i = data.length - 1; i >= 1; i--) {
      if (data[i][idCol] === idValue) {
        sheet.deleteRow(i + 1);
        return true;
      }
    }
    return false;
  } finally {
    lock.releaseLock();
  }
}

function dbDeleteWhere(tabName, idField, prefix) {
  // Delete rows where idField starts with prefix (used by test cleanup)
  var lock = LockService.getDocumentLock();
  if (!lock.tryLock(30000)) throw new Error('Could not acquire lock');
  try {
    var sheet = getSheet(tabName);
    var data = sheet.getDataRange().getValues();
    var headers = data[0];
    var idCol = headers.indexOf(idField);
    if (idCol === -1) return 0;
    var deleted = 0;
    for (var i = data.length - 1; i >= 1; i--) {
      var val = String(data[i][idCol]);
      if (val.indexOf(prefix) === 0) {
        sheet.deleteRow(i + 1);
        deleted++;
      }
    }
    return deleted;
  } finally {
    lock.releaseLock();
  }
}

function dbFind(tabName, field, value) {
  var rows = dbGetAll(tabName);
  return rows.filter(function(r) { return r[field] === value; });
}

function dbFindOne(tabName, field, value) {
  var rows = dbFind(tabName, field, value);
  return rows.length > 0 ? rows[0] : null;
}

function ensureColumns(tabName, requiredHeaders) {
  var lock = LockService.getDocumentLock();
  if (!lock.tryLock(30000)) throw new Error('Could not acquire lock');
  try {
    var sheet = getSheet(tabName);
    var lastCol = Math.max(sheet.getLastColumn(), 1);
    var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    requiredHeaders.forEach(function(header) {
      if (headers.indexOf(header) === -1) {
        sheet.getRange(1, headers.length + 1).setValue(header);
        headers.push(header);
      }
    });
  } finally {
    lock.releaseLock();
  }
}

function removeColumns(tabName, obsoleteHeaders) {
  var lock = LockService.getDocumentLock();
  if (!lock.tryLock(30000)) throw new Error('Could not acquire lock');
  try {
    var sheet = getSheet(tabName);
    var lastCol = sheet.getLastColumn();
    if (lastCol < 1) return;
    var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    for (var i = headers.length - 1; i >= 0; i--) {
      if (obsoleteHeaders.indexOf(headers[i]) !== -1) {
        sheet.deleteColumn(i + 1);
      }
    }
  } finally {
    lock.releaseLock();
  }
}

function generateId(prefix) {
  return prefix + '_' + Utilities.getUuid().replace(/-/g, '').substring(0, 12);
}

function appendAuditLog(userId, entity, entityId, oldValue, newValue) {
  dbInsert('AuditLog', {
    timestamp: new Date().toISOString(),
    user_id: userId,
    entity: entity,
    entity_id: entityId,
    old_value: JSON.stringify(oldValue),
    new_value: JSON.stringify(newValue)
  });
}
