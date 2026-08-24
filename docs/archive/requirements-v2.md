[PRD]
> Archived superseded requirements. See [`../product/requirements.md`](../product/requirements.md).

# PRD v2: PopoWebApp — School-wide Grade Book with Admin Assignment + Playwright MCP Testing

## 1. Overview
This is **v2 of the PopoWebApp PRD** (supersedes `prd-popo-gradebook-webapp.md`). v2 keeps every user story from v1 (Excel parity — 17 stories) and adds two things:

1. **Admin teacher-assignment workflows are first-class.** The admin defines every class and every subject, then explicitly assigns one teacher to each (class, subject) pair. Bulk-assignment and per-teacher workload views are added.
2. **Automated browser testing via Playwright MCP replaces manual verification.** Each user story now has a per-feature-area Playwright spec that must pass on the production deployment. The human deploys once and completes any Google "authorize script" consent the first time; Playwright captures the resulting browser `storageState` to `auth.json` and reuses it for every subsequent test run. Tests isolate themselves from real data using a `test_` prefix on class IDs.

The application remains: Google Apps Script web app + one master Google Sheet as relational DB + custom username/password auth + hidden Sheet template rendered to PDF for the `ปก` cover report. Source-Excel fidelity rules from v1 (grade ladder, characteristics ladder, read-think-write ladder, subject weights) carry over unchanged — see v1 for the formula references.

## 2. Goals
- A single admin can stand up the entire school: define classes, define subjects, assign one teacher per (class, subject), and view each teacher's total workload.
- Every user story has a Playwright MCP spec that proves the feature works on the deployed URL.
- One teacher per (class, subject) — no co-teaching in v1.
- Tests are repeatable: re-running the suite from a clean checkout produces a green run with no manual steps beyond the initial human-OAuth bootstrap.
- v1 goals (1:1 Excel fidelity, concurrent-edit safety, printable PDF, role-based access) remain unchanged.

## 3. Quality Gates

These commands must pass for every user story:
- `clasp push` — pushes the latest Apps Script source; succeeds iff no syntax errors.
- `npx clasp redeploy <PROD_DEPLOY_ID> --description "Release Description"` — redeploys the existing production deployment so the live `/exec` URL serves the new code.
- `pnpm playwright test tests/<area>.spec.ts -g "<US-ID>"` — runs the Playwright spec(s) tagged with this story's US-ID against the production URL using the saved `auth.json` storage state. Must finish green.

For UI stories, the Playwright spec must include at least one visible-assertion (text content or DOM state) in addition to action clicks, so the test fails on a rendering regression.

## 4. User Stories

> **Note on numbering:** US-001–US-017 are inherited from v1 (full text in `prd-popo-gradebook-webapp.md`). Each is **augmented in v2** by a Playwright spec in the corresponding feature-area file. US-018–US-022 are new in v2.

### Augmentations to v1 stories (Playwright coverage)

Each v1 story now adds these acceptance criteria on top of the v1 ones:
- [ ] A Playwright test tagged with the story's US-ID lives in the corresponding feature-area spec file (see FR-13).
- [ ] The Playwright test runs against the production deployment URL, signs in using the saved `auth.json`, exercises the feature end-to-end, and asserts at least one visible outcome.
- [ ] The test inserts/uses class IDs prefixed with `test_` so production data is untouched.
- [ ] The test cleans up its own seeded rows in an `afterAll` hook.

The exhaustive v1 acceptance criteria are not re-listed here — see `prd-popo-gradebook-webapp.md` for them.

