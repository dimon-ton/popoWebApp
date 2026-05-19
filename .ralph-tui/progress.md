# Ralph Progress Log

This file tracks progress across iterations. Agents update this file
after each iteration and it's included in prompts for context.

## Codebase Patterns (Study These First)

- **SchoolInfo is a single-row table**: Always read row 0 from `dbGetAll('SchoolInfo')` for the current values. To update, write directly to sheet row 2 (the data row) rather than using `dbUpdate()` keyed on `school_name`, which would break if the name itself changes.
- **DEFAULT_WEIGHTS keys must be strings**: JavaScript object keys are always strings; define them as `'1'` and `'2'` and access with `DEFAULT_WEIGHTS[String(grp)]` to avoid integer/string key mismatch.
- **Admin page guard in getPageHtml is a whitelist**: New admin pages must be added to both the `adminPages` array in `doGet` AND the identical array in `getPageHtml` for consistent protection (navigation and direct URL).
- **preseedSubjects() is idempotent**: Checks existing IDs before inserting — safe to call multiple times without creating duplicates.

- **GAS global scope**: All `.gs` files share one global scope — variables like `TAB_ORDER` defined in `setup.gs` are accessible from `Code.gs` without imports.
- **Page routing**: `doGet` switches on `e.parameter.page`; `buildPage(name, data)` renders the named HTML template. Admin pages are listed in `adminPages` array in both `doGet` and `getPageHtml`.
- **Client-side GAS calls**: HTML pages call server functions via `google.script.run.withSuccessHandler(fn).functionName(args)`. No `fetch`/HTTP from the HTML side.
- **Test API pattern**: All seed/cleanup calls go through `?api=<op>&auth_token=<TOKEN>` query params, gated by `TEST_API_TOKEN` Script Property.
- **TAB_ORDER in setup.gs**: The 14-tab schema is defined there as `TAB_ORDER` + `TAB_SCHEMA`. Any function in Code.gs can reference `TAB_ORDER` directly.
- **Session token in localStorage**: After login, `popo_token` is stored in `localStorage`. `login.html` checks for it on load and auto-navigates to dashboard if valid. Dashboard writes it back via `localStorage.setItem`. Logout calls `serverLogout(token)` to remove the cache entry then `getLoginHtml()` to replace the page.
- **Navigation via document.write**: All page navigation in GAS web app works by calling a server function that returns full HTML, then calling `document.open(); document.write(html); document.close()`. This replaces the entire page content including scripts. Playwright handles this fine.
- **Playwright fresh-context test pattern**: For auth tests that need to test the login UI itself, use `test.use({ storageState: { cookies: [], origins: [] } })` inside the describe block to override the global `auth.json` storageState.

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

