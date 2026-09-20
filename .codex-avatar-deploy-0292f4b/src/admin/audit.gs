// US-016: Audit log — admin-only searchable trail of every data change

// Returns audit log rows filtered by optional criteria.
// filters: { user_id, entity, date_from (ISO), date_to (ISO) }
// Returns up to 500 most-recent rows (newest first).
function getAuditLog(token, filters) {
  var session = getSession(token);
  if (!session) throw new Error('กรุณาเข้าสู่ระบบ');
  if (session.role !== 'admin') throw new Error('ไม่มีสิทธิ์เข้าถึงข้อมูล');

  filters = filters || {};

  var rows = dbGetAll('AuditLog');

  // Filter by user_id prefix match
  if (filters.user_id) {
    var uid = String(filters.user_id).toLowerCase();
    rows = rows.filter(function(r) {
      return String(r.user_id || '').toLowerCase().indexOf(uid) !== -1;
    });
  }

  // Filter by entity exact match
  if (filters.entity) {
    rows = rows.filter(function(r) { return r.entity === filters.entity; });
  }

  // Filter by date range (timestamp column is ISO string)
  if (filters.date_from) {
    var from = new Date(filters.date_from).getTime();
    rows = rows.filter(function(r) {
      var ts = r.timestamp ? new Date(r.timestamp).getTime() : 0;
      return ts >= from;
    });
  }
  if (filters.date_to) {
    // Inclusive: add 1 day to date_to to include the full day
    var to = new Date(filters.date_to).getTime() + 86400000;
    rows = rows.filter(function(r) {
      var ts = r.timestamp ? new Date(r.timestamp).getTime() : 0;
      return ts <= to;
    });
  }

  // Sort newest first
  rows.sort(function(a, b) {
    var ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    var tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return tb - ta;
  });

  // Limit to 500 rows for performance
  if (rows.length > 500) rows = rows.slice(0, 500);

  // Resolve user full_name for display
  var users = dbGetAll('Users');
  var userMap = {};
  users.forEach(function(u) { userMap[u.user_id] = u.full_name || u.username; });

  return rows.map(function(r) {
    return {
      timestamp: r.timestamp,
      user_id: r.user_id,
      user_name: userMap[r.user_id] || r.user_id,
      entity: r.entity,
      entity_id: r.entity_id,
      old_value: r.old_value,
      new_value: r.new_value
    };
  });
}

// Returns the distinct list of entity names present in AuditLog (for filter dropdown).
function getAuditEntities(token) {
  var session = getSession(token);
  if (!session) throw new Error('กรุณาเข้าสู่ระบบ');
  if (session.role !== 'admin') throw new Error('ไม่มีสิทธิ์เข้าถึงข้อมูล');

  var rows = dbGetAll('AuditLog');
  var seen = {};
  rows.forEach(function(r) { if (r.entity) seen[r.entity] = true; });
  return Object.keys(seen).sort();
}
