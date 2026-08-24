# CSS Consolidation Summary

> Archived implementation note. This is not current product documentation.

The app now uses `src/_styles.html` as the single document-level stylesheet include.

## What Changed

- Added a unique page class to every HTML template `<body>`, for example `page-login`, `page-dashboard`, and `page-admin-enrollments`.
- Moved all document-level template `<style>` blocks into `src/_styles.html`.
- Scoped moved page styles under their page class so generic selectors do not leak globally:
  - `body` -> `body.page-login`
  - `.container` -> `.page-admin-enrollments .container`
  - `.error` -> `.page-login .error`
  - `h1`, `p`, `a`, `.btn`, and similar page-only selectors are page-scoped.
- Left `teacher/class_report.html` print-window style strings in JavaScript because they are written into a separate print document.

## Why This Is Safe

The previous raw consolidation broke the UI because page-specific CSS became global. The current approach keeps one CSS include while preserving per-page cascade behavior through page classes.

## Verification

- No document-level template `<style>` blocks remain outside `src/_styles.html`.
- The only other `<style>` strings are the report print-window styles in `teacher/class_report.html`.
- Static check found no obvious unscoped page selector leaks in the page-style section of `_styles.html`.
- Browser computed-style checks passed:
  - Login body is flex-centered.
  - Dashboard body remains normal block layout with navbar padding.
  - Admin enrollments keeps its flex split-panel layout.
