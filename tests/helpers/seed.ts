/**
 * US-022: Test data isolation + cleanup helpers
 *
 * All IDs are prefixed with "test_" so cleanupTestData() can safely wipe them
 * without touching production rows.
 *
 * Seed/cleanup calls go through the FR-14 test API endpoint:
 *   GET  <WEB_APP_URL>?api=<op>&auth_token=<TEST_API_TOKEN>&...
 *
 * Required env vars:
 *   WEB_APP_URL     — deployed /exec URL
 *   TEST_API_TOKEN  — matches TEST_API_TOKEN Script Property in Apps Script
 */

const BASE_URL = process.env.WEB_APP_URL ?? '';
const API_TOKEN = process.env.TEST_API_TOKEN ?? '';

interface SeedClassOpts {
  suffix: string;
  level?: string;
  section?: string;
}

interface SeedSubjectOpts {
  suffix: string;
  name?: string;
  code?: string;
  group?: number;
  class_id?: string;
}

interface SeedStudentOpts {
  class_suffix: string;
  seq?: number;
  full_name?: string;
}

interface SeedUserOpts {
  suffix: string;
  role?: 'teacher' | 'admin';
  password?: string;
  full_name?: string;
}

interface SeedEnrollmentOpts {
  suffix: string;
  class_id: string;
  subject_id: string;
  teacher_user_id: string;
}

async function apiCall(params: Record<string, string | number>): Promise<Record<string, unknown>> {
  const qs = new URLSearchParams({
    auth_token: API_TOKEN,
    ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
  });
  const url = `${BASE_URL}?${qs.toString()}`;
  
  const maxRetries = 5;
  let delay = 1000;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, { redirect: 'follow' });
      const json = await res.json() as Record<string, unknown>;
      if (json.error) throw new Error(`Test API error for api=${params.api}: ${json.error}`);
      return json;
    } catch (err: any) {
      if (attempt === maxRetries) {
        throw err;
      }
      console.warn(`[Seed API] Attempt ${attempt} failed: ${err.message}. Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2;
    }
  }
  throw new Error("API call failed after all retries");
}

export async function seedTestClass(opts: SeedClassOpts): Promise<string> {
  const classId = `test_class_${opts.suffix}`;
  await apiCall({
    api: 'seed_class',
    class_id: classId,
    level: opts.level ?? 'ป.1',
    section: opts.section ?? '1',
  });
  return classId;
}

export async function seedTestSubject(opts: SeedSubjectOpts): Promise<string> {
  const subjectId = `test_subject_${opts.suffix}`;
  await apiCall({
    api: 'seed_subject',
    subject_id: subjectId,
    name: opts.name ?? subjectId,
    code: opts.code ?? 'TST0000',
    group: opts.group ?? 1,
    class_id: opts.class_id ?? '',
  });
  return subjectId;
}

export async function seedTestStudent(opts: SeedStudentOpts): Promise<string> {
  const studentId = `test_student_${opts.class_suffix}_${opts.seq ?? 99}`;
  await apiCall({
    api: 'seed_student',
    student_id: studentId,
    class_id: `test_class_${opts.class_suffix}`,
    seq: opts.seq ?? 99,
    full_name: opts.full_name ?? studentId,
  });
  return studentId;
}

export async function seedTestUser(opts: SeedUserOpts): Promise<string> {
  const userId = `test_user_${opts.suffix}`;
  await apiCall({
    api: 'seed_user',
    user_id: userId,
    role: opts.role ?? 'teacher',
    password: opts.password ?? 'test1234',
    full_name: opts.full_name ?? userId,
  });
  return userId;
}

export async function seedTestEnrollment(opts: SeedEnrollmentOpts): Promise<string> {
  const enrollmentId = `test_enr_${opts.suffix}`;
  await apiCall({
    api: 'seed_enrollment',
    enrollment_id: enrollmentId,
    class_id: opts.class_id,
    subject_id: opts.subject_id,
    teacher_user_id: opts.teacher_user_id,
  });
  return enrollmentId;
}

interface SeedIndicatorOpts {
  suffix: string;
  subject_id: string;
  code?: string;
  max_score?: number;
  display_order?: number;
}

export async function seedTestIndicator(opts: SeedIndicatorOpts): Promise<string> {
  const indicatorId = `test_ind_${opts.suffix}`;
  await apiCall({
    api: 'seed_indicator',
    indicator_id: indicatorId,
    subject_id: opts.subject_id,
    code: opts.code ?? indicatorId,
    max_score: opts.max_score ?? 3,
    display_order: opts.display_order ?? 1,
  });
  return indicatorId;
}

interface SeedSubjectWeightsOpts {
  subject_id: string;
  coursework_max?: number;
  final_max?: number;
  pre_mid_max?: number;
  mid_max?: number;
  post_mid_max?: number;
  final_exam_max?: number;
}

export async function seedTestSubjectWeights(opts: SeedSubjectWeightsOpts): Promise<void> {
  await apiCall({
    api: 'seed_subject_weights',
    subject_id: opts.subject_id,
    coursework_max: opts.coursework_max ?? 70,
    final_max: opts.final_max ?? 30,
    pre_mid_max: opts.pre_mid_max ?? 25,
    mid_max: opts.mid_max ?? 20,
    post_mid_max: opts.post_mid_max ?? 25,
    final_exam_max: opts.final_exam_max ?? 30,
  });
}

interface SeedSummativeOpts {
  student_id: string;
  subject_id: string;
  total: number;
  coursework?: number | string;
  midterm?: number | string;
  final?: number | string;
  makeup_grade?: number | string;
}

export async function seedTestSummative(opts: SeedSummativeOpts): Promise<void> {
  await apiCall({
    api: 'seed_summative',
    student_id: opts.student_id,
    subject_id: opts.subject_id,
    total: opts.total,
    coursework: opts.coursework ?? '',
    midterm: opts.midterm ?? '',
    final: opts.final ?? '',
    makeup_grade: opts.makeup_grade ?? '',
  });
}

export async function cleanupTestData(): Promise<void> {
  await apiCall({ api: 'cleanup' });
}

export async function queryTestRows(tab: string, field: string): Promise<Record<string, unknown>[]> {
  const result = await apiCall({ api: 'query_rows', tab, field, prefix: 'test_' });
  return (result.rows as Record<string, unknown>[]) ?? [];
}
