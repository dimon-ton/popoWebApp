# Ralph Progress Log

This file tracks progress across iterations. Agents update this file
after each iteration and it's included in prompts for context.

## Codebase Patterns (Study These First)

### Apps Script routing (Code.gs)
- `doGet` routes by `?page=` param; admin pages gated by role check before switch; read-action JSON calls use `?action=<name>&token=<tok>` via GET.
- `doPost` routes by `?action=` param; all mutations require a valid session token in POST body.
- `buildPage(pageName, data)` compiles an HtmlTemplate from file and passes `data` as template variable.

### DB layer (db.gs)
- Every write (`dbInsert`, `dbUpdate`, `dbDelete`) acquires `LockService.getDocumentLock()` with 30s timeout.
- `dbGetAll(tab)` reads entire sheet; rows are returned as plain objects keyed by header row values.
- `generateId(prefix)` creates `prefix_<12-char-uuid>`.
- `appendAuditLog(userId, entity, entityId, oldVal, newVal)` — oldVal/newVal are stringified JSON.

### Test API (testapi.gs — FR-14)
- Bearer token passed as `auth_token` query param (not HTTP header, since Apps Script lacks header access on GET).
- Kill-switch: set `TEST_API_ENABLED=false` in Script Properties to disable.
- All seeded IDs must start with `test_`; `cleanup` api uses `dbDeleteWhere` with `test_` prefix.
- `query_rows` api returns all rows in a tab whose ID field starts with `test_` — use for assertions.

### Playwright seed helpers (tests/helpers/seed.ts)
- All seed functions return the generated ID string.
- `cleanupTestData()` hits the `cleanup` api — deletes all `test_`-prefixed rows across all tabs.
- Use `beforeAll`/`afterAll` with these helpers in every spec file.
- Requires env vars: `WEB_APP_URL`, `TEST_API_TOKEN`.

### Workload cache (admin_workload.gs)
- Aggregates cached in `CacheService.getScriptCache()` with key `workload_v1` and 60s TTL.
- `invalidateWorkloadCache()` must be called from every Enrollments mutation function.

### Playwright evaluate() DOM types
- `page.evaluate()` with DOM types like `HTMLSelectElement` requires `"dom"` in `tsconfig.json`'s `lib` array.
- Workaround without changing tsconfig: use `page.locator('#id').evaluate((sel: any, ...) => {...})` with an `any` cast for the element parameter.
- Alternatively: add `"dom"` to `"lib"` in tsconfig — cleaner if the project grows more browser-context evaluations.

---

## 2026-05-18 - US-018
- **What was implemented:**
  - All server-side logic was already present: `enrollments.gs` (add/remove/reassign enrollment, get teacher list, get all-pairs matrix), `Code.gs` (routing for admin_enrollments page and POST actions), `auth.gs` (admin role check), `testapi.gs` (seed/cleanup API for tests).
  - `admin_enrollments.html` — full UI: teacher list panel, right panel with enrollment table + add-pair form, reassign confirmation dialog, "All pairs" tab.
  - `src/admin_workload.gs` — created `getWorkloadData()` function (referenced in Code.gs but missing; required to avoid runtime errors). Includes 60s CacheService cache + `invalidateWorkloadCache()`.
  - Added `invalidateWorkloadCache()` calls in `enrollments.gs` after each mutation (add, reassign, remove, bulk-assign).
  - **Playwright test infrastructure** (all new):
    - `package.json` + `playwright.config.ts` + `tsconfig.json`
    - `tests/auth.setup.ts` — US-021 storageState bootstrap
    - `tests/helpers/seed.ts` — US-022 seed/cleanup helpers with full TypeScript types
    - `tests/admin.spec.ts` — US-018 Playwright tests (8 test cases)
    - `.gitignore` — excludes `node_modules/`, `tests/.auth/`, `dist/`
    - `tests/.auth/.gitkeep` — ensures directory exists in repo

- **Files changed:**
  - `src/enrollments.gs` — added `invalidateWorkloadCache()` calls after mutations
  - `src/admin_workload.gs` — NEW: getWorkloadData() with cache
  - `package.json` — NEW
  - `playwright.config.ts` — NEW
  - `tsconfig.json` — NEW
  - `tests/auth.setup.ts` — NEW
  - `tests/helpers/seed.ts` — NEW
  - `tests/admin.spec.ts` — NEW (US-018 tests)
  - `.gitignore` — NEW
  - `tests/.auth/.gitkeep` — NEW

- **Learnings:**
  - Apps Script `doGet` cannot read HTTP Authorization headers — the test API uses `auth_token` as a query param instead of a Bearer header. This is a security trade-off documented in FR-14.
  - The `callServer` function in `admin_enrollments.html` has a redundant override pattern (lines 460-482) that duplicates the original logic. It works correctly because function declarations are hoisted, so `origCallServer` captures the original at assignment time. Future refactor could simplify to a single function.
  - `dbDeleteWhere` deletes from bottom to top (`for i = data.length - 1 downto 1`) to avoid row-index shifting during deletion — important pattern for any multi-row delete.
  - TypeScript type-checks pass with `npx tsc --noEmit` (no errors).
  - The `tests/.auth/auth.json` requires a one-time human login step (US-021). The auth file is `.gitignore`d; the `.gitkeep` placeholder ensures the directory exists in the repo.