| US-ID | Story | Spec file |
|---|---|---|
| US-001 | Bootstrap master Sheet schema | `tests/admin.spec.ts` |
| US-002 | Auth — login + session | `tests/auth.spec.ts` |
| US-003 | Auth — seed users + admin password reset | `tests/auth.spec.ts` |
| US-004 | School info + classes + subjects setup | `tests/admin.spec.ts` |
| US-005 | Student roster CRUD | `tests/admin.spec.ts` |
| US-006 | Indicator catalog | `tests/admin.spec.ts` |
| US-007 | Attendance grid view + edit | `tests/attendance.spec.ts` |
| US-008 | Formative indicator scoring (คะแนน1) | `tests/scoring.spec.ts` |
| US-009 | Summative scoring + grade computation (คะแนน2) | `tests/scoring.spec.ts` |
| US-010 | Subject weights config (คะแนนวิชา) | `tests/admin.spec.ts` |
| US-011 | Characteristics scoring (คุณลักษณะ) | `tests/scoring.spec.ts` |
| US-012 | Read-Think-Write scoring (อ่านคิด) | `tests/scoring.spec.ts` |
| US-013 | Cover report aggregates (ปก) | `tests/scoring.spec.ts` |
| US-014 | PDF export of cover report | `tests/scoring.spec.ts` |
| US-015 | Static reference pages | `tests/admin.spec.ts` |
| US-016 | Audit log | `tests/admin.spec.ts` |
| US-017 | Deployment + first-run setup wizard | `tests/auth.spec.ts` |

### New stories in v2

### US-018: Admin assigns subjects to a teacher (teacher-first flow)
**Description:** As an admin, I want to select a teacher first and then add (class, subject) pairs to their schedule one by one, so I can clearly manage and grow each teacher's assignment list.

**Acceptance Criteria:**
- [ ] Admin page `/admin/enrollments` shows a **teacher list** on the left panel — one row per teacher (role=teacher only) showing their name and current pair count.
- [ ] Clicking a teacher opens a **right panel** showing all (class, subject) pairs currently assigned to that teacher as a table with columns: `ชั้น`, `วิชา`, and a "Remove" button per row.
- [ ] The right panel has an **"Add pair" form** with two dropdowns: `class_id` (only classes not yet assigned to this teacher for the selected subject) and `subject_id`. Submitting appends the pair to the teacher's list.
- [ ] If the selected (class, subject) is already assigned to a **different** teacher, the server responds with a confirmation dialog: "วิชานี้สอนโดย [other teacher] อยู่แล้ว — ต้องการเปลี่ยนเป็น [this teacher] ใช่ไหม?" Confirming reassigns and writes an audit-log row for both the removed and added assignment.
- [ ] Clicking "Remove" on a row detaches that (class, subject) from the teacher; an audit-log row is written.
- [ ] Each (class, subject) can have at most one teacher at any time (unique composite key enforced server-side).
- [ ] Save/remove operations toast success and refresh the right panel inline without full-page reload.
- [ ] Non-admin users hitting `/admin/enrollments` get a 403-style block screen.
- [ ] A secondary read-only **"All pairs" tab** on the same page shows the full school matrix: every (class, subject) row with its assigned teacher or "ยังไม่ได้กำหนด" — useful for spotting gaps.
- [ ] Playwright (`tests/admin.spec.ts -g US-018`):
  - Seed `test_teacher_a`, `test_teacher_b`, `test_class_x`, `test_class_y`, `test_subject_z`.
  - Visit `/admin/enrollments`; click `test_teacher_a`; add pair (`test_class_x`, `test_subject_z`); assert it appears in the right panel.
  - Add a second pair (`test_class_y`, `test_subject_z`) to `test_teacher_a`; assert count shows 2.
  - Now click `test_teacher_b`; try to add (`test_class_x`, `test_subject_z`) — same pair already owned by `test_teacher_a`; assert reassign confirmation dialog appears; confirm; assert the pair now appears under `test_teacher_b` and is gone from `test_teacher_a`.
  - Switch to "All pairs" tab; assert `test_class_x` + `test_subject_z` shows `test_teacher_b`.
  - Assert two audit-log rows exist for `test_subject_z` changes.

### US-019: Admin bulk-assigns one teacher to many subjects
**Description:** As an admin, I want to assign one teacher to many subjects in one class (or many classes for one subject) in a single action so onboarding a new teacher is fast.

