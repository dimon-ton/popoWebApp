# Local Automation Examples

These files are opt-in templates for local commit automation. They deliberately use
the repository path relative to the script, commands from `PATH`, and the current
branch's configured upstream. Both workflows stage every non-ignored change, so
review `git status` and `git diff` before using them.

Copy a template to a local ignored location or remove its `.example` suffix only on
the machine where it will run. Do not add credentials or machine-specific paths to
the tracked templates.
