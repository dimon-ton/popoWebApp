// Authentication: login, session management, role checks

var SESSION_TTL_SECONDS = 43200; // 12 hours

function ensureUserAuthColumns() {
  ensureColumns('Users', ['avatar', 'must_change_pwd', 'last_login_at']);
}

function isMustChangePassword(value) {
  return value === true || String(value).toLowerCase() === 'true' || String(value) === '1';
}

function buildSessionData(user) {
  return {
    user_id: user.user_id,
    username: user.username,
    full_name: user.full_name,
    avatar: user.avatar || '',
    role: user.role,
    must_change_pwd: isMustChangePassword(user.must_change_pwd),
    expires_at: Date.now() + SESSION_TTL_SECONDS * 1000
  };
}

function handleLogin(e) {
  var params = e.parameter;
  var username = (params.username || '').trim();
  var password = params.password || '';

  if (!username || !password) {
    var tmpl = HtmlService.createTemplateFromFile('login');
    tmpl.data = { error: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน' };
    return tmpl.evaluate().setTitle(APP_TITLE).setFaviconUrl(APP_FAVICON_URL);
  }

  ensureUserAuthColumns();
  var users = dbGetAll('Users');
  var user = null;
  for (var i = 0; i < users.length; i++) {
    if (users[i].username === username) {
      user = users[i];
      break;
    }
  }

  if (!user) {
    return loginError('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
  }

  var hash = computeHash(password, user.salt);
  if (hash !== user.password_hash) {
    return loginError('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
  }

  var token = generateToken();
  var cache = CacheService.getScriptCache();
  var sessionData = JSON.stringify(buildSessionData(user));
  cache.put('session_' + token, sessionData, SESSION_TTL_SECONDS);

  var tmpl = HtmlService.createTemplateFromFile('dashboard');
  tmpl.data = { session: JSON.parse(sessionData), token: token };
  return tmpl.evaluate().setTitle(APP_TITLE).setFaviconUrl(APP_FAVICON_URL);
}

function getSession(token) {
  if (!token) return null;
  var cache = CacheService.getScriptCache();
  var raw = cache.get('session_' + token);
  if (!raw) return null;
  var session = JSON.parse(raw);
  if (Date.now() > session.expires_at) {
    cache.remove('session_' + token);
    return null;
  }
  return session;
}

function requireAdmin(session) {
  if (!session || session.role !== 'admin') {
    throw new Error('Forbidden: admin only');
  }
}

function computeHash(password, salt) {
  var bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    password + salt
  );
  return bytes.map(function(b) {
    return (b < 0 ? b + 256 : b).toString(16).padStart(2, '0');
  }).join('');
}

function generateToken() {
  var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  var result = '';
  for (var i = 0; i < 40; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function loginError(msg) {
  var tmpl = HtmlService.createTemplateFromFile('login');
  tmpl.data = { error: msg };
  return tmpl.evaluate().setTitle(APP_TITLE).setFaviconUrl(APP_FAVICON_URL);
}

function serverLogout(token) {
  if (token) {
    CacheService.getScriptCache().remove('session_' + token);
  }
  return { ok: true };
}

function getLoginHtml() {
  var tmpl = HtmlService.createTemplateFromFile('login');
  tmpl.data = { error: null };
  return tmpl.evaluate().getContent();
}

// US-003: User management — list, add, reset password

function getUsersList() {
  ensureUserAuthColumns();
  var users = dbGetAll('Users');
  return users.map(function(u) {
    return { user_id: u.user_id, username: u.username, full_name: u.full_name, avatar: u.avatar || '', role: u.role };
  });
}

function serverAddUser(username, full_name, role, password) {
  ensureUserAuthColumns();
  username = (username || '').trim();
  full_name = (full_name || '').trim();
  role = (role || 'teacher').trim();
  password = password || '';

  if (!username || !full_name || !password) {
    return { error: 'กรุณากรอกข้อมูลให้ครบถ้วน' };
  }
  if (role !== 'teacher' && role !== 'admin') {
    return { error: 'บทบาทไม่ถูกต้อง' };
  }

  var existing = dbFindOne('Users', 'username', username);
  if (existing) return { error: 'ชื่อผู้ใช้นี้มีอยู่แล้ว' };

  var salt = Utilities.getUuid();
  var hash = computeHash(password, salt);
  var userId = generateId('user');
  dbInsert('Users', {
    user_id: userId,
    username: username,
    password_hash: hash,
    salt: salt,
    full_name: full_name,
    role: role,
    must_change_pwd: role === 'teacher' ? 'true' : '',
    created_at: new Date().toISOString()
  });
  appendAuditLog(userId, 'Users', userId, null, { username: username, role: role });
  return { ok: true, user_id: userId };
}

function serverResetPassword(user_id, new_password) {
  ensureUserAuthColumns();
  new_password = new_password || '';
  if (!user_id || !new_password) {
    return { error: 'กรุณากรอกรหัสผ่านใหม่' };
  }

  var user = dbFindOne('Users', 'user_id', user_id);
  if (!user) return { error: 'ไม่พบผู้ใช้' };

  var salt = Utilities.getUuid();
  var hash = computeHash(new_password, salt);
  var updated = dbUpdate('Users', 'user_id', user_id, {
    password_hash: hash,
    salt: salt,
    must_change_pwd: user.role === 'teacher' ? 'true' : ''
  });
  if (!updated) return { error: 'ไม่สามารถอัพเดตรหัสผ่านได้' };

  appendAuditLog(user_id, 'Users', user_id, { action: 'password_reset' }, { action: 'password_reset', username: user.username });
  return { ok: true };
}

function serverEditUser(user_id, full_name, role) {
  ensureUserAuthColumns();
  full_name = (full_name || '').trim();
  role = (role || '').trim();

  if (!user_id || !full_name) {
    return { error: 'กรุณากรอกข้อมูลให้ครบถ้วน' };
  }
  if (role !== 'teacher' && role !== 'admin') {
    return { error: 'บทบาทไม่ถูกต้อง' };
  }

  var user = dbFindOne('Users', 'user_id', user_id);
  if (!user) return { error: 'ไม่พบผู้ใช้' };

  var updated = dbUpdate('Users', 'user_id', user_id, { full_name: full_name, role: role });
  if (!updated) return { error: 'ไม่สามารถแก้ไขข้อมูลได้' };

  appendAuditLog(user_id, 'Users', user_id, { full_name: user.full_name, role: user.role }, { full_name: full_name, role: role });
  return { ok: true };
}

function serverEditProfile(token, full_name) {
  var session = getSession(token);
  if (!session) throw new Error('กรุณาเข้าสู่ระบบ');

  full_name = (full_name || '').trim();
  if (!full_name) return { error: 'กรุณากรอกชื่อ' };

  var user = dbFindOne('Users', 'user_id', session.user_id);
  if (!user) return { error: 'ไม่พบผู้ใช้' };

  var before = { full_name: user.full_name };
  var after = { full_name: full_name };

  dbUpdate('Users', 'user_id', session.user_id, { full_name: full_name });
  appendAuditLog(session.user_id, 'Users', session.user_id, before, after);

  var cached = JSON.parse(CacheService.getScriptCache().get('session_' + token));
  cached.full_name = full_name;
  CacheService.getScriptCache().put('session_' + token, JSON.stringify(cached), SESSION_TTL_SECONDS);

  return { ok: true };
}

function getUsersListForPage(token) {
  var session = getSession(token);
  if (!session || session.role !== 'admin') return { error: 'Forbidden' };
  return { users: getUsersList() };
}

function serverLogin(username, password) {
  try {
    ensureUserAuthColumns();
    username = (username || '').trim();
    password = password || '';

    if (!username || !password) {
      return { error: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน' };
    }

    var users = dbGetAll('Users');
    var user = null;
    for (var i = 0; i < users.length; i++) {
      if (users[i].username === username) { user = users[i]; break; }
    }

    if (!user) return { error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' };

    var hash = computeHash(password, user.salt);
    if (hash !== user.password_hash) return { error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' };

    var token = generateToken();
    var sessionData = buildSessionData(user);
    dbUpdate('Users', 'user_id', user.user_id, { last_login_at: new Date().toISOString() });
    CacheService.getScriptCache().put('session_' + token, JSON.stringify(sessionData), SESSION_TTL_SECONDS);

    return { token: token, session: sessionData };
  } catch (err) {
    return { error: 'เกิดข้อผิดพลาด: ' + err.message };
  }
}

function serverChangePassword(token, old_password, new_password) {
  try {
    ensureUserAuthColumns();
    var session = getSession(token);
    if (!session) return { error: 'ไม่ได้เข้าสู่ระบบ' };
    if (!old_password || !new_password) return { error: 'กรุณากรอกข้อมูลให้ครบถ้วน' };
    if (new_password.length < 4) return { error: 'รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษร' };

    var user = dbFindOne('Users', 'user_id', session.user_id);
    if (!user) return { error: 'ไม่พบผู้ใช้' };

    var hash = computeHash(old_password, user.salt);
    if (hash !== user.password_hash) return { error: 'รหัสผ่านเดิมไม่ถูกต้อง' };

    var newSalt = Utilities.getUuid();
    var newHash = computeHash(new_password, newSalt);
    dbUpdate('Users', 'user_id', session.user_id, { password_hash: newHash, salt: newSalt, must_change_pwd: '' });

    var updatedSession = {
      user_id: session.user_id,
      username: session.username,
      full_name: session.full_name,
      avatar: session.avatar || '',
      role: session.role,
      must_change_pwd: false,
      expires_at: session.expires_at
    };
    CacheService.getScriptCache().put('session_' + token, JSON.stringify(updatedSession), SESSION_TTL_SECONDS);

    return { ok: true };
  } catch (err) {
    return { error: 'เกิดข้อผิดพลาด: ' + err.message };
  }
}

function getChangePasswordHtml(token) {
  try {
    var session = getSession(token);
    if (!session) return HtmlService.createTemplateFromFile('login').evaluate().getContent();
    var tmpl = HtmlService.createTemplateFromFile('change_password');
    tmpl.data = { session: session, token: token };
    return tmpl.evaluate().getContent();
  } catch (err) {
    return '<div style="font-family:sans-serif;padding:32px;color:#c0392b"><b>Error:</b> ' + err.message + '</div>';
  }
}

function serverUploadAvatar(token, base64Data) {
  try {
    ensureUserAuthColumns();
    var session = getSession(token);
    if (!session) return { error: 'ไม่ได้เข้าสู่ระบบ' };
    if (!base64Data || base64Data.length > 500000) return { error: 'ไฟล์รูปภาพใหญ่เกินไป' };

    var user = dbFindOne('Users', 'user_id', session.user_id);
    if (user && user.avatar && user.avatar.indexOf('drive.google') !== -1) {
      try {
        var oldId = user.avatar.match(/id=([a-zA-Z0-9_-]+)/);
        if (oldId && oldId[1]) DriveApp.getFileById(oldId[1]).setTrashed(true);
      } catch (e) {}
    }

    var mimeMatch = base64Data.match(/^data:(image\/\w+);base64,/);
    var mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
    var raw = Utilities.base64Decode(base64Data.split(',')[1] || base64Data);
    var blob = Utilities.newBlob(raw, mimeType, session.user_id + '_avatar.png');
    var file = DriveApp.createFile(blob);
    file.setName(session.user_id + '_avatar.png');
    file.setSharing(DriveApp.Access.ANYONE, DriveApp.Permission.VIEW);
    var avatarUrl = 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w200';

    dbUpdate('Users', 'user_id', session.user_id, { avatar: avatarUrl });

    var cached = JSON.parse(CacheService.getScriptCache().get('session_' + token));
    if (cached) { cached.avatar = avatarUrl; CacheService.getScriptCache().put('session_' + token, JSON.stringify(cached), SESSION_TTL_SECONDS); }

    return { ok: true, avatarUrl: avatarUrl };
  } catch (err) {
    return { error: 'เกิดข้อผิดพลาด: ' + err.message };
  }
}

function serverRemoveAvatar(token) {
  try {
    ensureUserAuthColumns();
    var session = getSession(token);
    if (!session) return { error: 'ไม่ได้เข้าสู่ระบบ' };

    var user = dbFindOne('Users', 'user_id', session.user_id);
    if (user && user.avatar && user.avatar.indexOf('drive.google') !== -1) {
      try {
        var oldId = user.avatar.match(/id=([a-zA-Z0-9_-]+)/);
        if (oldId && oldId[1]) DriveApp.getFileById(oldId[1]).setTrashed(true);
      } catch (e) {}
    }

    dbUpdate('Users', 'user_id', session.user_id, { avatar: '' });

    var cached = JSON.parse(CacheService.getScriptCache().get('session_' + token));
    if (cached) { cached.avatar = ''; CacheService.getScriptCache().put('session_' + token, JSON.stringify(cached), SESSION_TTL_SECONDS); }

    return { ok: true };
  } catch (err) {
    return { error: 'เกิดข้อผิดพลาด: ' + err.message };
  }
}

function serverGetCurrentUserProfile(token) {
  try {
    ensureUserAuthColumns();
    var session = getSession(token);
    if (!session) return { error: 'ไม่ได้เข้าสู่ระบบ' };
    var user = dbFindOne('Users', 'user_id', session.user_id);
    if (!user) return { error: 'ไม่พบผู้ใช้' };
    return {
      user_id: user.user_id,
      username: user.username,
      full_name: user.full_name,
      role: user.role,
      avatar: user.avatar || ''
    };
  } catch (err) {
    return { error: 'เกิดข้อผิดพลาด: ' + err.message };
  }
}

function serverDeleteUser(token, user_id) {
  var session = getSession(token);
  if (!session) throw new Error('กรุณาเข้าสู่ระบบ');
  if (session.role !== 'admin') throw new Error('ต้องเป็นผู้ดูแลระบบเท่านั้น');

  var user = dbFindOne('Users', 'user_id', user_id);
  if (!user) throw new Error('ไม่พบผู้ใช้');
  if (user.user_id === session.user_id) throw new Error('ไม่สามารถลบตัวเองได้');

  appendAuditLog(session.user_id, 'Users', user_id, user, null);
  dbDelete('Users', 'user_id', user_id);
  return { ok: true };
}

function authorizeDrive() {
  var files = DriveApp.getFiles();
  return 'Drive authorized: ' + (files.hasNext() ? 'ok' : 'empty');
}
