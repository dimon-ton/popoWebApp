# Ralph Progress Log

This file tracks progress across iterations. Agents update this file
after each iteration and it's included in prompts for context.

## Codebase Patterns (Study These First)

- **SchoolInfo is a single-row table**: Always read row 0 from `dbGetAll('SchoolInfo')` for the current values. To update, write directly to sheet row 2 (the data row) rather than using `dbUpdate()` keyed on `school_name`, which would break if the name itself changes.
- **DEFAULT_WEIGHTS keys must be strings**: JavaScript object keys are always strings; define them as `'1'` and `'2'` and access with `DEFAULT_WEIGHTS[String(grp)]` to avoid integer/string key mismatch.
- **Admin page guard in getPageHtml is a whitelist**: New admin pages must be added to both the `adminPages` array in `doGet` AND the identical array in `getPageHtml` for consistent protection (navigation and direct URL).
- **preseedSubjects() is idempotent**: Checks existing IDs before inserting — safe to call multiple times without creating duplicates.
- **Attendance upsert pattern (low-lock bulk write)**: For attendance saves, read the full sheet once into a local `data` array, loop over pending cells to find-and-update in sheet cells individually (via `getRange(row, col).setValue()`), and push newly inserted rows into the local `data` array so subsequent cells in the same batch can match against them — avoids a second full-sheet read mid-lock.
- **formatDateISO helper in attendance.gs**: Converts any JS `Date` to `YYYY-MM-DD` string. Must be used consistently on both write and read paths to avoid date format mismatches when Google Sheets stores dates as Date objects vs. ISO strings.

- **Extra-param page navigation**: `getPageHtml(token, page)` only injects `{ session, token }`. For pages that need an extra param (e.g. `class_id`), add a dedicated `getXxxPageHtml(token, extraParam)` function in `Code.gs` and call it from the parent page via `google.script.run`. Add a matching `case 'xxx'` in `doGet` that reads the extra param from `e.parameter`.
- **GAS global scope**: All `.gs` files share one global scope — variables like `TAB_ORDER` defined in `setup.gs` are accessible from `Code.gs` without imports.
- **Page routing**: `doGet` switches on `e.parameter.page`; `buildPage(name, data)` renders the named HTML template. Admin pages are listed in `adminPages` array in both `doGet` and `getPageHtml`.
- **Client-side GAS calls**: HTML pages call server functions via `google.script.run.withSuccessHandler(fn).functionName(args)`. No `fetch`/HTTP from the HTML side.
- **Test API pattern**: All seed/cleanup calls go through `?api=<op>&auth_token=<TOKEN>` query params, gated by `TEST_API_TOKEN` Script Property.
- **TAB_ORDER in setup.gs**: The 14-tab schema is defined there as `TAB_ORDER` + `TAB_SCHEMA`. Any function in Code.gs can reference `TAB_ORDER` directly.
- **Session token in localStorage**: After login, `popo_token` is stored in `localStorage`. `login.html` checks for it on load and auto-navigates to dashboard if valid. Dashboard writes it back via `localStorage.setItem`. Logout calls `serverLogout(token)` to remove the cache entry then `getLoginHtml()` to replace the page.
- **Navigation via document.write**: All page navigation in GAS web app works by calling a server function that returns full HTML, then calling `document.open(); document.write(html); document.close()`. This replaces the entire page content including scripts. Playwright handles this fine.
- **Playwright fresh-context test pattern**: For auth tests that need to test the login UI itself, use `test.use({ storageState: { cookies: [], origins: [] } })` inside the describe block to override the global `auth.json` storageState.

- **Student page navigation pattern**: `getPageHtml(token, page)` only passes `session` and `token` as template data. For pages that need extra URL params (like `class_id`), add a dedicated `getXxxPageHtml(token, extra_param)` function that builds the template with the extra data. Call it from the parent page via `google.script.run.getXxxPageHtml(TOKEN, param)`.

---

