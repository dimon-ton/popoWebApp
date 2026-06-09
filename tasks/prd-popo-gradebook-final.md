[PRD]
# PRD: PopoWebApp — School Grade Book Web App (Final / Single Source of Truth)

## 1. Overview

Convert the Thai elementary-school grade-book Excel (`ภาษาอังกฤษ ป.1.xlsx`, 18 sheets) into a
school-wide web application used by all teachers and one admin at โรงเรียนบ้านโพนแท่น.

**What the app does:**
- Admin creates classes, subjects, and teacher accounts, then assigns one teacher per
  (class, subject) pair using a teacher-first assignment UI.
- Teachers record attendance, formative indicator scores, summative scores (auto-graded 0–4),
  affective characteristics, and read-think-write assessments.
- The system produces a printable PDF cover report (ปก) matching the original Excel layout.
- Every feature is verified by a Playwright MCP browser test running against the live deployment.

**Stack:**
- Backend: Google Apps Script (`HtmlService` web app, `.gs` server functions)
- Database: One master Google Sheet (`popoWebApp_DB`) with 14 tabs as relational tables
- Auth: Custom username + password stored in `Users` tab (SHA-256 + per-row salt)
- PDF: Hidden Google Sheet template filled at runtime, exported via `DriveApp`
- Testing: Playwright MCP — human does one-time Google OAuth; automation reuses `auth.json`

**Source-Excel formula references (for fidelity):**
- Grade ladder (`คะแนน2`): `≥80→4, ≥75→3.5, ≥70→3, ≥65→2.5, ≥60→2, ≥55→1.5, ≥50→1, else→0`
- Characteristics ladder (`คุณลักษณะ`): `≥70→ดีเยี่ยม, ≥60→ดี, ≥50→ผ่านเกณฑ์, else→ไม่ผ่าน` (max 80)
- Read-Think-Write ladder (`อ่านคิด`): `≥90→ดีเยี่ยม, ≥80→ดี, ≥70→ผ่านเกณฑ์, else→ไม่ผ่าน` (max 100)
- Score weights (`คะแนนวิชา`): group-1 subjects 70:30 (coursework:final), internal 25:20:25;
  group-2 subjects 80:20, internal 30:20:30

---

## 2. Goals

- Admin can stand up the school in one session: create classes, subjects, assign teachers.
- **Teacher-first assignment:** admin picks a teacher, then appends (class, subject) pairs to their
  schedule — one teacher per pair enforced.
- Every computed grade/score matches the source Excel formulas exactly.
- Concurrent teachers never overwrite each other (LockService row-level safety).
- Printable PDF cover report (ปก) matches the original Excel template visually.
- Every user story has a Playwright MCP spec that runs on the production URL and passes green.
- Tests are repeatable: after the one-time human OAuth, `pnpm playwright test` runs fully headless.

---

## 3. Quality Gates

These must pass for every user story before it is marked done:

1. `clasp push` — deploys source to Apps Script; must succeed with no syntax errors.
2. `npx clasp redeploy <PROD_DEPLOY_ID> --description "Release Description"` — redeploys live `/exec` URL.
3. `pnpm playwright test tests/<area>.spec.ts -g "<US-ID>"` — the story's Playwright spec must
   finish green against the production URL using `tests/.auth/auth.json`.

For all UI stories the Playwright spec must include at least one **visible-content assertion**
(text content or DOM state) — not just clicks — so rendering regressions fail the test.

---

## 4. User Stories

### US-001: Bootstrap master Sheet schema
**Description:** As the developer, I want a single master Google Sheet with all tables pre-created
so the rest of the app has a stable database to read and write.

**Acceptance Criteria:**
- [ ] Create one Google Sheet titled `popoWebApp_DB`.
- [ ] Create exactly these 14 tabs: `Users`, `Classes`, `Subjects`, `Students`, `Enrollments`,
  `Indicators`, `Attendance`, `IndicatorScores`, `SummativeScores`, `Characteristics`,
  `ReadThinkWrite`, `SubjectWeights`, `SchoolInfo`, `AuditLog`.
- [ ] Each tab has a header row matching the field list in FR-1. First row is frozen and bold.
- [ ] Sheet ID is stored as Apps Script Script Property `DB_SHEET_ID`.
- [ ] Playwright (`tests/admin.spec.ts -g US-001`): visit the app as admin; navigate to a
  dev-only `/admin/db-status` page that lists each tab name and row count; assert all 14 tabs
  appear with row count ≥ 1 (header row).

---

### US-002: Auth — login form and session
**Description:** As a teacher or admin, I want to log in with username and password so my edits
are attributed to me and I only see what I am allowed to see.

**Acceptance Criteria:**
- [ ] `doGet` shows a login page when no valid session token is in `localStorage`.
- [ ] Login form posts `username` + `password` to a server function.
- [ ] Server looks up `Users` row by `username`, verifies `SHA_256(password+salt)` against
  `password_hash`; wrong credentials show "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง".
