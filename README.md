# PopoWebApp

Google Apps Script web app backed by a Google Sheet for school-wide ป.พ.5 grade-book
management.

## Repository map

| Path | Contents |
| --- | --- |
| [`src/`](src/) | Apps Script server code and server-rendered HTML pushed by clasp |
| [`tests/`](tests/) | Playwright end-to-end tests and isolated test-data helpers |
| [`docs/`](docs/) | Current product documentation, design references, guides, and archive |
| [`reference/`](reference/) | Original workbook and optional inspection tools |
| [`assets/`](assets/) | Tracked application image assets |
| [`scripts/examples/`](scripts/examples/) | Opt-in, portable local-automation templates |

See [`AGENTS.md`](AGENTS.md) for architecture, data rules, deployment details, and protected
compatibility boundaries. See [`docs/product/requirements.md`](docs/product/requirements.md)
for current product behavior.

## Setup

### Prerequisites

- Node.js 18 or newer, including npm
- clasp for Apps Script deployment (available through `npx clasp` or a global install)
- Chromium installed by Playwright when prompted

Install the exact committed dependencies:

```sh
npm ci
```

Create `.env` or define these variables in the shell:

```sh
WEB_APP_URL=https://script.google.com/macros/s/<DEPLOY_ID>/exec
TEST_API_TOKEN=<your-test-api-token>
```

`TEST_API_TOKEN` must be at least 32 characters and match the Apps Script property of the
same name. Never commit `.env`, authentication state, or other live credentials.

## Local configuration

Copy the clasp template and enter the Apps Script project ID:

```sh
cp .clasp.json.example .clasp.json
```

The live `.clasp.json` is local-only and ignored. Existing developer copies are preserved.

OpenCode users may copy `opencode.json.example` to `opencode.json` and provide
`GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` through environment variables. The live file
is also ignored.

## Playwright tests

The suite uses one worker because Google Sheet mutations are lock-serialized. It traverses
the nested Apps Script sandbox frames through `tests/helpers/custom-test.ts` and uses only
`test_`-prefixed fixture records.

Bootstrap or refresh the saved authenticated session when needed:

```sh
npx playwright test --project=setup
```

The session is saved to ignored `tests/.auth/auth.json` and normally expires after 12 hours.
Run tests with:

```sh
npm test
npm run test:smoke
npx playwright test tests/admin.spec.ts -g "US-018"
```

The tests use the live URL in `WEB_APP_URL`. Full tests can write temporary `test_` records;
the shared cleanup helper removes them after each spec.

## Deployment

For a fresh checkout, create the local `.clasp.json`, authenticate with `npx clasp login`,
and follow the setup wizard if the Apps Script project has no `DB_SHEET_ID` property.

Push and redeploy the stable production deployment:

```sh
npx clasp push
npx clasp redeploy <PROD_DEPLOY_ID> --description "Release Description"
```

Use the production ID documented in [`AGENTS.md`](AGENTS.md); do not substitute the HEAD
deployment. If Apps Script reports its 200-version limit, clean unused Project History
versions before retrying.

The initial admin credentials are `admin` / `admin1234`. Change the temporary password
immediately after first login.
