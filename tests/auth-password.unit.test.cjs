const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const authSource = fs.readFileSync(path.join(root, 'src', 'auth', 'auth.gs'), 'utf8');

function createAuthApi(options = {}) {
  const cache = new Map();
  const audits = [];
  let uuidSequence = 0;
  const currentPassword = options.password || 'oldpass123';
  const initialSalt = 'initial-salt';
  const hash = (password, salt) => crypto.createHash('sha256').update(password + salt).digest('hex');
  const state = {
    Users: [{
      user_id: 'test_user_self',
      username: 'test_user_self',
      password_hash: hash(currentPassword, initialSalt),
      salt: initialSalt,
      full_name: 'ครูทดสอบ',
      role: options.role || 'teacher',
      avatar: '',
      must_change_pwd: options.mustChange ? 'true' : '',
    }],
  };

  const scriptCache = {
    get: (key) => cache.get(key) || null,
    put: (key, value) => cache.set(key, value),
    remove: (key) => cache.delete(key),
  };
  const api = vm.createContext({
    Math, Number, String, Date, JSON, Object, Array,
    CacheService: { getScriptCache: () => scriptCache },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      computeDigest: (_algorithm, value) => Array.from(crypto.createHash('sha256').update(value).digest()),
      getUuid: () => `fresh-salt-${++uuidSequence}`,
    },
  });
  vm.runInContext(authSource, api);

  api.ensureColumns = () => {};
  api.dbGetAll = (tab) => state[tab] || [];
  api.dbFindOne = (tab, field, value) => (state[tab] || []).find((row) => String(row[field]) === String(value)) || null;
  api.dbUpdate = (tab, field, value, updates) => {
    const row = api.dbFindOne(tab, field, value);
    if (!row) return false;
    Object.assign(row, updates);
    return true;
  };
  api.dbUpdateUnlocked_ = api.dbUpdate;
  api.withDbLock_ = (callback) => callback();
  api.appendAuditLogUnlocked_ = (userId, entity, entityId, oldValue, newValue) => {
    audits.push({ userId, entity, entityId, oldValue, newValue });
  };
  api.appendAuditLog = api.appendAuditLogUnlocked_;
  api.requireAdminToken_ = (token) => {
    const session = api.getSession(token);
    if (!session || session.role !== 'admin') throw new Error('Forbidden');
    return session;
  };

  const session = {
    user_id: state.Users[0].user_id,
    username: state.Users[0].username,
    full_name: state.Users[0].full_name,
    avatar: '',
    role: state.Users[0].role,
    must_change_pwd: !!options.mustChange,
    expires_at: Date.now() + 60_000,
  };
  cache.set('session_valid-token', JSON.stringify(session));

  return { api, state, cache, audits, currentPassword };
}

test('self-service password change requires a valid session', () => {
  const { api } = createAuthApi();
  const result = api.serverChangePassword('expired-token', 'oldpass123', 'newpass123');
  assert.equal(result.error, 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง');
});

test('self-service password change rejects wrong, short, and reused passwords', () => {
  const { api, currentPassword } = createAuthApi();
  assert.equal(
    api.serverChangePassword('valid-token', 'wrongpass', 'newpass123').error,
    'รหัสผ่านปัจจุบันไม่ถูกต้อง',
  );
  assert.equal(
    api.serverChangePassword('valid-token', currentPassword, 'short').error,
    'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร',
  );
  assert.equal(
    api.serverChangePassword('valid-token', currentPassword, currentPassword).error,
    'รหัสผ่านใหม่ต้องไม่เหมือนรหัสผ่านเดิม',
  );
});

test('successful self-service change rotates credentials, clears forced mode, keeps session, and audits safely', () => {
  const { api, state, cache, audits, currentPassword } = createAuthApi({ mustChange: true });
  const oldSalt = state.Users[0].salt;
  const oldHash = state.Users[0].password_hash;
  const newPassword = 'newpass123';

  const result = api.serverChangePassword('valid-token', currentPassword, newPassword);

  assert.equal(result.ok, true);
  assert.notEqual(state.Users[0].salt, oldSalt);
  assert.notEqual(state.Users[0].password_hash, oldHash);
  assert.equal(state.Users[0].password_hash, api.computeHash(newPassword, state.Users[0].salt));
  assert.equal(state.Users[0].must_change_pwd, '');
  assert.equal(api.computeHash(currentPassword, state.Users[0].salt) === state.Users[0].password_hash, false);
  assert.equal(JSON.parse(cache.get('session_valid-token')).must_change_pwd, false);

  assert.equal(audits.length, 1);
  assert.equal(audits[0].userId, 'test_user_self');
  assert.equal(audits[0].entityId, 'test_user_self');
  assert.equal(audits[0].newValue.action, 'password_changed_self');
  const auditText = JSON.stringify(audits[0]);
  assert.doesNotMatch(auditText, new RegExp(currentPassword));
  assert.doesNotMatch(auditText, new RegExp(newPassword));
  assert.doesNotMatch(auditText, /password_hash|salt/);

  assert.ok(api.serverLogin('test_user_self', newPassword).token);
  assert.equal(api.serverLogin('test_user_self', currentPassword).error, 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
});

test('admin reset-password behavior remains available and forces a teacher to change it', () => {
  const { api, state, cache } = createAuthApi({ role: 'admin' });
  state.Users.push({
    user_id: 'test_user_teacher', username: 'test_user_teacher', full_name: 'ครูสอง', role: 'teacher',
    password_hash: 'old-hash', salt: 'old-salt', must_change_pwd: '',
  });
  cache.set('session_admin-token', cache.get('session_valid-token'));

  const result = api.serverResetPassword('admin-token', 'test_user_teacher', 'resetpass123');

  assert.equal(result.ok, true);
  assert.equal(state.Users[1].must_change_pwd, 'true');
  assert.equal(state.Users[1].password_hash, api.computeHash('resetpass123', state.Users[1].salt));
});

test('router allows both authenticated roles, rejects anonymous access, and preserves forced precedence', () => {
  const router = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(root, 'src', 'Code.gs'), 'utf8'), router);
  router.MIN_PASSWORD_LENGTH = 8;
  router.isFirstRun = () => false;
  router.buildPage = (page, data) => ({ page, data });
  router.getChangePasswordHtml = () => 'forced-change-page';
  router.createTemplate = (page) => ({ data: null, evaluate() { return { getContent: () => page }; } });
  router.dbFindOne = () => null;
  router.getAdminSetupStatus = () => ({});

  for (const role of ['teacher', 'admin']) {
    router.getSession = () => ({ user_id: 'test_user_self', role, must_change_pwd: false });
    const page = router.doGet({ parameter: { page: 'change_password', token: 'valid-token' } });
    assert.equal(page.page, 'change_password');
    assert.equal(page.data.min_password_length, 8);
    assert.equal(router.getPageHtml('valid-token', 'change_password'), 'change_password');
  }

  router.getSession = () => null;
  assert.equal(router.doGet({ parameter: { page: 'change_password' } }).page, 'login');
  assert.equal(router.getPageHtml('expired-token', 'change_password'), 'login');

  router.getSession = () => ({ user_id: 'test_user_self', role: 'teacher', must_change_pwd: true });
  assert.equal(router.doGet({ parameter: { page: 'dashboard', token: 'valid-token' } }).page, 'change_password');
  assert.equal(router.getPageHtml('valid-token', 'dashboard'), 'forced-change-page');
});

