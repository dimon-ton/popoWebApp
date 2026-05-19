# Ralph Progress Log

This file tracks progress across iterations. Agents update this file
after each iteration and it's included in prompts for context.

## Codebase Patterns (Study These First)

- **GAS global scope**: All `.gs` files share one global scope — variables like `TAB_ORDER` defined in `setup.gs` are accessible from `Code.gs` without imports.
- **Page routing**: `doGet` switches on `e.parameter.page`; `buildPage(name, data)` renders the named HTML template. Admin pages are listed in `adminPages` array in both `doGet` and `getPageHtml`.
- **Client-side GAS calls**: HTML pages call server functions via `google.script.run.withSuccessHandler(fn).functionName(args)`. No `fetch`/HTTP from the HTML side.
- **Test API pattern**: All seed/cleanup calls go through `?api=<op>&auth_token=<TOKEN>` query params, gated by `TEST_API_TOKEN` Script Property.
- **TAB_ORDER in setup.gs**: The 14-tab schema is defined there as `TAB_ORDER` + `TAB_SCHEMA`. Any function in Code.gs can reference `TAB_ORDER` directly.

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