## 2026-05-21 - US-016
- What was implemented: Audit log — admin-only `/admin/audit` page with filters (user_id, entity, date range). Server functions `getAuditLog(token, filters)` and `getAuditEntities(token)` in `src/audit.gs`. Page auto-loads on open, supports filter-then-search, shows newest-first up to 500 rows with entity badge and JSON value columns. `appendAuditLog` was already called in all required write paths (summative, attendance, formative, characteristics, readthinkwrite, students, enrollments). Added `admin_audit` to both `adminPages` arrays in `doGet` and `getPageHtml`. Added audit log link to `dashboard.html` admin menu.
- Files changed: `src/audit.gs` (new), `src/admin_audit.html` (new), `src/Code.gs` (router case + adminPages), `src/dashboard.html` (menu link), `tests/admin.spec.ts` (US-016 describe block with 4 tests + seedTestStudent import)
- **Learnings:**
  - `appendAuditLog` was already in `db.gs` and called from all write paths — US-016 only needed the read/display side (server query function + admin page).
  - AuditLog `user_id` entries come from the session's `user_id`, which may not have the `test_` prefix (admin's user_id is set at setup). The cleanup `dbDeleteWhere('AuditLog', 'user_id', 'test_')` only removes audit rows written by test users — audit rows from admin edits during tests are left in place (acceptable).
  - The admin role bypasses enrollment checks in `serverSaveSummative`, so no enrollment seeding is needed for admin-driven test saves.
  - Playwright test for audit page: filter by entity then click search; wait for `#auditStatus` to not contain "กำลังค้นหา" before asserting table rows.
---

## 2026-05-21 - US-015
- What was implemented: Static reference pages — `/help` (คู่มือการใช้งาน with วิธีทำ1/วิธีทำ2 content), `/weights_ref` (read-only weights table), `/subject_description` (per-subject description), `/subject_indicators_ref` (per-subject indicators list).
- Files changed: `src/help.html` (new), `src/weights_ref.html` (new), `src/subject_description.html` (new), `src/subject_indicators_ref.html` (new), `src/admin_school.gs` (added `getWeightsForRef`, `getSubjectDescription`, `getSubjectIndicatorsRef`), `src/Code.gs` (added 4 router cases + 2 navigation helper functions), `src/dashboard.html` (added คู่มือ and น้ำหนักคะแนน menu links), `tests/admin.spec.ts` (US-015 describe block with 4 tests).
- **Learnings:**
  - Read-only reference pages (accessible to any logged-in user, not just admin) must NOT be added to the `adminPages` whitelist in either `doGet` or `getPageHtml`. The existing session-check gate is sufficient.
  - `getPageHtml(token, 'help')` and `getPageHtml(token, 'weights_ref')` work correctly because those pages only use `data.token` and `data.session` from template data — no extra params needed.
  - Pages needing extra URL params (subject_id) at navigate-time need dedicated `getXxxPageHtml(token, subject_id)` functions; the generic `getPageHtml` can't carry extra params. Direct URL access works via the `doGet` switch case which reads from `e.parameter`.
  - For the `/weights_ref` page, a new server function `getWeightsForRef` was created (open to all logged-in users) rather than reusing `getWeightsList` which requires admin role.
---

## 2026-05-21 - US-014
- What was implemented: PDF export of cover report (ปก). Added `serverExportReportPdf(token, class_id, subject_id)` to `src/report.gs`: reuses `getReportData()`, creates a temp Google Spreadsheet with all cover-report sections (header info, grade distribution, dev activity, characteristics, RTW), exports it as A4 PDF via `DriveApp.getFileById(id).getAs('application/pdf')`, encodes as base64, trashes the temp file, returns `{ ok, base64, filename }`. Client (`class_report.html`) decodes base64, creates a Blob URL, and triggers download via a hidden anchor — shows "ดาวน์โหลด PDF สำเร็จ" toast on success.
- Files changed: `src/report.gs` (new `serverExportReportPdf` function), `src/class_report.html` (Export PDF button + `exportPdf()` JS function + button CSS), `tests/scoring.spec.ts` (US-014 describe block with 2 tests).
- **Learnings:**
  - GAS PDF export: create a temp `SpreadsheetApp.create()`, fill data, call `DriveApp.getFileById(id).getAs('application/pdf')`, then `setTrashed(true)` to clean up. Returns base64 via `Utilities.base64Encode(pdfBlob.getBytes())`.
  - Blob URL downloads inside GAS iframes (googleusercontent.com) do NOT fire Playwright's `page.waitForEvent('download')`. The correct Playwright assertion is to watch for the success toast message that fires after the client-side download JS completes successfully.
  - The Export PDF button is initially `display:none` and is shown by `renderReport()` after the report content loads — this avoids premature clicks before data is ready.
  - `serverExportReportPdf` re-calls `getReportData()` internally rather than accepting the data as a parameter, which keeps the function self-contained and avoids passing large objects via `google.script.run`.