**Acceptance Criteria:**
- [ ] On `/admin/enrollments`, a "Bulk assign" panel offers two modes: **(A) Many subjects, one class:** pick a class, pick a teacher, multi-select subjects → apply. **(B) Many classes, one subject:** pick a subject, pick a teacher, multi-select classes → apply.
- [ ] Submitting writes one `Enrollments` row per (class, subject), overwriting existing rows where present, inside a single `LockService.getDocumentLock()` block.
- [ ] After submit, a result panel summarizes: `N created, M reassigned, K unchanged`.
- [ ] Each created or reassigned tuple appends an `AuditLog` row.
- [ ] Playwright (`tests/admin.spec.ts -g US-019`): seed 3 test classes + 1 teacher; bulk-assign mode B with 1 subject across all 3 classes; assert summary shows `3 created`; assert all 3 (class, subject) rows now have that teacher.

### US-020: Admin views teacher workload across the school
**Description:** As an admin, I want a dashboard showing each teacher and how many (class, subject) pairs they are assigned to, so I can balance workload.

**Acceptance Criteria:**
- [ ] Admin page `/admin/workload` shows a table: one row per teacher with columns `ชื่อครู`, `จำนวน (class, subject)`, `รายวิชาที่สอน` (concatenated string), `จำนวนนักเรียนรวม` (sum of students across all assigned classes — distinct count so the same class counted once even if the teacher teaches two subjects there is fine; spec the formula in the row).
- [ ] Default sort: workload count descending.
- [ ] Click a teacher row → drill-down panel listing each (class, subject) they own with a link to the relevant grade-book page.
- [ ] Excludes admin users.
- [ ] Page renders in under 3s for up to 50 teachers and 500 enrollments (cache aggregates in `CacheService` for 60s).
- [ ] Playwright (`tests/admin.spec.ts -g US-020`): seed 2 teachers with different workload counts (one with 3 enrollments, one with 1); visit `/admin/workload`; assert sort order (heavier first); click the heavier row; assert the drill-down lists exactly 3 (class, subject) lines.

### US-021: Playwright auth bootstrap (storageState)
**Description:** As the developer, I want a one-time bootstrap script that captures my logged-in browser session into `auth.json` so all later Playwright runs are non-interactive.

**Acceptance Criteria:**
- [ ] `tests/auth.setup.ts` exists and is configured as a Playwright `setup` project that runs before all other test projects.
- [ ] When run, it opens the production `/exec` URL in a non-headless Chromium with `pause()` after navigation.
- [ ] On first execution: the human logs in (custom username/password) AND completes any Google "authorize script" consent if Apps Script demands it, then resumes the script.
- [ ] After resume, the script calls `context.storageState({ path: 'tests/.auth/auth.json' })`.
- [ ] All other test projects in `playwright.config.ts` set `use: { storageState: 'tests/.auth/auth.json' }`.
- [ ] `tests/.auth/` is in `.gitignore`.
- [ ] README documents: "first time only, run `pnpm playwright test --project=setup` and follow the browser prompt." Subsequent runs use `pnpm playwright test`.
- [ ] Verify: delete `auth.json`, run setup once with manual login, then run a sample story spec headless — it passes without prompting.

### US-022: Playwright test data isolation + cleanup helper
**Description:** As the developer, I want a shared helper that seeds and cleans `test_`-prefixed data so specs stay independent and never pollute production.

