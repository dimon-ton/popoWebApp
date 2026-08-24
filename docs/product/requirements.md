# PopoWebApp Product Requirements

Status: current implemented product baseline

Operational source: [`AGENTS.md`](../../AGENTS.md)

Original workbook reference: [`reference/gradebook-template`](../../reference/gradebook-template/)

## 1. Product overview

PopoWebApp is a Thai school-wide ป.พ.5 grade-book web application for administrators
and teachers. It runs as a Google Apps Script web app, renders HTML templates in the
browser, and uses one Google Sheet as its relational data store.

The product must let an administrator configure the school, users, classes, subjects,
teachers, curriculum indicators, score weights, and holidays. Teachers must be able to
maintain class rosters and record attendance, formative scores, summative scores,
learner characteristics, read-think-write results, and development-activity results.
The system must produce the existing printable grade-book report without changing its
established calculations or layout.

## 2. Users and access

- `admin` users can manage all configuration, assignments, audit data, and classroom
  records.
- `teacher` users see their enrolled class/subject pairs and can edit only authorized
  classroom data. Homeroom access follows the class's configured teacher IDs.
- Passwords are salted and hashed. A reset or temporary password requires a password
  change, and sessions expire after 12 hours.
- Session tokens are stored as `popo_token` in browser local storage and resolved from
  script cache. Pages and server functions must both enforce authorization.
- Profile editing supports uploaded avatars and gender-aware default avatars.

## 3. Functional requirements

### Administration

- Maintain school identity, academic year, semester dates, required attendance days,
  report signatories, logo, and contact information.
- Maintain holidays as ISO date ranges and exclude holiday dates from attendance days.
- Create, edit, import, and delete users, classes, subjects, students, indicators, and
  teacher enrollments according to their existing authorization rules.
- Support multiple homeroom teachers per class and resolve CSV teacher names to user IDs.
- Configure subject scoring weights and show teacher workload and audit-log views.
- Provide database-status and first-run setup views for initializing and inspecting the
  master Sheet.

### Teacher workflows

- Display assigned class/subject pairs on the dashboard and preserve stable page routes.
- Maintain student rosters, including Thai name normalization and ISO birth-date storage.
- Record attendance over configured non-holiday school days using batched persistence.
- Record formative indicator scores, summative components and grades, characteristics,
  read-think-write criteria, and development-activity results.
- Calculate labels and grades using the rules implemented by the corresponding server
  modules; validate numeric ranges before persistence.
- Render and export the existing ป.พ.5 grade-book report. Report layout, aggregation,
  printable tables, and export behavior are protected compatibility boundaries.

### Cross-subject assessment copying

- Attendance, characteristics, and read-think-write pages may stage completed values
  from another subject in the same class.
- Match students only by `student_id`; never match by displayed name or row position.
- Exclude the destination subject and revalidate class, teacher access, completeness,
  and value validity on the server when listing and retrieving sources.
- Copy into unsaved browser state. The user must use the destination page's save action
  to persist values, and missing source values must not clear destination values.
- Attendance copying covers the configured full-year date set and persists through its
  existing indexed batched save operation.

### Shared experience

- Show Thai-formatted dates to users while sending and storing ISO `yyyy-mm-dd` values.
- Keep student-name headers and cells left-aligned and vertically centered only where the
  shared `student-name-col` convention applies.
- Shared assessment tooltips must support pointer, keyboard, and touch interaction,
  Escape dismissal, tooltip ARIA semantics, and rendering outside scroll clipping.
- The read-think-write page must visibly map อ่าน 1–3, คิด 1–4, and เขียน 1–3 to their
  curriculum criteria.
- Authenticated users can submit bug reports or feature requests to the configured
  Telegram destination, including validated image attachments.

## 4. Data requirements

The master Sheet contains 16 application tables:

| Table | Purpose and key fields |
| --- | --- |
| `Users` | Identity, credentials, role, avatar, password-change state, login timestamps |
| `SchoolInfo` | School, academic calendar, contact, logo, and report signatories |
| `Classes` | Level, section, and one or more homeroom teacher IDs |
| `Subjects` | Class-scoped subject identity, hours, weight group, and subject group |
| `Enrollments` | Teacher-to-class/subject assignments |
| `Students` | Class roster, identifiers, normalized name, ISO birth date, and note |
| `Indicators` | Subject indicators, descriptions, maximum scores, and display order |
| `SubjectWeights` | Class/subject coursework and examination maxima |
| `Attendance` | Student/subject/date/period status and update attribution |
| `IndicatorScores` | Student scores by subject and indicator |
| `SummativeScores` | Score components, total, computed grade, makeup grade, and final grade |
| `Characteristics` | Eight criterion values, total, and label |
| `ReadThinkWrite` | Three reading, four thinking, and three writing criteria, total, and label |
| `AuditLog` | Actor, entity, before/after values, and timestamp |
| `DevActivity` | Student development-activity result by class and subject |
| `Holidays` | ISO date ranges, type, description, creator, and update timestamp |

All mutations must use the shared database layer and document lock. Spreadsheet values
with numeric-looking identifiers must be normalized with `String()` before comparison.
Audit attribution and timestamps must be retained for assessment writes.

## 5. Technical and operational requirements

- Source files under `src/` are pushed directly through clasp; there is no build or
  transpilation step.
- `Code.gs` owns stable logical routes and maps them to nested template paths.
- Shared CSS, navigation, toast, loading, avatar, and tooltip behavior remains centralized
  in `_styles.html`.
- The production deployment ID and URL documented in `AGENTS.md` remain stable across
  redeployments.
- The current production baseline is deployment
  `AKfycbxoOgEwrVOCxFvZEQahEiCvfB29gu5rQ8z1kplcMjipkzSBrZe6GrbkGHF4VwO8M4mA`, version
  288, at its public `/exec` URL. The sign-in-gated HEAD deployment must not replace it.
- The local `.clasp.json` supplies the Apps Script project ID and must not be committed;
  `.clasp.json.example` is the shared template.
- Test-only API mutations require a configured token and accept only `test_`-prefixed data.

## 6. Quality gates

- Install exact Node dependencies with `npm ci`.
- Keep Playwright at one worker with a 60-second timeout because Sheet writes are serialized.
- Bootstrap `tests/.auth/auth.json` when the cached session expires; never commit it.
- Run `npm test` for the complete suite or `npm run test:smoke` for the critical smoke set.
- Every test-created record must use a `test_` prefix and be removed through the shared
  cleanup helper.
- Deploy only after local validation, then push with clasp and redeploy the stable production
  deployment ID. A documentation-only repository reorganization requires no deployment.

## 7. Compatibility boundaries

- Preserve logical page names, `google.script.run` server-function contracts, Sheet tab names,
  and stored field formats unless a separately approved feature changes them.
- Do not change `src/teacher/class_report.html`, printable report tables, aggregation, or
  export behavior as part of assessment UX work.
- Historical product drafts and completed trackers under `docs/archive/` are retained for
  context but are not current requirements.
