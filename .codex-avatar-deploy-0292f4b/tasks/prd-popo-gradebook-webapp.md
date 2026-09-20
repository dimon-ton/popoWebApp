[PRD]
# PRD: PopoWebApp — School Grade Book Web App (Google Apps Script + Google Sheets)

## 1. Overview
Convert the existing Thai elementary-school grade-book Excel file (`ภาษาอังกฤษ ป.1.xlsx`, 18 sheets) into a multi-tenant web application that an entire school can use. The Excel original is a per-class-per-subject workbook owned by โรงเรียนบ้านโพนแท่น containing student roster, attendance, formative indicator scoring, summative scoring with grade computation (0–4 ladder), affective characteristics scoring, read-think-write scoring, and a printable cover/summary report. The web app must preserve the same data model and formulas while letting many teachers across many classes and subjects work concurrently, and letting an admin oversee everything.

**Stack:** Google Apps Script (web app via `HtmlService.doGet`, server logic in `.gs`), Google Sheets as relational database (one master Sheet with `class_id`/`subject_id` keyed tables), custom username+password auth stored in a `Users` sheet (bcrypt-style hash), hidden Sheet template rendered to PDF via `Drive`/`SpreadsheetApp` exportAs for the printable cover report.

**Source-Excel reference (for fidelity checks):**
- Roster: `ข้อมูลเด็ก` → fields: `เลขที่`, `เลขประจำตัว`, `เลขประจำตัวประชาชน`, `ชื่อ-สกุล`, `วันเดือนปีเกิด`
- Attendance: `เวลา1..เวลา7` → grid of week × day × period; cell values `/` (present), `ล` (leave), `ข` (absent), blank (non-school day)
- Formative scoring: `คะแนน1` → score 0–3 against each indicator code (e.g. `ต 1.1 ป.1/1`)
- Summative scoring: `คะแนน2` → `ระหว่างเรียน + กลางภาค + ปลายภาค = 100` → grade by IF-ladder: `≥80→4, ≥75→3.5, ≥70→3, ≥65→2.5, ≥60→2, ≥55→1.5, ≥50→1, else→0`; `สอบแก้ตัว` (makeup) field
- Subject score-weights reference: `คะแนนวิชา` → 11 subjects, two groups: 70/30 (e.g. ภาษาอังกฤษ, ภาษาไทย) and 80/20 (e.g. ศิลปะ, สุขศึกษา); group-1 splits 70 into ก่อนกลางปี 25 + สอบกลางปี 20 + หลังกลางปี 25, group-2 splits 80 into 30/20/30, both close with 30/20 final
- Characteristics: `คุณลักษณะ` → 8 traits × 10 pts = 80 total → label by IF-ladder: `≥70→ดีเยี่ยม, ≥60→ดี, ≥50→ผ่านเกณฑ์, else→ไม่ผ่าน`
- Read-Think-Write: `อ่านคิด` → 10 sub-items × 10 pts = 100 → `≥90→ดีเยี่ยม, ≥80→ดี, ≥70→ผ่านเกณฑ์, else→ไม่ผ่าน`
- Cover/report: `ปก` → school header, teacher signatures, COUNTIF summary of grades, characteristics, read-think-write
- Static refs: `วิธีทำ1/2`, `คำอธิบาย`, `ตัวชี้วัด` → instructions and indicator code list

## 2. Goals
- Replace the per-file Excel workflow with one shared web app the whole school uses.
- Preserve every calculation and every output of the source Excel with 1:1 numerical fidelity (a teacher who recomputes by hand from the original Excel rules must get the same numbers).
- Let teachers concurrently enter scores and attendance without overwriting each other (sheet-row locking).
- Produce a printable PDF of the cover report (ปก) that visually matches the Excel template.
- Provide an admin role that can see all classes/subjects across the school.

## 3. Quality Gates