- [ ] On success, write `{user_id, role, expires_at}` to `CacheService.getUserCache()` with a
  random session token key and 12h TTL; return token to browser via `localStorage`.
- [ ] Subsequent requests include the token; expired/invalid tokens redirect to login.
- [ ] Logout button clears the token from `localStorage` and the cache.
- [ ] Playwright (`tests/auth.spec.ts -g US-002`): navigate to app; assert login page visible;
  submit wrong password; assert error message; submit correct admin credentials; assert dashboard
  heading visible; click logout; assert redirected back to login.

---

### US-003: Auth — user management and password reset
**Description:** As an admin, I want to create teacher accounts and reset passwords so I can
onboard and support staff.

**Acceptance Criteria:**
- [ ] Admin-only `/admin/users` page lists all rows in `Users` tab (username, full name, role).
- [ ] "Add user" form: `username`, `full_name`, `role` (teacher/admin), initial password.
  Server hashes with a new random salt before writing; plaintext never persists.
- [ ] "Reset password" button per row opens a form; same hashing flow on save.
- [ ] Non-admin session hitting `/admin/users` receives a 403 block screen.
- [ ] Playwright (`tests/auth.spec.ts -g US-003`): log in as admin; visit `/admin/users`;
  create `test_teacher_new` with role=teacher; assert row appears; reset their password;
  log in as `test_teacher_new` with the new password; assert teacher dashboard visible.

---

### US-004: School info, classes, and subjects setup
**Description:** As an admin, I want to record the school identity, academic year, the list of
classes, and the list of subjects so everything else has reference data to build on.

**Acceptance Criteria:**
- [ ] `/admin/school` form: school name, อำเภอ, จังหวัด, ปีการศึกษา — saved to `SchoolInfo` tab.
- [ ] `/admin/classes` CRUD: `class_id`, `level` (e.g. ป.1), `section`, `homeroom_teacher_user_id`. CSV import accepts `homeroom_teacher_fullname` (resolved to `user_id` server-side).
- [ ] `/admin/subjects` CRUD: `subject_id`, `subject_name`, `subject_code`, `hours_per_year`,
  `weight_group` (1 or 2), `description`.
- [ ] Pre-seed all 11 subjects from the source Excel on first run (see FR-7 for the list and
  group assignments).
- [ ] Playwright (`tests/admin.spec.ts -g US-004`): log in as admin; edit school name to
  "test_school_name"; assert it saved; create class `test_class_p1_1` level=ป.1 section=1;
  assert it appears in the classes list; create subject `test_subject_eng` code=test_001 group=1;
  assert it appears in subjects list.

---

### US-005: Student roster — CRUD
**Description:** As a homeroom teacher, I want to add and edit the student list for my class so
all subjects share one roster.

**Acceptance Criteria:**
- [ ] `/class/:class_id/students` list view filtered by `class_id`, ordered by `seq_no`.
- [ ] Columns: `seq_no` (เลขที่), `student_code` (เลขประจำตัว), `citizen_id`
  (เลขประจำตัวประชาชน), `full_name` (ชื่อ-สกุล), `dob` (DD MMM YY Thai format), `note`.
- [ ] Add/edit/delete forms with citizen-ID uniqueness validation within the class.
- [ ] Only the homeroom teacher of that class or an admin can edit; other teachers see read-only.
- [ ] Playwright (`tests/admin.spec.ts -g US-005`): log in as admin; open `test_class_p1_1`;
  add student with `seq_no=1`, `full_name=test_นักเรียนทดสอบ`, `citizen_id=1459700000001`;
  assert row appears; edit `note` field; assert updated; delete the row; assert gone.

---

### US-006: Indicator catalog (ตัวชี้วัด)
**Description:** As an admin, I want a per-subject catalog of learning indicator codes so teachers
can score against them.

**Acceptance Criteria:**
- [ ] `/admin/indicators/:subject_id` CRUD: `indicator_id`, `subject_id`, `code`
  (e.g. `ต 1.1 ป.1/1`), `description`, `max_score` (default 3), `display_order`.
- [ ] Pre-seed the 16 English Grade-1 indicator codes from source `คะแนน1` on first run:
  `ต 1.1 ป.1/1`, `ต 1.1 ป.1/2`, `ต 1.1 ป.1/3`, `ต 1.1 ป.1/4`, `ต 1.2 ป.1/1`, `ต 1.2 ป.1/2`,
  `ต 1.2 ป.1/3`, `ต 1.2 ป.1/4`, `ต 1.3 ป.1/1`, `ต 2.1 ป.1/1`, `ต 2.1 ป.1/2`, `ต 2.1 ป.1/3`,
  `ต 2.2 ป.1/1`, `ต 3.1 ป.1/1`, `ต 4.1 ป.1/1`, `ต 4.2 ป.1/1`.