---

## 2026-05-21 - US-013
- What was implemented: Cover report aggregates page (`/class/:class_id/subject/:subject_id/report`) — already fully implemented in a prior iteration. Verified all acceptance criteria met.
- Files confirmed complete: `src/report.gs` (getReportData, serverSaveDevActivity), `src/class_report.html` (header info grid, grade distribution table, กิจกรรมพัฒนาผู้เรียน summary + per-student edit form, characteristics distribution, RTW distribution), `src/Code.gs` (case 'class_report' in doGet, getReportPageHtml), `src/testapi.gs` (seed_summative case with computeGrade), `src/setup.gs` (DevActivity tab schema), `tests/helpers/seed.ts` (seedTestSummative), `tests/scoring.spec.ts` (US-013 describe block with 3 tests).
- **Learnings:**
  - `grade-count-{grade}` IDs use `.replace('.', '-')` so grade 3.5 → `grade-count-3-5`. Playwright locators must match exactly.
  - DevActivity reads are wrapped in try/catch because the tab may not exist on first deploy — counts fall back to 0 gracefully.
  - `seedTestSummative` seeds a full SummativeScores row including `computed_grade` (via `computeGrade()`) and `final_grade`. The student_id must be the exact ID format returned by `seedTestStudent` (`test_student_{class_suffix}_{seq}`).
---

## 2026-05-20 - US-012
- What was implemented: Read-Think-Write scoring page (`/class/:class_id/subject/:subject_id/readthinkwrite`) — 10 sub-item columns (0–10 each) grouped visually into อ่าน (r1–r3), คิดวิเคราะห์ (t1–t4), เขียน (w1–w3), live total (max 100), live label via ladder (≥90→ดีเยี่ยม, ≥80→ดี, ≥70→ผ่านเกณฑ์, else→ไม่ผ่าน), save with LockService upsert pattern.
- Server functions in `src/readthinkwrite.gs`: `computeReadThinkWriteLabel(total)`, `getReadThinkWriteData(token, class_id, subject_id)`, `serverSaveReadThinkWrite(token, class_id, subject_id, rows)`.
- Used a `rtFields` array `['r1','r2','r3','t1','t2','t3','t4','w1','w2','w3']` to loop over field names instead of hard-coding each one — cleaner than the characteristics approach that mapped n→'t'+n.
- `fieldCols` map (field→column index) pre-computed before the row loop; avoids repeated `headers.indexOf` calls per row.
- Created `src/class_readthinkwrite.html` with: two-row header (group headers + column headers using `rowspan`/`colspan`), 10 score inputs, live `updateRowTotal()` via `oninput`, label CSS classes, save bar.
- Used `COLUMNS` array `[{key, label, group}]` in client JS to drive both header rendering and input data collection — single source of truth for all 10 columns.
- Added `case 'class_readthinkwrite'` to `doGet` router in `Code.gs`.
- Added `getReadThinkWritePageHtml(token, class_id, subject_id)` to `Code.gs`.
- Added US-012 describe block to `tests/scoring.spec.ts`: 3 tests — page load with group headers visible, live total=90 label=ดีเยี่ยม for [10,9,9,9,9,8,9,9,9,9], save + reload persists.
- Files changed: `src/readthinkwrite.gs` (new), `src/class_readthinkwrite.html` (new), `src/Code.gs`, `tests/scoring.spec.ts`
- **Learnings:**
  - Using an array of field-name strings (`rtFields`) to loop over columns avoids the n→'t'+n mapping pattern used in characteristics — more readable and less error-prone when field names don't follow a simple numeric sequence.
  - Two-row table headers (group row + column row) with `rowspan`/`colspan` require HTML string building in a single `thead.innerHTML` assignment; building them as separate `<tr>` strings concatenated before assigning works cleanly.
  - The `COLUMNS` array in client JS serves as a single source of truth for both rendering the header and collecting input values for save — no need to maintain two separate lists.
---