These checks must pass for every user story:
- Author manually opens the deployed Apps Script web app URL in a browser, signs in, and exercises the feature end-to-end.
- Author verifies any computed numbers (grades, sums, attendance counts) by hand against the Excel source on at least one student before marking the story done.
- No JavaScript errors in browser console; no error toasts in Apps Script execution log for the happy path.
- Thai text renders correctly (no mojibake/`?` boxes) in both the UI and the exported PDF.

## 4. User Stories

### US-001: Bootstrap master Sheet schema
**Description:** As the developer, I want a single master Google Sheet with all tables pre-created so the rest of the app has a stable DB to read/write.

**Acceptance Criteria:**
- [ ] Create one Google Sheet titled `popoWebApp_DB`.
- [ ] Create tabs: `Users`, `Classes`, `Subjects`, `Students`, `Enrollments`, `Indicators`, `Attendance`, `IndicatorScores`, `SummativeScores`, `Characteristics`, `ReadThinkWrite`, `SubjectWeights`, `SchoolInfo`, `AuditLog`.
- [ ] Each tab has a header row matching the field list in the data model section (FR-1 below).
- [ ] First row is frozen and bold.
- [ ] Sheet ID is stored as an Apps Script Script Property `DB_SHEET_ID`.
- [ ] Open `popoWebApp_DB` and visually confirm all 14 tabs and headers exist.

### US-002: Auth — login form and session
**Description:** As a teacher or admin, I want to log in with a username and password so my edits are attributed to me and I only see what I'm allowed to see.