- [ ] Playwright (`tests/admin.spec.ts -g US-006`): log in as admin; open indicators for
  `test_subject_eng`; add indicator code `test_ind_001` max_score=3; assert it appears;
  delete it; assert gone.

---

### US-007: Attendance grid view and edit
**Description:** As a teacher, I want to mark daily attendance per period on a weekly grid so I
can track each student's presence over the whole year.

**Acceptance Criteria:**
- [ ] Page `/class/:class_id/subject/:subject_id/attendance?week=N` (N = 1–40).
- [ ] Grid: rows = students ordered by `seq_no`, columns = the 7 calendar days of week N with
  Thai day-abbreviation headers (จ อ พ พฤ ศ ส อา) and the date below.
- [ ] Each cell is a single-character input accepting `/` (present), `ล` (leave), `ข` (absent),
  or blank (non-school day). Clicking a cell cycles through these values.
- [ ] "Save week" writes/upserts rows to `Attendance`: `attendance_id`, `student_id`,
  `subject_id`, `date`, `period`, `status`, `updated_by`, `updated_at`.
- [ ] `LockService.getDocumentLock().tryLock(30000)` wraps every write; released in `finally`.
- [ ] Previous / Next week navigation buttons; "Jump to week" dropdown.
- [ ] Footer row: per-student totals — `present`, `leave`, `absent`, `total hours so far`.
- [ ] Playwright (`tests/attendance.spec.ts -g US-007`): log in as teacher assigned to
  `test_class_p1_1`/`test_subject_eng`; navigate to week 1; set student 1 day 1 = `/`;
  set student 1 day 2 = `ล`; save; reload page; assert values persist; assert footer shows
  present=1, leave=1 for student 1.

---

### US-008: Formative indicator scoring (คะแนน1)
**Description:** As a teacher, I want to enter a 0–3 score per student per indicator so the
formative part of the grade is recorded.

**Acceptance Criteria:**
- [ ] Page `/class/:class_id/subject/:subject_id/formative`.
- [ ] Grid: rows = students, columns = indicators ordered by `display_order`, each cell numeric
  input 0–`max_score` with `max_score` shown in the column header.
- [ ] Row total and class column-average shown live via JavaScript (no server round-trip).
- [ ] Save writes to `IndicatorScores`: `id`, `student_id`, `subject_id`, `indicator_id`,
  `score`, `updated_by`, `updated_at`.
- [ ] Row total is stored/accessible as `formative_total` for use in US-009.
- [ ] Playwright (`tests/scoring.spec.ts -g US-008`): log in as teacher; open formative page for
  `test_class_p1_1`/`test_subject_eng`; enter score 3 for student 1 indicator 1; assert live
  row total updates to 3; save; reload; assert value persists.

---

### US-009: Summative scoring and grade computation (คะแนน2)
**Description:** As a teacher, I want to enter coursework, midterm, and final scores and have the
system auto-compute the 0–4 grade exactly as the Excel does.

**Acceptance Criteria:**
- [ ] Page `/class/:class_id/subject/:subject_id/summative`.
- [ ] Columns per student: `ระหว่างเรียน` (max from `SubjectWeights.coursework_max`),
  `สอบกลางภาค` (max from `SubjectWeights.mid_max`), `สอบปลายภาค`
  (max from `SubjectWeights.final_exam_max`), computed `รวมทั้งหมด` (sum of the three),
  computed `ผลการประเมิน` (grade via ladder), `สอบแก้ตัว` (optional makeup override).
- [ ] Grade ladder applied to `รวมทั้งหมด`:
  `≥80→4, ≥75→3.5, ≥70→3, ≥65→2.5, ≥60→2, ≥55→1.5, ≥50→1, else→0`. Empty total → empty grade.
- [ ] `สอบแก้ตัว` overrides the displayed `final_grade` without changing `computed_grade`.
- [ ] Write to `SummativeScores`: `id`, `student_id`, `subject_id`, `coursework`, `midterm`,
  `final`, `total`, `computed_grade`, `makeup_grade`, `final_grade`, `updated_by`, `updated_at`.
- [ ] Playwright (`tests/scoring.spec.ts -g US-009`):
  - Enter coursework=42, midterm=18, final=22 for student 1 → assert total=82, grade=4.
  - Enter coursework=37, midterm=15, final=23 → assert total=75, grade=3.5.
  - Enter a makeup grade of 3 for student 1 → assert `final_grade` column shows 3.
  - Save; reload; assert all values persist.

---

### US-010: Subject weights configuration (คะแนนวิชา)
**Description:** As an admin, I want to configure how each subject's 100 points is split across
assessment periods so the summative form shows correct column maxima.

**Acceptance Criteria:**
- [ ] `/admin/weights` shows one row per subject with editable fields: `coursework_max`,
  `final_max`, `pre_mid_max`, `mid_max`, `post_mid_max`, `final_exam_max`.