## 2026-05-20 - US-011
- What was implemented: Characteristics scoring page (`/class/:class_id/subject/:subject_id/characteristics`) — 8 affective trait columns (0–10 each), live total (max 80), live label via ladder (≥70→ดีเยี่ยม, ≥60→ดี, ≥50→ผ่านเกณฑ์, else→ไม่ผ่าน), save with LockService upsert pattern.
- Server functions in `src/characteristics.gs`: `computeCharacteristicsLabel(total)`, `getCharacteristicsData(token, class_id, subject_id)`, `serverSaveCharacteristics(token, class_id, subject_id, rows)`.
- `getCharacteristicsData()` returns students (sorted by seq_no), score map (student_id → {t1..t8, total, label}), subject/class info, and `can_edit` flag.
- `serverSaveCharacteristics()` uses the same upsert pattern as formative/summative: one lock acquisition, one sheet read, update-or-append per row.
- Clamps each trait to [0, 10] server-side; `allEmpty` check ensures total stays blank when no values are entered.
- Created `src/class_characteristics.html` with: 8 trait inputs (0–10), live `updateRowTotal()` via `oninput`, label CSS classes (diyiam/di/pass/fail) for color-coded display, save bar with disable-while-inflight.
- Added `case 'class_characteristics'` to `doGet` router in `Code.gs`.
- Added `getCharacteristicsPageHtml(token, class_id, subject_id)` to `Code.gs` for programmatic navigation.
- Added US-011 describe block to `tests/scoring.spec.ts`: 3 tests — page load assertions (heading, 8 trait headers, student visible), live total=78 label=ดีเยี่ยม for [10,10,10,9,9,10,10,10], live total=67 label=ดี for [8,8,8,9,9,8,9,8] + save + reload persists.
- Files changed: `src/characteristics.gs` (new), `src/class_characteristics.html` (new), `src/Code.gs`, `tests/scoring.spec.ts`
- **Learnings:**
  - Characteristics uses the same upsert pattern as formative/summative — no new patterns needed.
  - Label CSS classes on the `td.label-col` element give instant visual feedback; updating `className` directly from `updateRowTotal()` keeps them in sync with the input state.
  - `allEmpty` sentinel (set to `false` when any trait has a value) prevents computing a total of 0 when all inputs are blank — matches the summative "leave empty if not entered" convention.
  - Server-side clamp `Math.min(10, Math.max(0, Number(v)))` is essential because `max` attribute enforcement is only client-side.
---

## 2026-05-20 - US-010
- What was implemented: Subject weights admin page (`/admin/weights`) — server functions `getWeightsList()` and `serverSaveWeights()` were already implemented in `admin_school.gs`, and `admin_weights.html` was already created. Only the Playwright tests were missing.
- Added US-010 `test.describe` block to `tests/admin.spec.ts` with 4 tests: (1) page loads and shows subject row, (2) saving with total ≠ 100 shows "รวมต้องเท่ากับ 100" error toast (client-side check), (3) fixing weights to sum=100 and saving shows success toast, (4) summative page shows updated column max (`/25` for mid_max after changing from 20 → 25).
- Seed: uses `seedTestSubject` (group=1) + `seedTestSubjectWeights` + `seedTestClass` in `beforeAll`.
- Files changed: `tests/admin.spec.ts`
- **Learnings:**
  - When verifying "weights change visible in summative headers", choose a weight that maps to one of the three displayed columns (coursework_max, mid_max, final_exam_max). Changing only pre_mid/post_mid split without changing the sum of each component won't produce a visible header difference.
  - Client-side validation in `saveWeights()` runs before the server call — the error toast fires without a network round-trip when the row total ≠ 100.
  - `coursework_max` in the DB is always pre_mid+mid+post_mid (computed by the client before sending). The summative header reads `coursework_max` for "ระหว่างเรียน" and `mid_max` for "สอบกลางภาค".
---

