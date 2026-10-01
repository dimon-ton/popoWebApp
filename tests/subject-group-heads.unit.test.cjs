const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..', 'src');

function adminHarness(role = 'admin') {
  const state = {
    SchoolInfo: [{ school_name: 'โรงเรียนเดิม', director_name: 'ผู้อำนวยการเดิม' }],
    Subjects: [
      { subject_id: 'thai_p1', class_id: 'p1', subject_group: ' ภาษาไทย ' },
      { subject_id: 'thai_p4', class_id: 'p4', subject_group: 'ภาษาไทย' },
      { subject_id: 'english_p1', class_id: 'p1', subject_group: 'ภาษาต่างประเทศ' },
      { subject_id: 'blank', class_id: 'p1', subject_group: '   ' },
    ],
    Users: [
      { user_id: 'teacher_thai', full_name: 'ครูภาษาไทย', role: 'teacher' },
      { user_id: 'teacher_english', full_name: 'ครูภาษาอังกฤษ', role: 'teacher' },
      { user_id: 'admin_1', full_name: 'ผู้ดูแลระบบ', role: 'admin' },
    ],
    SubjectGroupHeads: [],
    AuditLog: [],
  };
  const context = vm.createContext({ Date, Math, Number, String, Object, Array, JSON, isFinite });
  vm.runInContext(fs.readFileSync(path.join(root, 'admin', 'admin_school_api.gs'), 'utf8'), context);
  context.getSession = () => ({ user_id: 'admin_1', role });
  context.ensureSubjectGroupHeadsSchema_ = () => {};
  context.dbGetAll = tab => state[tab] || [];
  context.withDbLock_ = callback => callback();
  context.dbDeleteUnlocked_ = (tab, field, value) => {
    const index = state[tab].findIndex(row => row[field] === value);
    if (index === -1) return false;
    state[tab].splice(index, 1);
    return true;
  };
  context.dbInsertUnlocked_ = (tab, row) => state[tab].push({ ...row });
  context.appendAuditLogUnlocked_ = (userId, entity, entityId, oldValue, newValue) => {
    state.AuditLog.push({ userId, entity, entityId, oldValue, newValue });
  };
  return { context, state };
}

test('schema registers SubjectGroupHeads in TAB_SCHEMA and TAB_ORDER', () => {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(root, 'database', 'setup.gs'), 'utf8'), context);
  assert.deepEqual(Array.from(context.TAB_SCHEMA.SubjectGroupHeads), [
    'subject_group', 'head_user_id', 'updated_by', 'updated_at',
  ]);
  assert.equal(context.TAB_ORDER.includes('SubjectGroupHeads'), true);
});

test('distinct groups come from Subjects and whitespace-only duplicates collapse', () => {
  const { context } = adminHarness();
  assert.deepEqual(Array.from(context.getDistinctSubjectGroups_()).sort(), ['ภาษาไทย', 'ภาษาต่างประเทศ'].sort());
  const settings = context.getSubjectGroupHeadsSettings('token');
  assert.equal(settings.groups.length, 2);
  assert.equal(settings.groups.every(group => group.head_user_id === '' && group.head_name === ''), true);
  assert.deepEqual(Array.from(settings.teachers, teacher => teacher.user_id).sort(), ['teacher_english', 'teacher_thai']);
});

test('admin assignment saves, audits, persists, reloads, and leaves SchoolInfo untouched', () => {
  const { context, state } = adminHarness();
  const originalSchoolInfo = JSON.parse(JSON.stringify(state.SchoolInfo));
  const saved = context.serverSaveSubjectGroupHeads('token', [
    { subject_group: ' ภาษาไทย ', head_user_id: 'teacher_thai' },
  ]);
  assert.equal(saved.ok, true);
  assert.equal(saved.changed, 1);
  assert.equal(state.SubjectGroupHeads.length, 1);
  assert.equal(state.SubjectGroupHeads[0].subject_group, 'ภาษาไทย');
  assert.equal(state.SubjectGroupHeads[0].head_user_id, 'teacher_thai');
  assert.equal(state.SubjectGroupHeads[0].updated_by, 'admin_1');
  assert.equal(state.AuditLog.length, 1);
  assert.equal(state.AuditLog[0].entity, 'SubjectGroupHeads');
  assert.deepEqual(state.SchoolInfo, originalSchoolInfo);

  const reloaded = context.getSubjectGroupHeadsSettings('token');
  const thai = reloaded.groups.find(group => group.subject_group === 'ภาษาไทย');
  assert.equal(thai.head_user_id, 'teacher_thai');
  assert.equal(thai.head_name, 'ครูภาษาไทย');
});

test('invalid or ineligible user IDs are rejected and only admins may save', () => {
  const { context, state } = adminHarness();
  assert.throws(() => context.serverSaveSubjectGroupHeads('token', [
    { subject_group: 'ภาษาไทย', head_user_id: 'missing_user' },
  ]), /ไม่พบผู้ใช้/);
  assert.throws(() => context.serverSaveSubjectGroupHeads('token', [
    { subject_group: 'ภาษาไทย', head_user_id: 'admin_1' },
  ]), /ไม่ใช่ครู/);
  assert.equal(state.SubjectGroupHeads.length, 0);

  const teacher = adminHarness('teacher');
  assert.throws(() => teacher.context.serverSaveSubjectGroupHeads('token', []), /ไม่มีสิทธิ์/);
  assert.throws(() => teacher.context.getSubjectGroupHeadsSettings('token'), /ไม่มีสิทธิ์/);
});