- [ ] Save validates that `pre_mid_max + mid_max + post_mid_max + final_exam_max = 100`; shows
  error "รวมต้องเท่ากับ 100" otherwise.
- [ ] Default values: group-1 → 25/20/25/30=100; group-2 → 30/20/30/20=100.
- [ ] Summative scoring page (US-009) reads max values from this tab at render time; changing
  weights changes column headers on the next page load.
- [ ] Playwright (`tests/admin.spec.ts -g US-010`): log in as admin; change `test_subject_eng`
  coursework split to pre_mid=30; try to save with total ≠ 100; assert error toast; fix to 100;
  save; assert success toast; open summative page; assert column header shows new max.

---

### US-011: Characteristics scoring (คุณลักษณะ)
**Description:** As a teacher, I want to score each student on 8 affective traits and see the
auto-computed label.

**Acceptance Criteria:**
- [ ] Page `/class/:class_id/subject/:subject_id/characteristics`.
- [ ] Grid: rows = students, 8 trait columns (0–10 each):
  1. รักชาติ ศาสนา กษัตริย์  2. ซื่อสัตย์สุจริต  3. มีวินัย  4. ใฝ่เรียนรู้
  5. อยู่อย่างพอเพียง  6. มุ่งมั่นในการทำงาน  7. รักความเป็นไทย  8. มีจิตสาธารณะ
- [ ] Computed total (max 80) shown live. Label by ladder:
  `≥70→ดีเยี่ยม, ≥60→ดี, ≥50→ผ่านเกณฑ์, else→ไม่ผ่าน`.
- [ ] Write to `Characteristics`: `id`, `student_id`, `subject_id`, `t1..t8`, `total`, `label`,
  `updated_by`, `updated_at`.
- [ ] Playwright (`tests/scoring.spec.ts -g US-011`):
  - Enter 10,10,10,9,9,10,10,10 for student 1 → assert total=78, label=ดีเยี่ยม.
  - Enter 8,8,8,9,9,8,9,8 → assert total=67, label=ดี. Save; reload; assert persists.

---

### US-012: Read-Think-Write scoring (อ่านคิด)
**Description:** As a teacher, I want to score each student on 10 read-think-write sub-items and
see the auto-label.

**Acceptance Criteria:**
- [ ] Page `/class/:class_id/subject/:subject_id/readthinkwrite`.
- [ ] Grid: rows = students, 10 columns (0–10 each) grouped visually:
  อ่าน (r1, r2, r3), คิดวิเคราะห์ (t1, t2, t3, t4), เขียน (w1, w2, w3).
- [ ] Computed total (max 100) and label:
  `≥90→ดีเยี่ยม, ≥80→ดี, ≥70→ผ่านเกณฑ์, else→ไม่ผ่าน`.
- [ ] Write to `ReadThinkWrite`: `id`, `student_id`, `subject_id`, `r1..r3`, `t1..t4`,
  `w1..w3`, `total`, `label`, `updated_by`, `updated_at`.
- [ ] Playwright (`tests/scoring.spec.ts -g US-012`):
  - Enter 10,9,9,9,9,8,9,9,9,9 for student 1 → assert total=90, label=ดีเยี่ยม.
  - Save; reload; assert values persist.

---

### US-013: Cover report aggregates (ปก)
**Description:** As a teacher, I want a one-page summary showing grade distributions and class
headers — the digital twin of the `ปก` Excel sheet.

**Acceptance Criteria:**
- [ ] Page `/class/:class_id/subject/:subject_id/report`.
- [ ] Header: school name, อำเภอ, จังหวัด, ปีการศึกษา, ชั้น, รหัสวิชา, เวลาเรียน,
  ครูผู้สอน, ครูประจำชั้น (from `SchoolInfo`, `Classes`, `Subjects`, `Enrollments`, `Users`).
- [ ] Grade distribution table: count of students at each grade level 4, 3.5, 3, 2.5, 2, 1.5,
  1, 0 + percentage (count×100/total_students).
- [ ] กิจกรรมพัฒนาผู้เรียน: ผ่าน / ไม่ผ่าน / ร / มส counts. Per-student result set via a
  `DevActivity` tab; form on this page lets teacher set each student's result.
- [ ] Characteristics distribution: counts at ดีเยี่ยม / ดี / ผ่านเกณฑ์ / ไม่ผ่าน + percentages.
- [ ] Read-Think-Write distribution: same four-bucket counts + percentages.
- [ ] Playwright (`tests/scoring.spec.ts -g US-013`): using the English-Grade-1 sample data
  (13 students already entered in previous stories), assert grade count 4=6, 3.5=2, 3=4
  matches the source `ปก` row 17.

---

### US-014: PDF export of cover report
**Description:** As a teacher, I want to download the cover report as a PDF that visually matches
the original Excel `ปก` page so I can print and obtain signatures.