## 2026-05-19 - US-009
- Implemented summative scoring page `/class/:class_id/subject/:subject_id/summative` (page key `class_summative`).
- Server functions in `src/summative.gs`: `computeGrade(total)`, `getSummativeData(token, class_id, subject_id)`, `serverSaveSummative(token, class_id, subject_id, rows)`.
- `computeGrade()` implements FR-4 ladder: ≥80→4, ≥75→3.5, ≥70→3, ≥65→2.5, ≥60→2, ≥55→1.5, ≥50→1, else→0. Defined once server-side and mirrored in client JS.
- `getSummativeData()` reads students, subject weights (from `SubjectWeights` tab with default fallback), and existing scores map (student_id → score object).
- `serverSaveSummative()` uses same upsert pattern as formative/attendance: one lock acquisition, one sheet read into local array, update-or-append per row, local array kept in sync.
- `สอบแก้ตัว` (makeup_grade) is stored separately from `computed_grade`; `final_grade` = makeup if set, else computed_grade.
- Created `src/class_summative.html` with: coursework/midterm/final inputs (max from weights), live total and grade via `computeGrade()` in client JS, makeup input in orange styling, final_grade cell updated live on makeup change; save bar with disable-while-inflight.
- Added `case 'class_summative'` to `doGet` router in `Code.gs`.
- Added `getSummativePageHtml(token, class_id, subject_id)` to `Code.gs`.
- Added `seed_subject_weights` case to `src/testapi.gs` (upserts a SubjectWeights row for a test_ subject).
- Added `SubjectWeights` to cleanup `tabIdFields` map (by `subject_id` prefix).
- Added student_id-based secondary cleanup for score tables (IndicatorScores, SummativeScores, Characteristics, ReadThinkWrite, Attendance) since their `id` column uses auto-generated non-test_ prefixes.
- Added `seedTestSubjectWeights()` helper to `tests/helpers/seed.ts`.
- Added US-009 describe block to `tests/scoring.spec.ts`: 4 tests — page load assertions, 42+18+22=82 grade=4 (live), 37+15+23=75 grade=3.5 (live), makeup override + save + reload persists.
- Files changed: `src/summative.gs` (new), `src/class_summative.html` (new), `src/Code.gs`, `src/testapi.gs`, `tests/helpers/seed.ts`, `tests/scoring.spec.ts`
- **Learnings:**
  - Grade ladders should be defined once as a server-side function and mirrored exactly as a client-side function — keeping them in sync is critical for live grade display to match saved grades.
  - `สอบแก้ตัว` (makeup) overrides `final_grade` display without changing `computed_grade` — store both separately in the DB; the client `updateFinalGrade()` function reads the current `grade-{sid}` cell to determine the base when makeup is cleared.
  - Auto-generated IDs (from `generateId()`) don't carry the `test_` prefix, so score table cleanup must use `student_id` (which does carry `test_`) as the cleanup key, not `id`.
  - `SubjectWeights` must be cleaned up with `subject_id` prefix, not added to the auto-generated-id map.
---

## 2026-05-19 - US-008
- Implemented formative indicator scoring page `/class/:class_id/subject/:subject_id/formative`.
- Server functions in `src/formative.gs`: `getFormativeData()`, `serverSaveFormative()`.
- `getFormativeData()` returns students (sorted by seq_no), indicators (sorted by display_order), score map (student_id → indicator_id → score), subject/class info, and `can_edit` flag.
- `serverSaveFormative()` uses the same upsert pattern as attendance: acquires lock once, reads sheet once into local array, updates in-place or appends, with local array kept in sync to avoid re-reads.
- Created `src/class_formative.html` with numeric score inputs, live row total updates via `oninput`, column averages in footer updated live, clamp-on-change validation, save with disable-while-inflight.
- Added `case 'class_formative'` to `doGet` router in `Code.gs`.
- Added `getFormativePageHtml(token, class_id, subject_id)` to `Code.gs` for programmatic navigation.
- Added `seed_indicator` case to `src/testapi.gs` (seeds an Indicators row, prefixed `test_`).
- Added `seedTestIndicator()` helper to `tests/helpers/seed.ts`.
- Created `tests/scoring.spec.ts` with US-008 tests: page load with student + indicator visible, enter score 3 → live row total = 3 → save → reload → value persists.
- Files changed: `src/formative.gs` (new), `src/class_formative.html` (new), `src/Code.gs`, `src/testapi.gs`, `tests/helpers/seed.ts`, `tests/scoring.spec.ts` (new)
- **Learnings:**
  - `oninput` (not `onchange`) fires on every keystroke — use it for live row total updates. `onchange` fires on blur/enter — use it for clamping to max value.
  - Score inputs need both `oninput` (for live total) and `onchange` (for max clamp) handlers since the two behaviors are complementary.
  - `input.closest('tr')` is reliable for finding the parent row from an input inside a table cell — but note GAS's inline HTML-built rows use `innerHTML` assignment, so event handlers set via attribute (onclick/oninput) are the correct approach vs. addEventListener which would require re-querying after each render.