test('client validation rejects mismatch and duplicate submission without sending extra RPCs', () => {
  const page = fs.readFileSync(path.join(root, 'src', 'auth', 'change_password.html'), 'utf8');
  const script = page.match(/<script>([\s\S]*?)<\/script>/)[1]
    .replace(/<\?= data\.token \|\| '' \?>/g, 'valid-token')
    .replace(/<\?= data\.min_password_length \?>/g, '8');
  const elements = {
    oldPassword: { value: 'oldpass123' },
    newPassword: { value: 'newpass123' },
    confirmPassword: { value: 'different' },
    errBox: { textContent: '', className: 'error' },
    changeBtn: { disabled: false, textContent: 'เปลี่ยนรหัสผ่าน' },
    cancelBtn: { disabled: false },
  };
  let calls = 0;
  const runner = {
    withSuccessHandler(handler) { this.success = handler; return this; },
    withFailureHandler(handler) { this.failure = handler; return this; },
    serverChangePassword() { calls++; },
  };
  const client = vm.createContext({
    document: { getElementById: (id) => elements[id] },
    google: { script: { run: runner } },
  });
  vm.runInContext(script, client);

  client.doChange();
  assert.equal(elements.errBox.textContent, 'รหัสผ่านใหม่ไม่ตรงกัน');
  assert.equal(calls, 0);

  elements.confirmPassword.value = 'newpass123';
  client.doChange();
  client.doChange();
  assert.equal(calls, 1);
  assert.equal(elements.changeBtn.disabled, true);
  assert.equal(elements.cancelBtn.disabled, true);

  runner.failure(new Error('internal details'));
  assert.equal(elements.changeBtn.disabled, false);
  assert.equal(elements.cancelBtn.disabled, false);
  assert.doesNotMatch(elements.errBox.textContent, /internal details/);
});

test('change-password page and shared navigation expose the required voluntary and forced-mode controls', () => {
  const page = fs.readFileSync(path.join(root, 'src', 'auth', 'change_password.html'), 'utf8');
  const styles = fs.readFileSync(path.join(root, 'src', '_styles.html'), 'utf8');
  const router = fs.readFileSync(path.join(root, 'src', 'Code.gs'), 'utf8');

  assert.match(router, /case 'change_password':[\s\S]*buildPage\('change_password'/);
  assert.match(styles, /data-account-action', 'change-password'/);
  assert.match(styles, /navigate\('change_password'\)/);
  assert.equal((page.match(/minlength="<\?= data\.min_password_length \?>"/g) || []).length, 2);
  assert.match(page, /รหัสผ่านต้องมีอย่างน้อย ' \+ MIN_PASSWORD_LENGTH \+ ' ตัวอักษร/);
  assert.match(page, /newPw !== confirmPw/);
  assert.match(page, /newPw === oldPw/);
  assert.match(page, /changePasswordSubmitting/);
  assert.match(page, /if \(!\(data\.session && data\.session\.must_change_pwd\)\)/);
  assert.doesNotMatch(page, /อย่างน้อย 4|length < 4/);
});
