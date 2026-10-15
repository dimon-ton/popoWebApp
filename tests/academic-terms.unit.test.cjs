const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function context() {
  const sandbox = vm.createContext({ Date, String, Number, Object, Array, JSON, Math, isFinite });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'admin', 'admin_school_api.gs'), 'utf8'), sandbox);
  return sandbox;
}

test('academic term input requires explicit valid boundaries and a semester-sized optional cap', () => {
  const ctx = context();
  const term = ctx.normalizeAcademicTermInput_('2569', {
    semester: '2', start_date: '2026-11-02', end_date: '2027-03-31', required_attendance_days: '',
  });
  assert.equal(term.start_date, '2026-11-02');
  assert.equal(term.end_date, '2027-03-31');
  assert.equal(term.required_attendance_days, '');
  assert.throws(() => ctx.normalizeAcademicTermInput_('2569', {
    semester: '1', start_date: '2026-06-01', end_date: '2026-05-01', required_attendance_days: 100,
  }), /วันสิ้นสุด/);
  assert.throws(() => ctx.normalizeAcademicTermInput_('2569', {
    semester: '1', start_date: '2026-05-01', end_date: '2026-09-30', required_attendance_days: 200,
  }), /1 ถึง 130/);
});

test('saving one term rejects overlap with the other persisted term', () => {
  const ctx = context();
  ctx.getSession = () => ({ role: 'admin', user_id: 'admin' });
  ctx.ensureAcademicTermsSchema_ = () => {};
  ctx.dbGetAll = () => [{
    academic_year: '2569', semester: '2', start_date: '2026-10-15', end_date: '2027-03-31', required_attendance_days: '',
  }];
  assert.throws(() => ctx.serverSaveAcademicTerms('token', '2569', [{
    semester: '1', start_date: '2026-05-01', end_date: '2026-10-31', required_attendance_days: 100,
  }]), /ไม่ทับซ้อน/);
});

