# PopoWebApp - To-Do List

## 1. Avatar Support
- [x] Implement backend functions for avatar upload and removal in `auth.gs`.
- [x] Add frontend logic for avatar selection and upload in `_styles.html`.
- [x] Add CSS for navbar avatars in `_styles.html`.
- [x] Update all page navbars to display the user's avatar.
  - [x] `admin_workload.html`
  - [x] `dashboard.html`
  - [x] `admin_audit.html`
  - [x] `admin_classes.html`
  - [x] `admin_db_status.html`
  - [x] `admin_enrollments.html`
  - [x] `admin_indicators.html`
  - [x] `admin_school.html`
  - [x] `admin_subjects.html`
  - [x] `admin_users.html`
  - [x] `admin_weights.html`
  - [x] `class_attendance.html`
  - [x] `class_characteristics.html`
  - [x] `class_formative.html`
  - [x] `class_readthinkwrite.html`
  - [x] `class_report.html`
  - [x] `class_students.html`
  - [x] `class_summative.html`
  - [x] `help.html`
  - [x] `setup_wizard.html` (N/A - No navbar)
  - [x] `subject_description.html`
  - [x] `subject_indicators_ref.html`
  - [x] `weights_ref.html`

## 2. Name Input Splitting (Prefix, Name, Surname)
- [x] Update `admin_users.html` to split full name into Prefix, First Name, and Last Name.
- [x] Update `class_students.html` to split student name into Prefix, First Name, and Last Name.
- [x] Explore all other pages for name-surname inputs and update them.
  - [x] `admin_enrollments.html` (Checked: no name input)
  - [x] `setup_wizard.html` (Checked: no name input)
  - [x] Others... (Checked: no others found)

## 3. Mandatory Password Change
- [x] Add `must_change_pwd` flag to user data in `auth.gs`.
- [x] Create `change_password.html` page.
- [x] Update `login.html` to redirect users with `must_change_pwd` flag to the change password page.
- [x] Implement password change logic in `auth.gs`.