**Acceptance Criteria:**
- [ ] A hidden Google Sheet template mirrors the `ปก` layout: merged cells, school header,
  COUNTIF summary table, signature blocks. Created once during first-run wizard (US-017).
- [ ] "Export PDF" button on `/report` page: server copies the template, fills values from
  US-013 aggregates, exports via `DriveApp.getFileById(id).getAs('application/pdf')`, streams
  blob to browser as download, deletes the temporary copy.
- [ ] PDF is A4 portrait; Thai fonts render without mojibake.
- [ ] Playwright (`tests/scoring.spec.ts -g US-014`): click "Export PDF"; assert a download
  event fires (use `page.waitForEvent('download')`); assert downloaded filename ends with `.pdf`;
  assert file size > 0 bytes.

---

### US-015: Static reference pages
**Description:** As a teacher, I want read-only reference pages for instructions and score scales
so I don't have to open the original Excel.

**Acceptance Criteria:**
- [ ] `/help` renders static Thai text from `วิธีทำ1` / `วิธีทำ2` content.
- [ ] `/subjects/:subject_id/description` renders the `description` field from `Subjects`.
- [ ] `/subjects/:subject_id/indicators` lists all indicators for that subject (read-only).
- [ ] `/weights` renders the `SubjectWeights` table for all subjects (read-only).
- [ ] Playwright (`tests/admin.spec.ts -g US-015`): visit `/help`; assert at least one Thai
  heading is visible; visit `/weights`; assert "ภาษาอังกฤษ" row exists.

---

### US-016: Audit log
**Description:** As an admin, I want a searchable trail of every data change so I can investigate
grade disputes.

**Acceptance Criteria:**
- [ ] On every write to `Attendance`, `IndicatorScores`, `SummativeScores`, `Characteristics`,
  `ReadThinkWrite`, `Students`, `Enrollments`, append a row to `AuditLog`:
  `timestamp`, `user_id`, `entity`, `entity_id`, `old_value` (JSON), `new_value` (JSON).
- [ ] Admin-only `/admin/audit` page with filters: by `user_id`, date range, `entity`.
- [ ] Playwright (`tests/admin.spec.ts -g US-016`): log in as teacher; edit one summative score;
  log in as admin; open `/admin/audit`; filter by entity=SummativeScores; assert the change row
  appears with correct `user_id` and a non-empty `new_value` JSON.

---

### US-017: Deployment and first-run setup wizard
**Description:** As the deployer, I want to run a one-time setup wizard after a fresh deploy so
a new school can start using the app from scratch.

**Acceptance Criteria:**
- [ ] `.clasp.json.example` committed (no real project ID); README documents deploy steps.
- [ ] If `DB_SHEET_ID` script property is unset, first visit shows a setup wizard:
  creates `popoWebApp_DB` Sheet, creates the PDF template Sheet, stores both IDs in Script
  Properties, prompts to create the first admin user.
- [ ] After wizard completes, redirects to login page.
- [ ] Playwright (`tests/auth.spec.ts -g US-017`): clear Script Properties; visit the app URL;
  assert wizard heading is visible; complete wizard steps; assert redirect to login page;
  assert `popoWebApp_DB` Sheet exists in the Drive (check via a dev API endpoint or manually).

---

### US-018: Admin assigns subjects to a teacher (teacher-first flow)
**Description:** As an admin, I want to select a teacher first and then add (class, subject) pairs
to their schedule one by one, so I can clearly manage and grow each teacher's teaching load.

**Acceptance Criteria:**
- [ ] Page `/admin/enrollments` has a **left panel** listing all teachers (role=teacher only),
  each row showing teacher name and their current pair count.
- [ ] Clicking a teacher opens a **right panel** with:
  - A table of (class, subject) pairs currently assigned to that teacher —
    columns: `ชั้น`, `วิชา`, "Remove" button.
  - An **"Add pair" form** with two dropdowns: `class_id` and `subject_id`.
    Submitting appends the pair to the teacher's list.
- [ ] If the chosen (class, subject) is already owned by a **different** teacher, the server
  returns a prompt and the UI shows a confirmation dialog:
  "วิชานี้สอนโดย [other teacher] อยู่แล้ว — ต้องการเปลี่ยนเป็น [this teacher] ใช่ไหม?"
  Confirming reassigns; cancelling aborts. Both actions write an `AuditLog` row.
- [ ] "Remove" button detaches the pair from the teacher; an `AuditLog` row is written.
- [ ] Each (class, subject) can have at most one teacher at any time — unique composite key
  enforced server-side.
- [ ] Save/remove toast success and refresh the right panel inline (no full-page reload).
- [ ] Non-admin users hitting `/admin/enrollments` get a 403 block screen.
- [ ] A secondary read-only **"All pairs" tab** on the same page shows every (class, subject)
  row with its assigned teacher or "ยังไม่ได้กำหนด" — for spotting gaps.