**Acceptance Criteria:**
- [ ] `tests/helpers/seed.ts` exports: `seedTestClass({suffix, level, section})`, `seedTestSubject({suffix, name, code, group})`, `seedTestStudent({class_suffix, seq, full_name})`, `seedTestUser({suffix, role, password})`, `cleanupTestData()`.
- [ ] Each seed function generates IDs prefixed with `test_<suffix>` (e.g. `test_class_us018a`).
- [ ] Seed/cleanup functions invoke Apps Script via `fetch(WEB_APP_URL + '?api=...')` using a dedicated `Bearer` token stored in the Script Properties and matched server-side (the "API token" is a separate auth path from the username/password login — see FR-14).
- [ ] `cleanupTestData()` deletes every row across all tabs where any ID column starts with `test_`.
- [ ] A `beforeAll`/`afterAll` pair in each spec file uses these helpers.
- [ ] `tests/helpers/seed.spec.ts` is a self-test that seeds, asserts, cleans up, asserts gone.
- [ ] Verify: after a full test-suite run, query the production master Sheet for any rows with IDs starting `test_` — none should remain.

## 5. Functional Requirements (v2 additions)

> v1 FR-1 through FR-10 from `prd-popo-gradebook-webapp.md` carry over unchanged.

- FR-11: **Single-teacher-per-pair invariant.** The `Enrollments` table has a unique composite key on `(class_id, subject_id)`. Server enforces this on every insert and UI shows a reassign-confirmation dialog when the pair is already owned by another teacher; bulk-assign silently overwrites any existing row for the same pair.
- FR-12: **Admin assignment audit.** Every create, reassign, or delete on `Enrollments` writes a row to `AuditLog` with `entity='Enrollments'` and a JSON diff including the previous teacher (if any).
- FR-13: **Playwright test layout by feature area.** Specs live under `tests/`:
  - `tests/auth.spec.ts` — login, session, password reset, first-run wizard (US-002, US-003, US-017).
  - `tests/admin.spec.ts` — schema bootstrap, school/class/subject/student/indicator setup, weights, reference pages, audit log, enrollments, workload (US-001, US-004, US-005, US-006, US-010, US-015, US-016, US-018, US-019, US-020).
  - `tests/attendance.spec.ts` — attendance grid (US-007).
  - `tests/scoring.spec.ts` — formative, summative, characteristics, read-think-write, cover report, PDF (US-008, US-009, US-011, US-012, US-013, US-014).
  - `tests/auth.setup.ts` — storageState bootstrap (US-021).
  - `tests/helpers/seed.ts` — test-data helpers (US-022).
