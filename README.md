# PopoWebApp

Google Apps Script web app + Google Sheet as relational DB for school-wide grade book management.

## Setup

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [pnpm](https://pnpm.io/)
- [clasp](https://github.com/google/clasp) (for Apps Script deployment)

### Install dependencies

```sh
pnpm install
```

### Environment variables

Create a `.env` file (or set in your shell):

```sh
WEB_APP_URL=https://script.google.com/macros/s/<DEPLOY_ID>/exec
TEST_API_TOKEN=<your-test-api-token>
```

`WEB_APP_URL` — the production `/exec` URL of your deployed Apps Script web app.
`TEST_API_TOKEN` — a 32+ char random token matching the `TEST_API_TOKEN` Script Property in your Apps Script project.

## Playwright Tests

### First time only — auth bootstrap (US-021)

The test suite uses a saved browser session (`auth.json`) so runs are non-interactive. You must create this file once manually:

```sh
pnpm playwright test --project=setup
```

A Chromium browser window will open. In that window:
1. Log in with your admin username and password.
2. If Google shows an "Authorize script" consent page, complete it.
3. Once you are on the app's main page, return to the terminal and press the **Resume** button in the Playwright inspector (or press `F8`).

The session is saved to `tests/.auth/auth.json`. This file is `.gitignore`d and contains your session tokens — never commit it.

> **Note:** Apps Script sessions expire after 12 hours. If specs start failing at the login screen, re-run the setup command above.

### Running the full test suite

After the auth bootstrap, all subsequent runs are fully headless and non-interactive:

```sh
pnpm playwright test
```

### Running a specific story

```sh
pnpm playwright test tests/admin.spec.ts -g "US-018"
```

### Playwright MCP integration

The Playwright MCP browser also uses `tests/.auth/auth.json` for session reuse. If you run ad-hoc MCP clicks after the bootstrap, they will be authenticated. Re-run the setup project whenever the session expires.

## Deployment

### Fresh deploy from scratch

1. Clone the repository.
2. Copy `.clasp.json.example` to `.clasp.json` and fill in your Apps Script project ID:
   ```sh
   cp .clasp.json.example .clasp.json
   # edit .clasp.json and replace YOUR_APPS_SCRIPT_PROJECT_ID with your actual scriptId
   ```
3. Log in to clasp:
   ```sh
   clasp login
   ```
4. Push the source files to Apps Script:
   ```sh
   clasp push
   ```
5. Deploy the web app (set execution as "User accessing the app", access "Anyone"):
   ```sh
   clasp deploy --deploymentId <PROD_DEPLOY_ID>
   ```
6. Visit the `/exec` URL in your browser. If `DB_SHEET_ID` is not yet set, the **first-run setup wizard** appears automatically — follow the three steps to create the database, enter school info, and confirm the default admin account.
7. Log in as `admin` with the temporary password `admin1234` and **change it immediately** via Admin → จัดการผู้ใช้.

### Redeploying after code changes

```sh
clasp push
clasp deploy --deploymentId <PROD_DEPLOY_ID>
```

## Test data isolation

All test-created records use IDs prefixed with `test_`. The cleanup helper (`cleanupTestData()` in `tests/helpers/seed.ts`) deletes every `test_`-prefixed row across all sheet tabs after each spec run. No `test_`-prefixed rows should remain in the production sheet after a clean test run.