---

## 2026-05-18 - US-019
- **What was implemented:**
  - `src/admin_enrollments.html` — added "Bulk assign" tab (`#tab-bulk`, `#bulkAssignTab`) with two modes:
    - Mode A: pick one class + one teacher + multi-select subjects → POST `bulk_assign` with `mode=A`
    - Mode B: pick one subject + one teacher + multi-select classes → POST `bulk_assign` with `mode=B`
  - Result summary panel (`#bulkResult`) shows `N เพิ่มใหม่, M เปลี่ยนครู, K ไม่เปลี่ยน` after each submit.
  - JS functions: `populateBulkDropdowns()`, `switchBulkMode(mode)`, `submitBulkAssign(mode)`.
  - Server-side `handleBulkAssign` was already complete in `enrollments.gs` (implemented during US-018 iteration).
  - `Code.gs` routing for `bulk_assign` POST action was also already in place.
  - `tests/admin.spec.ts` — added 3 US-019 tests:
    - Tab visibility + mode buttons check
    - Mode B bulk assign (3 classes × 1 subject) — asserts summary shows `3 เพิ่มใหม่`
    - API-level verification that all 3 enrollment rows exist with the correct teacher

- **Files changed:**
  - `src/admin_enrollments.html` — bulk assign CSS, HTML panel, JS logic
  - `tests/admin.spec.ts` — US-019 test suite (3 tests)

- **Learnings:**
  - `page.evaluate()` / `locator.evaluate()` callbacks run in the browser context but TypeScript doesn't automatically include DOM types unless `"dom"` is in `tsconfig.json`'s `lib`. Use `any` cast as a quick workaround.
  - Multi-select `<select multiple>` cannot be driven by `page.selectOption()` for an arbitrary subset in all cases — using `.evaluate()` to directly set `opt.selected` on each option is the reliable approach.
  - `populateBulkDropdowns()` is called lazily (only when the bulk tab is opened) to avoid needing `allData` at page load time.

---

## 2026-05-18 - US-020
- **What was implemented:**
  - `src/admin_workload.html` — updated with full Playwright-targetable IDs:
    - `#workloadTable`, `#workloadBody`, `#row-<user_id>` per teacher row
    - `.pair-count`, `.teacher-name`, `.subject-names`, `.student-count` CSS classes on cells
    - Drill-down panel uses `#drillPanel` with `.open` class toggle (was `style.display=''`)
    - `#drillBody` rows get `.drill-class`, `.drill-subject`, `.drill-link` classes
    - Each drill row includes a `<a class="drill-link">` link pointing to `?page=gradebook&class_id=...&subject_id=...`
    - `<th>ลิงก์</th>` column added to drill table
  - `tests/admin.spec.ts` — added 5 US-020 tests:
    - Page loads and shows workload table with both test teachers
    - Sort order: heavy teacher (3 enrollments) appears before light teacher (1 enrollment) in DOM order
    - Clicking heavy teacher row opens drill panel with class/open and shows 3 seeded subjects
    - Drill rows include `.drill-link` anchors with `page=gradebook` in href
    - Non-admin access blocked (403/login redirect)

- **Files changed:**
  - `src/admin_workload.html` — UI improvements: IDs, CSS classes, drill-link column, `.open` class pattern
  - `tests/admin.spec.ts` — US-020 test suite (5 tests)

- **Learnings:**
  - Using `.open` CSS class for panel visibility (instead of `style.display`) is better for Playwright because `toHaveClass(/open/)` is a robust assertion — it doesn't break if the element gains other classes.
  - Row IDs like `#row-<user_id>` allow Playwright to target specific rows without knowing array indices — much more reliable than `nth-child()` selectors.
  - The `getWorkloadData()` server function already sorted by `pair_count` descending; the test validates this invariant via DOM row order rather than text content.
  - `evaluateAll()` with an `any[]` type cast avoids DOM lib requirement in tsconfig while reading row IDs in order.

---

## 2026-05-18 - US-021
- **What was implemented:**
  - `tests/auth.setup.ts` was already created during the US-018 iteration and fully satisfies all acceptance criteria.
  - `playwright.config.ts` already had the `setup` project (matching `/auth\.setup\.ts/`) and `chromium` project with `storageState: 'tests/.auth/auth.json'` and `dependencies: ['setup']`.
  - `.gitignore` already excludes `tests/.auth/`.
  - Created `README.md` (project root) — the only missing piece. Documents the first-time auth bootstrap command, manual login steps, session expiry note, and subsequent headless run instructions.

- **Files changed:**
  - `README.md` — NEW: documents `pnpm playwright test --project=setup` first-time flow and subsequent usage

- **Learnings:**
  - `auth.setup.ts` does not need a `headed: true` override in the file itself — the `setup` project in `playwright.config.ts` launches Chromium non-headlessly by default when `page.pause()` is called (Playwright switches to headed mode automatically on `pause()`).
  - The `.auth/` directory creation guard (`fs.mkdirSync`) inside the setup script is important: the `.gitkeep` placeholder ensures the dir exists in the repo, but on a fresh checkout + `pnpm install` without running setup yet, the dir might not exist if `.gitkeep` wasn't committed.
  - README documentation is the most commonly overlooked acceptance criterion — always check for it in stories that mention "README documents".

---