- FR-14: **Test API authentication.** The Apps Script exposes a separate `doGet`/`doPost` code path gated by a `Bearer <token>` header where `token` matches a `TEST_API_TOKEN` script property. This path supports `?api=seed_class|seed_subject|seed_student|seed_user|cleanup` operations and is the only way Playwright helpers write/cleanup data without going through the UI. The token is set manually in the Apps Script editor and never committed.
- FR-15: **Test data prefix invariant.** All test-created records (IDs, names, codes) must use the literal string prefix `test_`. The cleanup helper recognizes this prefix and deletes only matching rows.
- FR-16: **Production deployment is the test target.** Tests run against the same `/exec` URL real users hit. There is no separate test deployment. Isolation is purely by data-prefix convention.
- FR-17: **Playwright config.** `playwright.config.ts` defines:
  - `projects: [{name: 'setup', testMatch: /auth\.setup\.ts/}, {name: 'chromium', use: {storageState: 'tests/.auth/auth.json'}, dependencies: ['setup']}]`
  - `use: { baseURL: process.env.WEB_APP_URL }`
  - `retries: 1` (Apps Script's cold start can flake)
  - `timeout: 60_000` (PDF export can take a while)
- FR-18: **Workload dashboard performance.** `/admin/workload` aggregates must be cached in `CacheService.getScriptCache()` with key `workload_v1` and 60s TTL; cache is invalidated on any `Enrollments` write.
- FR-19: **Bulk-assignment atomicity.** US-019's bulk insert runs under a single `LockService.getDocumentLock()` acquisition. If the lock cannot be acquired within 30s, the entire bulk operation aborts with no partial writes.

## 6. Non-Goals (v2)

In addition to v1's non-goals:

- Co-teaching / multiple teachers per (class, subject) pair — single teacher only in v1; reconsider in v3.
- A separate test deployment — production-with-`test_`-prefix is the chosen isolation strategy.
- Headless CI runs without the human bootstrap — `auth.json` is human-seeded and rotated when expired; CI is out of scope.
- Automated Google OAuth login by Playwright — the human handles it once during `auth.setup.ts`.
- Playwright visual regression / screenshot diffs — assertions on text content and DOM state only in v1.
- Cross-browser testing — Chromium only (matches the MCP default).

## 7. Technical Considerations

### Playwright MCP integration
- The user's environment already exposes a Playwright MCP. The PRD assumes the developer drives Playwright through the MCP for ad-hoc exploratory clicks (e.g. during US-021 setup) **and** through `pnpm playwright test` for the spec suite. The MCP and the CLI must share the same `auth.json` so they don't diverge.
- The MCP browser process should be configured to point at `tests/.auth/auth.json` when relevant. Document this in the README.

### Apps Script test-API exposure (FR-14) — security note
- Adding a Bearer-token API path widens attack surface. Mitigations:
  - The token is a 32+ char random string set in Script Properties, never committed.
  - The API path 404s on any non-`test_`-prefixed ID parameter — so even a leaked token can't be used to mass-delete real rows from outside the conventional prefix.
  - Add a kill-switch script property `TEST_API_ENABLED=false` that disables the path entirely outside dev work.

### `auth.json` rotation
- Apps Script session tokens (from US-002) expire after 12h per FR-2 in v1. The Playwright `auth.json` will go stale every 12h. Document in README: re-run `pnpm playwright test --project=setup` whenever specs start failing on the login screen. v1 does not auto-refresh.

### Workload query cost
- `/admin/workload` does at most: 1 read of `Users` + 1 read of `Enrollments` + 1 read of `Students` + 1 read of `Classes`. For a school of 50 teachers / 500 enrollments / 500 students, that's well under 1MB of Sheet I/O. The 60s `CacheService` cache makes repeat loads instant.

### Honest stack reminder
v1 already flagged that Django + SQLite on PythonAnywhere would deliver this faster for a Python developer, and Django Admin would replace half of US-004, US-005, US-006, US-010, US-015, US-018, US-019, US-020 essentially for free. v2 doubles down on Apps Script per user choice, but the trade-off compounds: every new admin story is a new HTML form + server function in JS. Re-evaluate after US-018 if velocity drags.

## 8. Success Metrics
- A fresh checkout + `pnpm install && pnpm playwright test --project=setup` (with human login) + `pnpm playwright test` completes green in under 10 minutes.
- An admin can complete the school-onboarding golden path (create 5 classes, 11 subjects, assign one teacher to all 55 pairs via two bulk-assign actions) in under 5 minutes of wall time.
- `/admin/workload` renders in under 3s for a school of 50 teachers.
- Zero `test_`-prefixed rows remain in the production master Sheet after a clean test run (verified by US-022's self-test).
- v1 success metrics still hold (full grading cycle <30 min, PDF matches Excel, no data-loss reports).

## 9. Open Questions
- Should `/admin/workload` include attendance load (e.g. "this teacher owns 4 classes × 200 days × 7 periods = X mark-attendance cells per year") or is the (class, subject) count enough?
- When a teacher is removed from a (class, subject), should their already-entered scores stay in the DB attributed to them, or be cleared? Default in v2: stay; the next teacher continues from where the previous left off.
- Should we expose a Playwright-runnable `pnpm test:smoke` command that runs only the 3–4 most critical specs (login, enrollment, score-compute) for fast feedback, separate from the full suite?
- The first-time human OAuth step (US-021) — does the user want a recorded screen-cast / written runbook included in the README, or just inline comments in `auth.setup.ts`?
- Should bulk-assign offer a "dry run" preview (showing N/M/K counts) before the actual write, or commit directly?
[/PRD]