test('assignment can be cleared and duplicate normalized rows are removed by upsert', () => {
  const { context, state } = adminHarness();
  state.SubjectGroupHeads.push(
    { subject_group: 'ภาษาไทย', head_user_id: 'teacher_thai' },
    { subject_group: ' ภาษาไทย ', head_user_id: 'teacher_english' },
  );
  context.serverSaveSubjectGroupHeads('token', [
    { subject_group: 'ภาษาไทย', head_user_id: 'teacher_english' },
  ]);
  assert.deepEqual(state.SubjectGroupHeads.map(row => [row.subject_group, row.head_user_id]), [
    ['ภาษาไทย', 'teacher_english'],
  ]);

  context.serverSaveSubjectGroupHeads('token', [
    { subject_group: 'ภาษาไทย', head_user_id: '' },
  ]);
  assert.equal(state.SubjectGroupHeads.length, 0);
  assert.equal(context.getSubjectGroupHeadsSettings('token').groups.find(group => group.subject_group === 'ภาษาไทย').head_user_id, '');
});

test('report resolves one configured head for the same normalized group across classes', () => {
  const rows = {
    SubjectGroupHeads: [{ subject_group: ' ภาษาต่างประเทศ ', head_user_id: 'teacher_english' }],
    Users: [{ user_id: 'teacher_english', full_name: 'ครูภาษาอังกฤษ' }],
  };
  const context = vm.createContext({ Date, Math, Number, String, Object, Array, JSON, isNaN });
  vm.runInContext(fs.readFileSync(path.join(root, 'teacher', 'report.gs'), 'utf8'), context);
  context.ensureSubjectGroupHeadsSchema_ = () => {};
  context.dbGetAll = tab => rows[tab] || [];
  context.dbFindOne = (tab, field, value) => (rows[tab] || []).find(row => String(row[field]) === String(value)) || null;

  const subjects = [
    { class_id: 'p1', subject_group: 'ภาษาต่างประเทศ' },
    { class_id: 'm3', subject_group: ' ภาษาต่างประเทศ ' },
  ];
  subjects.forEach(subject => {
    const resolved = context.resolveSubjectGroupHead_(subject.subject_group);
    assert.equal(resolved.user_id, 'teacher_english');
    assert.equal(resolved.full_name, 'ครูภาษาอังกฤษ');
  });
  assert.deepEqual({ ...context.resolveSubjectGroupHead_('กลุ่มที่ยังไม่กำหนด') }, { user_id: '', full_name: '' });

  const reportSource = fs.readFileSync(path.join(root, 'teacher', 'report.gs'), 'utf8');
  assert.match(reportSource, /subject_group_head_user_id:\s*subject_group_head\.user_id/);
  assert.match(reportSource, /subject_group_head_name:\s*subject_group_head\.full_name/);

  context.dbGetAll = tab => {
    if (tab === 'SubjectGroupHeads') throw new Error('Tab not found');
    return rows[tab] || [];
  };
  assert.deepEqual({ ...context.resolveSubjectGroupHead_('ภาษาต่างประเทศ') }, { user_id: '', full_name: '' });
});

test('approvalBlock uses subject_group_head_name and never falls back to homeroom teacher', () => {
  const html = fs.readFileSync(path.join(root, 'teacher', 'class_report.html'), 'utf8');
  const script = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].at(-1)[1]
    .replace(/<\?[\s\S]*?\?>/g, 'x').replace(/loadReport\(\);\s*$/, '');
  const context = vm.createContext({ Math, Number, String, Date, Array, setTimeout: () => {} });
  vm.runInContext(script, context);

  const assigned = context.approvalBlock({
    teacher_name: 'ครูผู้สอน',
    homeroom_teacher_name: 'ครูประจำชั้นที่ไม่ควรแสดง',
    subject_group_head_name: 'ครูหัวหน้ากลุ่มสาระ',
    school_info: {},
  });
  assert.match(assigned, /ครูหัวหน้ากลุ่มสาระ/);
  assert.doesNotMatch(assigned, /ครูประจำชั้นที่ไม่ควรแสดง/);

  const missing = context.approvalBlock({
    homeroom_teacher_name: 'ครูประจำชั้นที่ไม่ควรใช้แทน',
    subject_group_head_name: '',
    school_info: {},
  });
  assert.match(missing, /\.\.\.\.\.\.\.\./);
  assert.doesNotMatch(missing, /ครูประจำชั้นที่ไม่ควรใช้แทน/);
});

test('admin school page contains the dropdown settings UI and keeps the existing school save flow', () => {
  const html = fs.readFileSync(path.join(root, 'admin', 'admin_school.html'), 'utf8');
  assert.match(html, /ตั้งค่าหัวหน้ากลุ่มสาระการเรียนรู้/);
  assert.match(html, /-- ยังไม่ได้กำหนด --/);
  assert.match(html, /getSubjectGroupHeadsSettings\(TOKEN\)/);
  assert.match(html, /serverSaveSubjectGroupHeads\(TOKEN, assignments\)/);
  assert.match(html, /serverSaveSchoolInfo\(TOKEN,/);
});
