# AGENTS.md

## Architecture

Google Apps Script (GAS) web app serving server-rendered HTML pages. A Google Sheet acts as the database. No build step — `src/` files are pushed directly to GAS via `clasp`.

- **Entry point**: `src/Code.gs` — `doGet(e)` routes by `?page=` param
- **DB layer**: `src/db.gs` — `dbGetAll`, `dbInsert`, `dbUpdate`, `dbDelete`, `dbFindOne` (Google Sheets CRUD with `LockService`)
- **Auth**: `src/auth.gs` — session stored in `CacheService.getScriptCache()` (12h TTL), token in client `localStorage('popo_token')`
- **Shared HTML**: `src/_styles.html` — included in every page via `<?!= include('_styles') ?>`. Contains all CSS, shared JS helpers (`showNavLoading`, `hideNavLoading`, `btnLoading`, `btnReset`, `uploadAvatar`, `fmtCls`, back button), and logo
- **Page HTML**: Each `src/*.html` is a full page template rendered by `buildPage()` using GAS templated HTML (`<?= ?>`, `<?!= ?>`)

## Deployment

```sh
npx clasp push
npx clasp deploy --deploymentId AKfycbxoOgEwrVOCxFvZEQahEiCvfB29gu5rQ8z1kplcMjipkzSBrZe6GrbkGHF4VwO8M4mA --description "description"
```

- **Always redeploy** to the existing deployment ID (Production). Never create new deployments.
- `rootDir` is `src/` (set in `.clasp.json`)
- Production URL: `https://script.google.com/macros/s/AKfycbxoOgEwrVOCxFvZEQahEiCvfB29gu5rQ8z1kplcMjipkzSBrZe6GrbkGHF4VwO8M4mA/exec`

## Testing

```sh
pnpm playwright test                              # full suite
pnpm playwright test tests/admin.spec.ts -g "US-018"  # single story
pnpm playwright test --project=setup               # auth bootstrap (interactive, first time only)
```

- Requires `.env` with `WEB_APP_URL` and `TEST_API_TOKEN`
- Auth session saved at `tests/.auth/auth.json` (gitignored, expires after 12h)
- Test data uses `test_` prefixed IDs; cleanup runs after each spec

## Critical GAS Quirks

- **`_styles.html` is included in `<head>`** — any JS that accesses DOM must use `DOMContentLoaded`, not immediate IIFE
- **Google's Caja sanitizer** strips long base64 strings from inline `<script>` but NOT from CSS `background-image`. Use CSS for embedded images, never JS
- **Google Sheets returns numeric `1` not string `"1"`** — always use `String()` comparison for sheet values (e.g. `String(section) === '1'`)
- **Navigation uses `document.write()`** — full page replacement via `google.script.run` → HTML string → `document.write()`
- **Navbar is `position: fixed`** with `body:has(.navbar) { padding-top: 52px; }` — not `sticky` (GAS iframe wrapper breaks sticky)
- **No static file serving** — images must be base64 data URIs in CSS or external URLs (e.g. GitHub raw)

## Conventions

- **Language**: Thai UI text, English code/comments
- **Name format**: 3 input fields (คำนำหน้า + ชื่อ + นามสกุล) merge to single `full_name` with prefix stuck to first name: `"นายโนโน่ สดใส"` (no space between prefix and name, space before surname)
- **Class labels**: Section `"1"` or empty → show level only; section `"2"+` → show `level/section`. See `fmtClassLabel()` in `Code.gs` and `fmtCls()` in `_styles.html`
- **Class IDs**: Auto-generated as `class_<level>_<section>` (level with dots/spaces stripped)
- **Admin-only pages**: Guarded in `doGet()` via `adminPages` array in `Code.gs`
- **Server functions**: Named `server<Action>` (e.g. `serverAddUser`, `serverDeleteClass`) — called from client via `google.script.run.serverAction(TOKEN, ...)`
- **All server functions** verify session token as first argument and check admin role where needed
- **Audit logging**: Call `appendAuditLog(user_id, tableName, recordId, before, after)` on all mutations

## Key Files

| File | Purpose |
|------|---------|
| `src/Code.gs` | Routing, `buildPage`, `getPageHtml`, `getPageHtmlWithParams`, `fmtClassLabel`, `include` |
| `src/auth.gs` | Login, session, user CRUD (`serverAddUser`, `serverEditUser`, `serverDeleteUser`, `serverChangePassword`, avatar upload) |
| `src/db.gs` | Sheet CRUD with lock: `dbGetAll`, `dbFindOne`, `dbInsert`, `dbUpdate`, `dbDelete`, `dbDeleteWhere` |
| `src/_styles.html` | Shared CSS + JS (navbar, skeleton loading, avatar, back button, toast, `fmtCls`) |
| `src/admin_school_api.gs` | Class + subject CRUD |
| `src/students.gs` | Student CRUD (`serverAddStudent`, `serverDeleteStudent`) |
| `src/enrollments.gs` | Teacher enrollment management |
| `src/audit.gs` | Audit log read/write |
| `src/testapi.gs` | FR-14 test API endpoint (seed/cleanup via `?api=` param) |

## Sheet Tabs (DB Tables)

Users, SchoolInfo, Classes, Subjects, Enrollments, Students, Indicators, SubjectWeights, Attendance, IndicatorScores, SummativeScores, Characteristics, ReadThinkWrite, AuditLog

## Playwright Testing Notes

- The app runs inside 3 nested iframes (outer → middle with `userHtmlFrame` → inner content). Use `page.frames()` loop + `f.evaluate()` to access content
- Admin credentials: `admin` / `admin1234`