**Acceptance Criteria:**
- [ ] `doGet` shows a login page when no session is active.
- [ ] Login form posts `username` + `password` to a server function.
- [ ] Server looks up `Users` row by `username`, verifies password using `Utilities.computeDigest(SHA_256, password+salt)` against `password_hash`, fails closed.
- [ ] On success, write a row to `CacheService.getUserCache()` keyed by a random session token, value = `{user_id, role, expires_at}` with 12h TTL.
- [ ] Token is returned as a `setcookie` style attribute on `HtmlOutput` (Apps Script doesn't have real cookies; use `HtmlService.createHtmlOutput().append("<script>localStorage.setItem('token',...)</script>")` instead).
- [ ] Subsequent requests include the token; expired/invalid tokens redirect to login.
- [ ] `Logout` button clears the token.
- [ ] Manually create one teacher and one admin row in `Users`, log in as each, confirm role-gated pages behave correctly.

### US-003: Auth — seed users and password reset by admin
**Description:** As an admin, I want to create new teacher accounts and reset passwords so I can onboard staff.

**Acceptance Criteria:**
- [ ] Admin-only `Users` management page lists all rows in `Users` tab.
- [ ] Form to add a new user: `username`, `full_name`, `role` (teacher/admin), initial password.
- [ ] Form to reset password for an existing user.
- [ ] Passwords are hashed with a per-row salt before write; plaintext never persists.
- [ ] Non-admin users hitting the page are rejected with a clear message.

### US-004: School info + classes + subjects setup
**Description:** As an admin, I want to record the school identity, the academic year, and the list of classes and subjects so teachers can be assigned to them.

**Acceptance Criteria:**
- [ ] `SchoolInfo` tab holds one row: school name, อำเภอ, จังหวัด, ปีการศึกษา. Editable on an admin form.
- [ ] `Classes` tab CRUD: `class_id`, `level` (e.g. ป.1), `section`, `homeroom_teacher_user_id`. CSV import accepts `homeroom_teacher_fullname` (resolved to `user_id` server-side).
- [ ] `Subjects` tab CRUD: `subject_id`, `subject_name` (e.g. ภาษาอังกฤษ), `subject_code` (e.g. อ 11101), `hours_per_year` (e.g. 160), `weight_group` (1 or 2 — see FR-7).
- [ ] Pre-seed `Subjects` with the 11 subjects from the `คะแนนวิชา` sheet (ภาษาไทย, คณิตศาสตร์, วิทยาศาสตร์, สังคมศึกษา, ประวัติศาสตร์, ศิลปะ, สุขศึกษาพลศึกษา, การงานอาชีพ, ภาษาอังกฤษ, วิทยาการคำนวณ, การป้องกัน) with the correct group-1/group-2 assignment from the source Excel.
- [ ] Admin can assign one or more teachers to a (class, subject) tuple via `Enrollments` tab.

### US-005: Student roster — CRUD
**Description:** As a homeroom teacher, I want to add and edit the student list for my class so all subjects share one roster.

**Acceptance Criteria:**
- [ ] `Students` tab columns: `student_id`, `class_id`, `seq_no` (เลขที่), `student_code` (เลขประจำตัว), `citizen_id` (เลขประจำตัวประชาชน), `full_name` (ชื่อ-สกุล), `dob` (วันเดือนปีเกิด in Thai format `DD MMM YY`), `note`.
- [ ] List view filtered by `class_id`, ordered by `seq_no`.
- [ ] Add/edit/delete forms with citizen-ID uniqueness validation.
- [ ] Only the homeroom teacher of that class or an admin can edit; other teachers see read-only.
- [ ] Reproduce the 13 students from the source Excel as a manual data-entry verification step.

### US-006: Indicator (ตัวชี้วัด) catalog
**Description:** As an admin, I want a per-subject catalog of learning indicators (รหัสตัวชี้วัด) so teachers can score against them.

**Acceptance Criteria:**
- [ ] `Indicators` tab: `indicator_id`, `subject_id`, `code` (e.g. `ต 1.1 ป.1/1`), `description`, `max_score` (default 3), `display_order`.
- [ ] Admin CRUD form per subject.
- [ ] Pre-seed the 16 English Grade-1 indicators from `คะแนน1` (`ต 1.1 ป.1/1`, `ต 1.1 ป.1/3`, `ต 1.2 ป.1/1..4`, `ต 2.1 ป.1/1..3`, `ต 2.2 ป.1/1`, `ต 3.1 ป.1/1`, `ต 1.1 ป.1/2`, `ต 1.1 ป.1/4`, `ต 1.3 ป.1/1`, `ต 4.1 ป.1/1`, `ต 4.2 ป.1/1`) for verification.

### US-007: Attendance grid view + edit
**Description:** As a teacher, I want to mark daily attendance per period for my class on a week grid so I can track presence over the year.

**Acceptance Criteria:**
- [ ] Page param: `class_id`, `subject_id`, `week_no` (1–40, matches `เวลา1..7` collectively cover ~40 weeks).
- [ ] Render a grid: rows = students (from roster), columns = (date, day-of-week-Thai-abbrev) for the 7 days of that week, each cell editable.
- [ ] Cell accepts: `/` (present), `ล` (leave), `ข` (absent), blank (non-school day).
- [ ] "Save" writes/upserts rows into `Attendance` tab: `attendance_id`, `student_id`, `subject_id`, `date`, `period`, `status`, `updated_by`, `updated_at`.
- [ ] Concurrent-edit safety: use `LockService.getDocumentLock()` with 30s timeout around writes.
- [ ] Week navigation: previous/next week buttons; jump to week N.
- [ ] Bottom of page shows per-student totals: `present_count`, `leave_count`, `absent_count`, `total_hours_so_far`.
- [ ] Verify totals match a hand count for student 1 across week 1.

### US-008: Formative indicator scoring (คะแนน1)
**Description:** As a teacher, I want to enter a score 0–3 for each student against each indicator so the formative half of the grade is captured.

**Acceptance Criteria:**
- [ ] Page param: `class_id`, `subject_id`.
- [ ] Grid: rows = students, columns = indicators (ordered by `display_order`), each cell numeric 0–`max_score`.
- [ ] Save writes to `IndicatorScores`: `id`, `student_id`, `subject_id`, `indicator_id`, `score`, `updated_by`, `updated_at`.
- [ ] Header shows `max_score` per indicator.
- [ ] Row total + class average shown live in JS.
- [ ] Sum across all indicators per student is exposed as `formative_total` (used by US-009).

### US-009: Summative scoring + grade computation (คะแนน2)
**Description:** As a teacher, I want to enter midterm, final, and coursework scores and have the system compute the 0–4 grade exactly as the Excel does.

**Acceptance Criteria:**
- [ ] Page param: `class_id`, `subject_id`.
- [ ] For each student show columns: `ระหว่างเรียน` (coursework, max from `SubjectWeights`), `สอบกลางภาค` (midterm, max from `SubjectWeights`), `สอบปลายภาค` (final, max from `SubjectWeights`), computed `รวมทั้งหมด` (sum), computed `ผลการประเมิน` (grade), `สอบแก้ตัว` (makeup grade, optional override).
- [ ] Grade is computed by exactly this ladder applied to `รวมทั้งหมด`: `≥80→4, ≥75→3.5, ≥70→3, ≥65→2.5, ≥60→2, ≥55→1.5, ≥50→1, else→0`. Empty total renders empty grade.
- [ ] `สอบแก้ตัว` cell can hold a manually-entered grade that overrides the computed grade only for the "displayed grade" but the raw computed grade is still stored.
- [ ] Write/upsert into `SummativeScores`: `id`, `student_id`, `subject_id`, `coursework`, `midterm`, `final`, `total` (formula), `computed_grade`, `makeup_grade`, `final_grade` (makeup if set else computed), `updated_by`, `updated_at`.
- [ ] Verify against `คะแนน2` row 5 (Total=82 → 4) and row 13 (Total=75 → 3.5).

### US-010: Subject weights config (คะแนนวิชา)
**Description:** As an admin, I want to configure how each subject's 100 points splits across periods so the summative form uses the right column maxes.

**Acceptance Criteria:**
- [ ] `SubjectWeights` tab: `subject_id`, `coursework_max` (e.g. 70 or 80), `final_max` (e.g. 30 or 20), `pre_mid_max`, `mid_max`, `post_mid_max`, `final_exam_max`. Sum must equal 100.
- [ ] Admin form to edit weights per subject.
- [ ] Default: group-1 → 25/20/25/30=100, group-2 → 30/20/30/20=100 (matches `คะแนนวิชา` rows 17–25).
- [ ] Save validates total = 100, errors out otherwise.
- [ ] Summative scoring page (US-009) reads max values from this tab; verify changing weights changes header maxes immediately.

### US-011: Characteristics scoring (คุณลักษณะ)
**Description:** As a teacher, I want to score each student on the 8 affective characteristics and see the auto-label.

**Acceptance Criteria:**
- [ ] Page param: `class_id`, `subject_id`.
- [ ] Grid: rows = students, columns = 8 traits (1. รักชาติ ศาสนา..., 2. ซื่อสัตย์..., 3. มีวินัย, 4. ใฝ่เรียนรู้, 5. อยู่อย่างพอเพียง, 6. มุ่งมั่นในการทำงาน, 7. รักความเป็นไทย, 8. มีจิตสาธารณะ) each 0–10.
- [ ] Computed total (max 80) and label by ladder: `≥70→ดีเยี่ยม, ≥60→ดี, ≥50→ผ่านเกณฑ์, else→ไม่ผ่าน`.
- [ ] Write to `Characteristics`: `id`, `student_id`, `subject_id`, `t1..t8`, `total`, `label`, `updated_by`, `updated_at`.
- [ ] Verify against `คุณลักษณะ` row 5: 10+10+10+9+9+10+10+10=78 → ดีเยี่ยม.

### US-012: Read-Think-Write scoring (อ่านคิด)
**Description:** As a teacher, I want to score each student on the 10 read-think-write sub-items and see the auto-label.

**Acceptance Criteria:**
- [ ] Page param: `class_id`, `subject_id`.
- [ ] Grid: rows = students, 10 columns each 0–10, grouped as อ่าน (3 items), คิดวิเคราะห์ (4 items), เขียน (3 items) — match the source `อ่านคิด` layout.
- [ ] Computed total (max 100) and label by ladder: `≥90→ดีเยี่ยม, ≥80→ดี, ≥70→ผ่านเกณฑ์, else→ไม่ผ่าน`.
- [ ] Write to `ReadThinkWrite`: `id`, `student_id`, `subject_id`, `r1..r3`, `t1..t4`, `w1..w3`, `total`, `label`, `updated_by`, `updated_at`.
- [ ] Verify against `อ่านคิด` row 5: total 90 → ดีเยี่ยม.

### US-013: Cover report aggregates (ปก)
**Description:** As a teacher, I want a one-page summary for a class+subject showing grade distribution, characteristics distribution, read-think-write distribution, and class headers — the digital twin of the `ปก` sheet.

**Acceptance Criteria:**
- [ ] Page param: `class_id`, `subject_id`.
- [ ] Header section shows: school name, อำเภอ, จังหวัด, ปีการศึกษา, ชั้น, รหัสวิชา, เวลาเรียน, ครูผู้สอน, ครูประจำชั้น (joined from `SchoolInfo`, `Classes`, `Subjects`, `Enrollments`, `Users`).
- [ ] Grade distribution table: counts of students at each grade level 4, 3.5, 3, 2.5, 2, 1.5, 1, 0 (COUNTIF over `SummativeScores.final_grade` for this class+subject) AND their percentages (count×100/total).
- [ ] กิจกรรมพัฒนาผู้เรียน section: ผ่าน / ไม่ผ่าน / ร / มส counts (these come from a per-student field — add `dev_activity_result` column to `Enrollments` or a new tab `DevActivity` to hold it). Form to set per student.
- [ ] Characteristics distribution: counts at 3 (ดีเยี่ยม) / 2 (ดี) / 1 (ผ่าน) / 0 (ไม่ผ่าน) with percentages.
- [ ] Read-Think-Write distribution: same four-bucket counts + percentages.
- [ ] Verify the English-Grade-1 numbers: total 13, grade counts 4=6, 3.5=2, 3=4 (from `ปก` row 17).

### US-014: PDF export of cover report
**Description:** As a teacher, I want to export the cover report as a PDF that visually matches the original Excel `ปก` page so I can print and sign it.

**Acceptance Criteria:**
- [ ] A hidden Google Sheet file (template) is provisioned (one-time) that mirrors the `ปก` layout exactly: merged cells, school header, COUNTIF placeholders, signature blocks.
- [ ] "Export PDF" button: server function copies the template, fills in the cell values from US-013 aggregates and `SchoolInfo`/teacher names, exports the copy as PDF via `DriveApp.getFileById(id).getAs('application/pdf')`, returns the blob to the browser as a download, then deletes the temporary copy.
- [ ] PDF page size = A4 portrait, Thai fonts render correctly.
- [ ] Manually generate a PDF for English-Grade-1, confirm it matches the source `ปก` page screenshot side-by-side (signature blocks, summary table positions, dates).

### US-015: Static reference pages
**Description:** As a teacher, I want read-only pages showing the system's instructions, score-scale explanation, and subject-weight reference so I don't have to leave the app to look them up.

**Acceptance Criteria:**
- [ ] `Help / วิธีทำ` page renders text from `วิธีทำ1` and `วิธีทำ2` content (static HTML).
- [ ] `คำอธิบายรายวิชา` page renders the description (admin-editable rich-text field in `Subjects`).
- [ ] `ตัวชี้วัด` page lists all indicators for the selected subject (read view of `Indicators`).
- [ ] `คะแนนวิชา` page renders the read-only `SubjectWeights` table for all subjects.

### US-016: Audit log
**Description:** As an admin, I want an audit trail of who changed what, when, so I can investigate grade disputes.

**Acceptance Criteria:**
- [ ] On every write to `Attendance`, `IndicatorScores`, `SummativeScores`, `Characteristics`, `ReadThinkWrite`, `Students`, append a row to `AuditLog`: `timestamp`, `user_id`, `entity`, `entity_id`, `old_value` (JSON), `new_value` (JSON).
- [ ] Admin-only audit page with filters by user, date range, entity.
- [ ] Verify: edit one summative score as teacher A, see the row in audit log.

### US-017: Deployment + first-run setup wizard
**Description:** As the deployer, I want to deploy the Apps Script and run a one-time setup so a fresh school can start using the app.

**Acceptance Criteria:**
- [ ] `clasp` config committed (`.clasp.json` template, not the real one); README documents the deploy steps.
- [ ] First-run wizard: if `Users` is empty, prompt to create the first admin user; create the master Sheet if `DB_SHEET_ID` script-property is unset; create the PDF template Sheet.
- [ ] After wizard, redirect to login.
- [ ] Manually delete the script properties, hit the URL, walk through the wizard, end up at a usable empty system.

## 5. Functional Requirements

- FR-1: **Data model** — the 14 Sheet tabs and their columns (verbatim, used to bootstrap US-001):
  - `Users(user_id, username, password_hash, salt, full_name, role, created_at)`
  - `SchoolInfo(school_name, district, province, academic_year)`
  - `Classes(class_id, level, section, homeroom_teacher_user_id)`
  - `Subjects(subject_id, subject_name, subject_code, hours_per_year, weight_group, description)`
  - `Enrollments(enrollment_id, class_id, subject_id, teacher_user_id, dev_activity_result)`
  - `Students(student_id, class_id, seq_no, student_code, citizen_id, full_name, dob, note)`
  - `Indicators(indicator_id, subject_id, code, description, max_score, display_order)`
  - `SubjectWeights(subject_id, coursework_max, final_max, pre_mid_max, mid_max, post_mid_max, final_exam_max)`
  - `Attendance(attendance_id, student_id, subject_id, date, period, status, updated_by, updated_at)`
  - `IndicatorScores(id, student_id, subject_id, indicator_id, score, updated_by, updated_at)`
  - `SummativeScores(id, student_id, subject_id, coursework, midterm, final, total, computed_grade, makeup_grade, final_grade, updated_by, updated_at)`
  - `Characteristics(id, student_id, subject_id, t1..t8, total, label, updated_by, updated_at)`
  - `ReadThinkWrite(id, student_id, subject_id, r1..r3, t1..t4, w1..w3, total, label, updated_by, updated_at)`
  - `AuditLog(timestamp, user_id, entity, entity_id, old_value, new_value)`
- FR-2: All writes must wrap in `LockService.getDocumentLock().tryLock(30000)`; release in `finally`.
- FR-3: Apps Script web app must be deployed with `Execute as: User accessing the web app` and `Who has access: Anyone` (the custom username/password auth replaces Google's).
- FR-4: Grade ladder for `SummativeScores.computed_grade` is fixed: `≥80→4, ≥75→3.5, ≥70→3, ≥65→2.5, ≥60→2, ≥55→1.5, ≥50→1, else→0`.
- FR-5: Characteristics label ladder: `≥70→ดีเยี่ยม, ≥60→ดี, ≥50→ผ่านเกณฑ์, else→ไม่ผ่าน` (max 80).
- FR-6: Read-Think-Write label ladder: `≥90→ดีเยี่ยม, ≥80→ดี, ≥70→ผ่านเกณฑ์, else→ไม่ผ่าน` (max 100).
- FR-7: Subjects in `weight_group=1` (ภาษาไทย, คณิตศาสตร์, วิทยาศาสตร์, สังคมศึกษา, ประวัติศาสตร์, ภาษาอังกฤษ): default split 70:30 (coursework:final) and within coursework 25:20:25 (pre-mid, mid, post-mid). Subjects in `weight_group=2` (ศิลปะ, สุขศึกษาพลศึกษา, การงานอาชีพ, วิทยาการคำนวณ, การป้องกัน): default 80:20 with internal 30:20:30.
- FR-8: All UI labels, error messages, and exported PDFs are in Thai. The login form may be bilingual.
- FR-9: Role authorization: `teacher` can only read/write data for class+subject combos they are enrolled in via `Enrollments`. `admin` can read/write all data and access user-management pages.
- FR-10: Every form must show a save-confirmation toast and disable the save button while in flight to prevent double-submits.

## 6. Non-Goals (Out of Scope for v1)
- Mobile-app version (PWA only, no native app).
- Real-time multi-user co-editing of the same grid cell (last-write-wins is fine; lock service prevents row-level corruption).
- Importing existing `.xlsx` files (manual entry only; no Excel parser).
- Parent/student-facing views — only teachers and admins log in.
- Export formats other than PDF (no `.xlsx` export, no CSV).
- Internationalization (Thai only).
- Email notifications, SMS, line-notify integration.
- Bulk operations across multiple classes at once.
- A separate semester model — v1 treats one academic year as one continuous period (matches the source Excel).
- Recovery of deleted records beyond what `AuditLog` provides.

## 7. Technical Considerations

### Why this stack has real risk and what to do about it
- **Apps Script execution limits:** 6-min per execution, 30s per simultaneous user execution, daily quotas. Mitigation: keep server functions small; do summary recomputation on read, not on every write; consider caching aggregates in `CacheService` for the cover-report page.
- **Sheets-as-DB row limits:** Sheets caps at 10M cells. The `Attendance` tab is the worst case: 13 students × 7 periods × ~200 school days = 18,200 rows per class-subject per year; for a 12-class school with 11 subjects that's ~2.4M rows. Still under the cap but I/O gets slow. Mitigation: one Sheet file per academic year; archive older years.
- **No transactions:** mitigated by `LockService` + audit-log compensating reads.
- **Cold start:** Apps Script web apps cold-start 1–3s. Acceptable for a school grade book.
- **Auth security:** Custom password auth on Sheets is risky. Use SHA-256 + per-row salt; never log plaintext; rotate salts on password reset; rate-limit login attempts via a `LoginAttempts` cache key per username.

### Architecture
- `Code.gs` — entry: `doGet(e)`, router based on `e.parameter.page`.
- `auth.gs` — login, session, role check.
- `db.gs` — thin wrapper around `SpreadsheetApp` providing `getAll(tab)`, `insert(tab, row)`, `update(tab, id, row)`, `delete(tab, id)`, all using `LockService`.
- `pages/*.html` — one per route; `<?!= include('partials/header') ?>` server-side templating.
- `js/*.js.html` — client-side controllers, included via `HtmlService.createTemplateFromFile`.
- `pdf.gs` — cover-report PDF generation using the hidden template Sheet.

### Why I still recommend reconsidering the stack
Stated upfront so you can choose with eyes open: the user picked GAS over Django, and the user knows Python. The story list above is doable in GAS but the JS-only constraint means ~3000 lines of JavaScript the user will have to learn. **Django + SQLite on PythonAnywhere free tier would deliver this faster for someone with Python skills, and Django Admin alone replaces US-003, US-004, US-006, US-010, and US-015.** Suggest revisiting after US-001/US-002 if Apps Script velocity feels slow.

## 8. Success Metrics
- A teacher can complete one full grading cycle (enter attendance for a week + scores for one indicator + summative + characteristics + read-think-write for 13 students) in under 30 minutes.
- The exported PDF for the English-Grade-1 sample matches the original `ปก` page on visual inspection — same numbers, same layout, same signature blocks.
- Zero data-loss events (no overwritten cells reported by teachers) in the first month of use.
- 100% of computed grades match the Excel IF-ladder on a spot-check of 20 random students.

## 9. Open Questions
- Should `seq_no` (เลขที่) auto-renumber when a student is deleted, or stay sparse? The source Excel has a gap (12, 13 both at `เลขประจำตัว` 1764) which suggests sparse is OK.
- Should the PDF cover report include the student-level grade table, or only the aggregate distributions? Source `ปก` shows only aggregates.
- Should we support importing a roster from the existing Excel as a one-time migration helper, or is manual entry acceptable? Currently scoped as manual.
- Should the homeroom teacher's "ลงชื่อ" signature be a stored image upload or just printed name? Source `ปก` has only printed names.
- The two `เกณฑ์` named ranges (`grad2`, `grad3`, `grade01`) point to an external file `[1]เกณฑ์`. Is there a separate校 master grading-criteria file we should integrate, or are the inline ladders sufficient?
[/PRD]