- [ ] Playwright (`tests/admin.spec.ts -g US-018`):
  - Seed `test_teacher_a`, `test_teacher_b`, `test_class_x`, `test_class_y`, `test_subject_z`.
  - Visit `/admin/enrollments`; click `test_teacher_a`; add pair
    (`test_class_x`, `test_subject_z`); assert it appears in the right panel.
  - Add second pair (`test_class_y`, `test_subject_z`) to `test_teacher_a`; assert count = 2.
  - Click `test_teacher_b`; try to add (`test_class_x`, `test_subject_z`); assert
    reassign-confirmation dialog appears; confirm; assert pair now under `test_teacher_b`
    and gone from `test_teacher_a`.
  - Switch to "All pairs" tab; assert `test_class_x` + `test_subject_z` shows `test_teacher_b`.
  - Assert two `AuditLog` rows exist for `test_subject_z` changes.

---

### US-019: Admin bulk-assigns one teacher to many pairs
**Description:** As an admin, I want to assign one teacher to many (class, subject) pairs at once
so I can onboard a new teacher quickly.

**Acceptance Criteria:**
- [ ] A "Bulk assign" panel on `/admin/enrollments` offers two modes:
  - **Mode A — Many subjects, one class:** pick a class, pick a teacher, multi-select subjects.
  - **Mode B — Many classes, one subject:** pick a subject, pick a teacher, multi-select classes.
- [ ] Submitting writes one `Enrollments` row per (class, subject), overwriting existing rows
  where present, all inside one `LockService.getDocumentLock()` acquisition.
- [ ] After submit, a result panel shows: `N created, M reassigned, K unchanged`.
- [ ] Each created or reassigned row appends an `AuditLog` row.
- [ ] If `LockService` cannot acquire within 30s, abort with no partial writes and show error.
- [ ] Playwright (`tests/admin.spec.ts -g US-019`): seed 3 test classes + 1 test teacher + 1
  test subject; use Mode B to assign all 3 classes; assert summary shows `3 created`; assert
  all 3 rows in "All pairs" tab show that teacher.

---

### US-020: Admin views teacher workload dashboard
**Description:** As an admin, I want a dashboard showing each teacher's teaching load so I can
balance assignments across the school.

**Acceptance Criteria:**
- [ ] `/admin/workload` table: one row per teacher (excludes admin users), columns:
  `ชื่อครู`, `จำนวน (class, subject)`, `รายวิชาที่สอน` (comma-joined subject names),
  `จำนวนนักเรียนรวม` (distinct count of students across all assigned classes).
- [ ] Default sort: pair count descending (heaviest workload first).
- [ ] Clicking a teacher row opens a drill-down panel listing each (class, subject) pair they
  own, with a direct link to the relevant grade-book page.
- [ ] Page renders in under 3 seconds for 50 teachers / 500 enrollments.
  Aggregates cached in `CacheService.getScriptCache()` key `workload_v1` for 60s; cache
  invalidated on any `Enrollments` write.
- [ ] Playwright (`tests/admin.spec.ts -g US-020`): seed `test_teacher_heavy` (3 enrollments)
  and `test_teacher_light` (1 enrollment); visit `/admin/workload`; assert heavy teacher appears
  first; click their row; assert drill-down panel lists exactly 3 (class, subject) lines.

---

### US-021: Playwright auth bootstrap (storageState)
**Description:** As the developer, I want a one-time script that captures my logged-in session
into `auth.json` so all later Playwright test runs are fully non-interactive.

**Acceptance Criteria:**
- [ ] `tests/auth.setup.ts` configured as a Playwright `setup` project that runs before all
  other test projects (see FR-17).
- [ ] When run, opens the production `/exec` URL in **non-headless** Chromium and calls
  `page.pause()` so the human can log in and complete any Google "authorize script" consent.
- [ ] After the human resumes, script calls
  `context.storageState({ path: 'tests/.auth/auth.json' })`.
- [ ] All other test projects use `storageState: 'tests/.auth/auth.json'` (see FR-17).
- [ ] `tests/.auth/` is in `.gitignore`.
- [ ] README documents: *"First time only: run `pnpm playwright test --project=setup` and
  follow the browser prompt. Subsequent runs: `pnpm playwright test`."*
- [ ] Verify: delete `auth.json`; run `--project=setup` with manual login; then run
  `tests/auth.spec.ts` headless — it passes without prompting.

---

### US-022: Playwright seed/cleanup helper
**Description:** As the developer, I want a shared helper that seeds and cleans `test_`-prefixed
data so specs stay independent and never pollute real production data.

**Acceptance Criteria:**
- [ ] `tests/helpers/seed.ts` exports: `seedTestClass`, `seedTestSubject`, `seedTestStudent`,
  `seedTestUser`, `cleanupTestData`.
- [ ] All generated IDs/names/codes are prefixed with `test_<suffix>`.
- [ ] Seed/cleanup functions call the Apps Script test API (`?api=...`) with a `Bearer` token
  matching the `TEST_API_TOKEN` Script Property (see FR-14).