---

## 2026-05-19 - US-007
- Implemented attendance grid page `/class/:class_id/subject/:subject_id/attendance?week=N` (N=1–40).
- Server functions in `src/attendance.gs`: `getAttendanceData()`, `serverSaveAttendance()`, `getAcademicYearStart()`, `formatDateISO()`.
- `getAttendanceData()` returns students, week dates, attendance map (student→date→status), yearly totals per student, subject/class info, and `can_edit` flag.
- `serverSaveAttendance()` does an upsert: reads full sheet once into memory, updates existing rows in-place via `sheet.getRange(row, col).setValue()`, inserts new rows via `appendRow()`, and pushes them into the local array to avoid re-reads mid-lock — all inside one LockService acquisition.
- Academic year start is computed from `SchoolInfo.academic_year` (Thai year → CE, finds first Monday ≥ May 13); falls back to 2024-05-13.
- Click-to-cycle cell UI: cycles `'' → '/' → 'ล' → 'ข' → ''` with color-coded backgrounds. Pending changes tracked in `pendingChanges` dict; cleared on successful save or reload.
- Footer row shows yearly (cross-week) totals per student using `data-student-present/leave/absent` attributes for Playwright assertions.
- Week navigation: prev/next buttons and a 1–40 jump dropdown.
- Created `src/class_attendance.html` with all grid, nav, and save logic.
- Added `case 'class_attendance'` to `doGet` router in `Code.gs`.
- Added `getAttendancePageHtml(token, class_id, subject_id, week)` to `Code.gs` for programmatic navigation.
- Created `tests/attendance.spec.ts` with 5 test cases: page load, cycle+save+reload assertion, footer counts, prev/next navigation, and jump dropdown.
- Files changed: `src/attendance.gs` (new), `src/class_attendance.html` (new), `src/Code.gs`, `tests/attendance.spec.ts` (new)
- **Learnings:**
  - Google Sheets stores date cells as Date objects, not ISO strings — when reading from the sheet via `getDataRange().getValues()`, date cells come back as JS Date objects. Must use `formatDateISO()` on both the stored value and the comparison key to avoid mismatches.
  - Attendance upsert should NOT use `dbInsert`/`dbUpdate` because they each acquire the lock independently — for a batch of N cells this would mean N lock acquisitions and N full-sheet reads. Instead, acquire the lock once, read the sheet once, and update/insert cells individually within the lock.
  - `Object.values()` is available in GAS V8 but to be safe (and to avoid any edge cases) the client JS uses a fallback polyfill pattern.

---

## 2026-05-19 - US-006
- Implemented `/admin/indicators/:subject_id` indicator catalog with full CRUD (add/delete).
- Server functions in `src/indicators.gs`: `getIndicatorsList()`, `serverAddIndicator()`, `serverDeleteIndicator()`, `preseedIndicators()`.
- Pre-seed: `preseedIndicators(token, subject_id)` is idempotent — seeds the 16 English Grade-1 indicator codes only if not already present.
- Created `src/admin_indicators.html` with add form, sortable indicator table, preseed button.
- Added `case 'admin_indicators'` to `doGet` router (reads `params.subject_id` and `params.subject_name`).
- Added `admin_indicators` to both `adminPages` arrays in `doGet` and `getPageHtml`.
- Added `getIndicatorsPageHtml(token, subject_id)` in `Code.gs` for client-side navigation from `admin_subjects.html` (carries subject_id + fetches subject_name from DB).
- Added "ตัวชี้วัด" button per row in `admin_subjects.html` calling `getIndicatorsPageHtml`.
- Added US-006 test block in `tests/admin.spec.ts`: seeds `test_subject_us006_eng`, navigates to indicators page, adds `test_ind_001`, asserts row appears, deletes it, asserts gone.
- Files changed: `src/indicators.gs` (new), `src/admin_indicators.html` (new), `src/Code.gs`, `src/admin_subjects.html`, `tests/admin.spec.ts`
- **Learnings:**
  - `preseedIndicators` must be scoped to a subject_id — unlike `preseedSubjects()` which is school-wide, indicators are per-subject.
  - The `admin_indicators` page receives `subject_id` via `e.parameter.subject_id` in `doGet`; also accessible via dedicated `getIndicatorsPageHtml(token, subject_id)` that resolves `subject_name` from the DB for display.
  - For pages navigated via `google.script.run`, pass both `subject_id` and `subject_name` into the template data so the heading shows something human-readable without an extra round-trip from the client.
