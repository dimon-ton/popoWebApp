const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const teacherRoot = path.join(__dirname, '..', 'src', 'teacher');

function loadSummativeApi(weights) {
  const api = vm.createContext({ Math, Number, String, isNaN });
  vm.runInContext(fs.readFileSync(path.join(teacherRoot, 'summative.gs'), 'utf8'), api);
  api.dbFindOne = () => weights || null;
  return api;
}

function loadReportPage() {
  const html = fs.readFileSync(path.join(teacherRoot, 'class_report.html'), 'utf8');
  const script = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].at(-1)[1]
    .replace(/<\?[\s\S]*?\?>/g, 'x').replace(/loadReport\(\);\s*$/, '');
  const page = vm.createContext({ Math, Number, String, Date, Array, setTimeout() {} });
  vm.runInContext(script, page);
  return page;
}

const cases = [
  {
    name: 'legacy/default 70:30',
    weights: { pre_mid_max: 25, mid_max: 20, post_mid_max: 25, final_exam_max: 30 },
    detailed: [50, 20, 30, 100],
    overall: [70, 30],
  },
  {
    name: 'configured 80:20',
    weights: {
      pre_mid_max: 30, mid_max: 20, post_mid_max: 30, final_exam_max: 20,
      coursework_max: 70, final_max: 30,
    },
    detailed: [60, 20, 20, 100],
    overall: [80, 20],
  },
  {
    name: 'configured 65/15/20 detail and 80:20 overall',
    weights: { pre_mid_max: 25, mid_max: 15, post_mid_max: 40, final_exam_max: 20 },
    detailed: [65, 15, 20, 100],
    overall: [80, 20],
  },
];

for (const scenario of cases) {
  test(`Grade Report uses SubjectWeights for ${scenario.name}`, () => {
    const api = loadSummativeApi(scenario.weights);
    const maxes = api.getSummativeScoreMaxes('subject');
    assert.deepEqual(
      [maxes.coursework, maxes.midterm, maxes.final, maxes.total],
      scenario.detailed,
    );
    assert.deepEqual([maxes.during_course, maxes.final], scenario.overall);

    const page = loadReportPage();
    const actualScores = { coursework: 41, midterm: 12, final: 17, total: 70 };
    const report = page.pageReferenceScoreGridSummary({
      school_info: {}, class_info: {}, subject_info: {},
      summative_score_maxes: maxes,
      summative_students: [{ seq_no: 1, full_name: 'Student', ...actualScores }],
    }, 1);
    const expectedHeader = scenario.detailed.map((value) => `<th>${value}</th>`).join('');
    assert.match(report, new RegExp(expectedHeader));
    assert.match(report, /<td>41<\/td><td>12<\/td><td>17<\/td><td>70<\/td>/);

    const profile = page.pageSubjectProfile({
      school_info: {}, class_info: {}, subject_info: {}, summative_score_maxes: maxes,
    }, 1);
    assert.match(profile, new RegExp(`คะแนนระหว่างเรียน[\\s\\S]*?>${scenario.overall[0]}<`));
    assert.match(profile, new RegExp(`คะแนนปลายปี[\\s\\S]*?>${scenario.overall[1]}<`));
  });
}

test('Grade Report score maximums retain legacy defaults when SubjectWeights is missing', () => {
  const api = loadSummativeApi(null);
  const maxes = api.getSummativeScoreMaxes('subject');
  assert.deepEqual(
    [maxes.coursework, maxes.midterm, maxes.final, maxes.total, maxes.during_course],
    [50, 20, 30, 100, 70],
  );
});

test('P.1-P.3 report flow remains isolated from standard Grade Report score columns', () => {
  const page = loadReportPage();
  const book = page.buildReportBookHtml({
    school_info: {},
    class_info: { level: 'ป.1' },
    subject_info: {},
    curriculum_data: { students: [], outcomes: { '1': [], '2': [] } },
    students: [],
  });
  assert.doesNotMatch(book, /สอบกลางภาค/);
  assert.match(book, /ผลลัพธ์ \/35/);
  assert.match(book, /ปลายภาค \/15/);
});