- [ ] `cleanupTestData()` deletes every row across all tabs where any ID column starts `test_`.
- [ ] Each spec file wraps its seeds in `beforeAll` / cleanup in `afterAll`.
- [ ] `tests/helpers/seed.spec.ts` self-test: seed one of each entity; assert they exist;
  cleanup; assert all gone.
- [ ] After a full test suite run, query the master Sheet for `test_` rows — none should remain.

---

## 5. Functional Requirements

- **FR-1: Data model** — 14 Sheet tabs and their exact columns:
  - `Users(user_id, username, password_hash, salt, full_name, role, created_at)`
  - `SchoolInfo(school_name, district, province, academic_year)`
  - `Classes(class_id, level, section, homeroom_teacher_user_id)`
  - `Subjects(subject_id, subject_name, subject_code, hours_per_year, weight_group, description)`
  - `Enrollments(enrollment_id, class_id, subject_id, teacher_user_id)`
  - `Students(student_id, class_id, seq_no, student_code, citizen_id, full_name, dob, note)`
  - `Indicators(indicator_id, subject_id, code, description, max_score, display_order)`
  - `SubjectWeights(subject_id, coursework_max, final_max, pre_mid_max, mid_max, post_mid_max, final_exam_max)`
  - `Attendance(attendance_id, student_id, subject_id, date, period, status, updated_by, updated_at)`
  - `IndicatorScores(id, student_id, subject_id, indicator_id, score, updated_by, updated_at)`
  - `SummativeScores(id, student_id, subject_id, coursework, midterm, final, total, computed_grade, makeup_grade, final_grade, updated_by, updated_at)`
  - `Characteristics(id, student_id, subject_id, t1, t2, t3, t4, t5, t6, t7, t8, total, label, updated_by, updated_at)`
  - `ReadThinkWrite(id, student_id, subject_id, r1, r2, r3, t1, t2, t3, t4, w1, w2, w3, total, label, updated_by, updated_at)`
  - `AuditLog(timestamp, user_id, entity, entity_id, old_value, new_value)`
  - `DevActivity(id, student_id, class_id, subject_id, result, updated_by, updated_at)`

- **FR-2:** All writes wrap `LockService.getDocumentLock().tryLock(30000)`; released in `finally`.

- **FR-3:** Deploy as "Execute as: User accessing the web app", "Who has access: Anyone".

- **FR-4:** Grade ladder (fixed): `≥80→4, ≥75→3.5, ≥70→3, ≥65→2.5, ≥60→2, ≥55→1.5, ≥50→1, else→0`.

- **FR-5:** Characteristics ladder: `≥70→ดีเยี่ยม, ≥60→ดี, ≥50→ผ่านเกณฑ์, else→ไม่ผ่าน` (max 80).

- **FR-6:** Read-Think-Write ladder: `≥90→ดีเยี่ยม, ≥80→ดี, ≥70→ผ่านเกณฑ์, else→ไม่ผ่าน` (max 100).

- **FR-7:** Subject groups:
  - **Group 1** (70:30 split, coursework internal 25:20:25): ภาษาไทย, คณิตศาสตร์, วิทยาศาสตร์,
    สังคมศึกษา, ประวัติศาสตร์, ภาษาอังกฤษ.
  - **Group 2** (80:20 split, coursework internal 30:20:30): ศิลปะ, สุขศึกษาพลศึกษา,
    การงานอาชีพ, วิทยาการคำนวณ, การป้องกัน.

- **FR-8:** All UI labels, error messages, and PDFs are in Thai. Login form may be bilingual.

- **FR-9:** Role rules: `teacher` reads/writes only (class, subject) pairs in their `Enrollments`
  rows; `admin` reads/writes everything and accesses all `/admin/*` pages.

- **FR-10:** Every save form shows a success/error toast and disables the submit button while
  in-flight to prevent double-submits.

- **FR-11:** `Enrollments` has a unique composite key on `(class_id, subject_id)`. Inserts enforce
  uniqueness; reassign shows confirmation dialog in US-018; bulk-assign (US-019) silently overwrites.

- **FR-12:** Every `Enrollments` create, reassign, or delete writes an `AuditLog` row with a JSON
  diff that includes the previous teacher (if any).

- **FR-13:** Playwright spec file layout:
  - `tests/auth.spec.ts` — US-002, US-003, US-017
  - `tests/admin.spec.ts` — US-001, US-004, US-005, US-006, US-010, US-015, US-016, US-018, US-019, US-020
  - `tests/attendance.spec.ts` — US-007
  - `tests/scoring.spec.ts` — US-008, US-009, US-011, US-012, US-013, US-014
  - `tests/auth.setup.ts` — US-021
  - `tests/helpers/seed.ts` — US-022