---

## 2026-05-19 - US-005
- Implemented `/class/:class_id/students` student roster page with full CRUD.
- Server functions in `src/students.gs`: `getStudentsList()`, `serverAddStudent()`, `serverUpdateStudent()`, `serverDeleteStudent()`.
- Access control: admin or homeroom teacher of the class can edit; others see read-only view with a notice banner.
- citizen_id uniqueness validated within the class on add and edit.
- All writes call `appendAuditLog()` per FR-12.
- Created `src/class_students.html` with add form, editable table (inline edit-in-place), and delete with confirm dialog.
- Added `case 'class_students'` to router in `Code.gs` (reads `params.class_id`).
- Added `getClassStudentsPageHtml(token, class_id)` to `Code.gs` for client-side navigation (needed because `getPageHtml` doesn't carry extra params).
- Added "นักเรียน" button per row in `admin_classes.html` that calls `viewStudents(class_id)` → `getClassStudentsPageHtml`.
- Added US-005 test block in `tests/admin.spec.ts`: seeds `test_class_us005_c1`, adds a student with all fields, edits note, deletes row.
- Files changed: `src/students.gs` (new), `src/class_students.html` (new), `src/Code.gs`, `src/admin_classes.html`, `tests/admin.spec.ts`
- **Learnings:**
  - `getPageHtml(token, page)` only injects `{ session, token }` into templates — pages needing extra data (class_id, subject_id) require their own dedicated navigation function in Code.gs.
  - Inline edit-in-place: replace cell textContent with `<input>` on "Edit" click; on "Save" call the update server function; on success `loadStudents()` re-renders from DB.
  - For delete with `window.confirm`, register `page.on('dialog', async d => d.accept())` in Playwright before the click that triggers the confirm — order matters.
---

## 2026-05-19 - US-004
- Implemented `/admin/school` form for school info (school_name, district, province, academic_year) with direct row-2 write.
- Implemented `/admin/classes` CRUD page: list, add, delete classes with teacher dropdown.
- Implemented `/admin/subjects` CRUD page: list, add, delete subjects with pre-seed button for all 11 FR-7 subjects.
- Auto-seeds `SubjectWeights` entry when a new subject is created (default weights by group).
- `preseedSubjects()` server function is idempotent — skips existing subject/weight IDs.
- Added `admin_school`, `admin_classes`, `admin_subjects` to admin page guards and router in `Code.gs`.
- Added `getTeachersList()`, `getClassesList()`, `getSubjectsList()`, `serverAddClass()`, `serverDeleteClass()`, `serverAddSubject()`, `serverDeleteSubject()`, `serverSaveSchoolInfo()`, `getSchoolInfo()` to `admin_school.gs`.
- Updated `dashboard.html` to link to new admin pages.
- Added US-004 test block in `tests/admin.spec.ts` with beforeAll/afterAll cleanup.
- Files changed: `src/admin_school.gs` (new), `src/admin_school.html` (new), `src/admin_classes.html` (new), `src/admin_subjects.html` (new), `src/Code.gs`, `src/dashboard.html`, `tests/admin.spec.ts`
- **Learnings:**
  - SchoolInfo is single-row — use direct range write (`sheet.getRange(2,1,...).setValues(...)`) rather than `dbUpdate` keyed on a field that may itself change.
  - `DEFAULT_WEIGHTS` numeric keys in a GAS object literal are stored as strings; always access with `String(n)` or define keys as strings upfront.
  - `adminPages` array must be kept in sync between `doGet` and `getPageHtml` — both must list every admin-only page.
---

## 2026-05-19 - US-001
- Implemented the `/admin/db-status` dev page that lists all 14 DB tabs and their row counts.
- Added `getDbStatus()` server function in `Code.gs` that reads `TAB_ORDER` (defined in `setup.gs`) and returns `{ tab, count }` per tab.
- Added `admin_db_status` to the page router and `adminPages` guard in both `doGet` and `getPageHtml`.
- Created `src/admin_db_status.html` — calls `google.script.run.getDbStatus()` and renders a table with `data-tab` and `data-count` attributes for Playwright assertions.
- Added US-001 Playwright test block in `tests/admin.spec.ts` — navigates to `?page=admin_db_status`, waits for `#statusTable`, asserts each of the 14 tabs has `data-count ≥ 1`.
- **Learnings:**
  - The backend schema (`setupDatabase()`) was already fully implemented from a prior commit; US-001 only needed the dev-status UI + test.
  - `getLastRow()` returns 1 for a tab with only a header row — so `≥ 1` correctly validates that the header row exists.
  - `TAB_ORDER` is defined in `setup.gs` but usable in `Code.gs` because GAS merges all `.gs` files into one global scope.
---

## 2026-05-19 - US-003
- Implemented `/admin/users` page: lists all users, add-user form, reset-password modal.
- Added server functions to `auth.gs`: `getUsersList()`, `getUsersListForPage(token)` (session-checked), `serverAddUser()`, `serverResetPassword()`.
- `getUsersListForPage(token)` is called via `google.script.run` from `admin_users.html` — validates the token and role before returning user data.
- `serverAddUser` and `serverResetPassword` are called directly via `google.script.run`; admin-only enforcement is at the page-router level (both `doGet` and `getPageHtml` already block non-admins for `admin_users`).
- Added `add_user` and `reset_password` POST action handlers in `Code.gs` (for doPost path, with `requireAdmin(session)` guard).
- Added `get_users_list` to `handleReadAction` in `Code.gs`.
- Extended testapi.gs cleanup to also delete Users by `username` prefix `test_` (catches UI-created test accounts whose `user_id` is auto-generated and wouldn't match the `test_` prefix).
- Added US-003 test block in `tests/auth.spec.ts`: seeds a teacher via API, tests page heading, creates user via UI, resets password via modal, logs in with new password in fresh context.
- Files changed: `src/auth.gs`, `src/Code.gs`, `src/testapi.gs`, `src/admin_users.html` (new), `tests/auth.spec.ts`
- **Learnings:**
  - `google.script.run` calls from GAS HTML pages cannot pass bearer tokens — they call server functions directly. Admin enforcement must be at the page-routing level (in `doGet` / `getPageHtml`). For functions that need an extra check (like `getUsersListForPage`), pass the token as a parameter and call `getSession()`.
  - `fetch()` from inside a GAS HTML page won't work with relative URLs — the page runs inside a googleusercontent.com iframe, not the `/exec` domain. Use `google.script.run` for all server calls.
  - To clean up UI-created test users (whose `user_id` is auto-generated), add a secondary `dbDeleteWhere('Users', 'username', 'test_')` cleanup pass.
---

## 2026-05-19 - US-002
- Implemented localStorage-based session persistence: after `serverLogin()` returns a token, `login.html` stores it as `popo_token` in `localStorage`; on re-visit, login page checks localStorage and auto-navigates to dashboard if token is valid.
- Added logout button to `dashboard.html`: calls `serverLogout(token)` (removes cache entry) then `getLoginHtml()` to replace page with login form; also clears `localStorage.popo_token`.
- Added `serverLogout(token)` and `getLoginHtml()` to `auth.gs`.
- Dashboard now calls `localStorage.setItem('popo_token', TOKEN)` on load to persist the server-rendered token.
- Created `tests/auth.spec.ts` with US-002 describe block covering: login page visible, wrong password error, correct credentials → dashboard heading, logout → back to login + localStorage cleared.
- Tests use `test.use({ storageState: { cookies: [], origins: [] } })` to override the global `auth.json` and start with a fresh (unauthenticated) state.
- Files changed: `src/login.html`, `src/dashboard.html`, `src/auth.gs`, `tests/auth.spec.ts` (new)
- **Learnings:**
  - GAS `doGet` reads `e.parameter.token` server-side before any client JS runs — so token can't come from localStorage at the server side. The design uses `doGet` only for the initial shell (login page), then all navigation is via `document.write` with the token passed through JS variables.
  - `test.use({ storageState: ... })` inside a `describe` block overrides the project-level storageState from `playwright.config.ts` for that describe block only — this is the right pattern for testing the login flow itself.
  - `CacheService.getScriptCache()` (not `getUserCache()`) is used for sessions — `getUserCache()` requires Google login; `getScriptCache()` is shared but keyed by the random token.
---

