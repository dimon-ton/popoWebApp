const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..', 'src');

test('learner-development activity dropdowns offer only ผ่าน and ไม่ผ่าน', () => {
  const html = fs.readFileSync(path.join(root, 'teacher', 'class_dev_activity.html'), 'utf8');
  const script = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].at(-1)[1]
    .replace(/<\?[\s\S]*?\?>/g, 'x')
    .replace(/loadDevActivity\(\);\s*$/, '');
  const context = vm.createContext({ String });
  vm.runInContext(script, context);

  assert.equal(context.normalizeDevActivityResult('ผ่าน'), 'ผ่าน');
  assert.equal(context.normalizeDevActivityResult('ไม่ผ่าน'), 'ไม่ผ่าน');
  assert.equal(context.normalizeDevActivityResult('ร'), null);
  assert.equal(context.normalizeDevActivityResult('มส'), null);
  assert.doesNotMatch(html, /\['ผ่าน','ไม่ผ่าน','ร','มส'\]/);
  assert.match(html, /\['ผ่าน','ไม่ผ่าน'\]/);
});

test('server accepts only blank, ผ่าน, and ไม่ผ่าน activity results', () => {
  const saved = [];
  const context = vm.createContext({ Date, Math, Number, String, Object, Array, JSON, isNaN });
  vm.runInContext(fs.readFileSync(path.join(root, 'teacher', 'report.gs'), 'utf8'), context);
  context.requireSession_ = () => ({ user_id: 'teacher' });
  context.requireSubjectAccess_ = () => ({});
  context.validateRowsBelongToClass_ = () => {};
  context.dbBatchUpsertRows_ = (_tab, _keys, rows) => saved.push(...rows);
  context.appendAuditLog = () => {};

  context.serverSaveDevActivity('token', 'class', 'subject', [
    { student_id: 'student_1', result: 'ผ่าน' },
    { student_id: 'student_2', result: 'ไม่ผ่าน' },
    { student_id: 'student_3', result: '' },
  ]);
  assert.deepEqual(saved.map(row => row.result), ['ผ่าน', 'ไม่ผ่าน', '']);
  assert.throws(() => context.serverSaveDevActivity('token', 'class', 'subject', [
    { student_id: 'student_1', result: 'ร' },
  ]), /ผลกิจกรรมพัฒนาผู้เรียนไม่ถูกต้อง/);
  assert.throws(() => context.serverSaveDevActivity('token', 'class', 'subject', [
    { student_id: 'student_1', result: 'มส' },
  ]), /ผลกิจกรรมพัฒนาผู้เรียนไม่ถูกต้อง/);
});