- **FR-14:** Test API path: Apps Script exposes `?api=seed_class|seed_subject|seed_student|
  seed_user|cleanup` gated by `Authorization: Bearer <TEST_API_TOKEN>` header matching the
  `TEST_API_TOKEN` Script Property. Kill-switch: Script Property `TEST_API_ENABLED=false`
  disables the path entirely. Path 404s on any ID that does not start with `test_`.

- **FR-15:** All test-created records use prefix `test_`. `cleanupTestData()` deletes only those.

- **FR-16:** Production deployment is the test target. No separate test deployment. Isolation is
  by data-prefix only.

- **FR-17:** `playwright.config.ts`:
  ```
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    { name: 'chromium', use: { storageState: 'tests/.auth/auth.json' }, dependencies: ['setup'] }
  ]
  use: { baseURL: process.env.WEB_APP_URL }
  retries: 1
  timeout: 60_000
  ```

- **FR-18:** `/admin/workload` aggregates cached in `CacheService.getScriptCache()` key
  `workload_v1` for 60s; cache invalidated on any `Enrollments` write.

- **FR-19:** Bulk-assign (US-019) runs under one `LockService` acquisition; 30s timeout → abort
  with no partial writes.

---

## 6. Non-Goals

- Co-teaching (multiple teachers per (class, subject)) — reconsider in v3.
- Separate test deployment — production with `test_` prefix is the isolation strategy.
- Headless CI without human bootstrap — `auth.json` must be human-seeded.
- Automated Google OAuth by Playwright.
- Playwright visual regression / screenshot diffs.
- Cross-browser testing — Chromium only.
- Mobile native app (web app only).
- Real-time co-editing of the same grid cell (last-write-wins + LockService is acceptable).
- Importing existing `.xlsx` files — manual entry only.
- Parent/student-facing views.
- Export formats other than PDF.
- Email / SMS / LINE notifications.
- Semester model — one continuous academic year only.
- Record recovery beyond AuditLog.

---

## 7. Technical Considerations

### GAS limits and mitigations
- 6-min execution limit per call → keep server functions small; compute aggregates on read, not write.
- 30s simultaneous execution per user → acceptable for a school grade book.
- `Attendance` tab worst case: 13 students × 7 periods × 200 days × 11 subjects × 12 classes
  ≈ 24M rows for a full school-year. **Mitigation: one `popoWebApp_DB` per academic year.**
  Archive prior-year sheets; `DB_SHEET_ID` Script Property swapped at year-start.

### Apps Script architecture
```
Code.gs        — doGet(e) router keyed on e.parameter.page
auth.gs        — login, session check, role guard
db.gs          — getAll(tab), insert(tab, row), update(tab, id, row), delete(tab, id)
                 all wrapped in LockService
pages/*.html   — one per route, server-side templating via <?!= include('partial') ?>
js/*.js.html   — client-side controllers included via HtmlService.createTemplateFromFile
pdf.gs         — cover-report PDF using hidden template Sheet
testapi.gs     — ?api=... path gated by TEST_API_TOKEN
```

### Auth security notes
- SHA-256 + per-row salt; never log plaintext; rotate salt on password reset.
- Rate-limit: `CacheService` key `login_attempts_<username>` incremented per failed attempt;
  lock out for 5 min after 5 failures.

### Playwright auth.json rotation
- Session TTL is 12h. Re-run `pnpm playwright test --project=setup` when specs fail at login.

### Stack reminder
Django + SQLite on PythonAnywhere/Render free tier would deliver this faster for a Python developer;
Django Admin replaces US-003, US-004, US-006, US-010, US-015, US-018, US-019, US-020 for free.
This PRD targets GAS per user choice — re-evaluate after US-018 if JS velocity feels slow.

---

## 8. Success Metrics

- Fresh checkout → `pnpm install` → `pnpm playwright test --project=setup` (human login) →
  `pnpm playwright test` finishes green in under 10 minutes.
- Admin can onboard a school (5 classes, 11 subjects, assign 55 pairs via 2 bulk-assign
  actions) in under 5 minutes wall time.
- `/admin/workload` renders in under 3s for 50 teachers.
- Zero `test_` rows left in production Sheet after a clean test run.
- Full teacher grading cycle (attendance 1 week + all scores for 13 students) in under 30 min.
- Exported PDF visually matches the source `ปก` page side-by-side.
- 100% of computed grades match the Excel IF-ladder on a 20-student spot-check.

---

## 9. Open Questions

- Should `seq_no` auto-renumber on student delete, or stay sparse? (Source Excel is sparse — OK.)
- PDF cover: aggregates only, or include a per-student grade table?
- Add `pnpm test:smoke` with the 3–4 most critical specs for fast feedback?
- Bulk-assign: silent commit, or show a dry-run preview first?
- When a teacher is unassigned, keep their scores in the DB or clear? (Default: keep.)
- Should `/admin/workload` surface attendance load (periods per year) alongside pair count?
[/PRD]
