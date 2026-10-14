# Project Tracking System – Data Objects (V5)

This doc gives the roles and the data objects for the system. Each key shows: name, type, and rules.

Fields marked *(added)* are not in the original notes. They are necessary for the database.

V5 replaces teams with a direct employee-to-manager link, as in `Transcript_of_project.md`. It adds milestone dependencies, project allocations, and expenses.

---

## Part 1 – Roles

Inherits:
Admin -> Manager -> Employee

### 1.1 Employee

- An admin creates each employee.
- Each employee has exactly one manager.
- Can see only the projects they are allocated to, while the project is active.
- Cannot see archived, completed, or abandoned projects.
- Can see their own hours across projects.
- Can modify only their own name and email.

### 1.2 Manager

- Each employee has one manager. Each project has one manager. A manager can have many employees and many projects.
- Cannot see archived, completed, or abandoned projects.
- Can edit the name and email of their own employees.
- Can see the salary of their own employees.
- Can allocate their own employees to their own projects.
- Can create and modify these items on their projects:
  - Milestones and milestone dependencies
  - Milestone assignments
  - Project description and project fields
  - Project and milestone start dates and end dates
  - Budget and expenses
  - Allocated hours
- Can set a project or a milestone to `completed`.

### 1.3 Admin

- Can do all the manager actions.
- Can create projects.
- Can archive (delete) projects and users, and set projects to `abandoned`.
- Can create employees and managers (users).
- Can assign roles, including the admin role.
- Can assign a manager to a project. Can reassign an employee to a different manager.
- Can see archived, completed, and abandoned projects.
- Can see the audit log.

---

## Part 2 – Data objects

### 2.1 User

- `id`: UUID. Primary key. *(added)*
- `username`: string, 6 characters. The system generates it. Unique.
- `first_name`: string. Required.
- `last_name`: string. Required.
- `email`: string. Required. Unique.
- `password_hash`: string. Required. Do not keep the plain password.
- `role`: enum (`admin`, `manager`, `employee`). Required. Only an admin can change it.
- `job_title`: string.
- `salary`: decimal. Only admins and the user's manager can see it. Used for cost calculation.
- `profile_picture_url`: string. Optional.
- `manager_id`: UUID. Foreign key to User (the manager). Required for employees (`NOT NULL` if `role` equals `employee`). Optional for admins and managers.
- `is_archived`: boolean. Default `false`. *(added)*
- `archived_at`: timestamp. Optional. *(added)*
- `created_at`, `updated_at`: timestamp. *(added)*

Lists such as an employee's projects or a manager's employees are queries, not columns. Junction tables are better than arrays of foreign keys.

### 2.2 Project

- `id`: UUID. Primary key. *(added)*
- `name`: string. Required. Unique.
- `description`: text. The project description and goal.
- `start_date`: date. Required.
- `end_date`: date. Required. Predicted end date. Must be on or after `start_date`.
- `allocated_hours`: integer. Required.
- `budget`: decimal. Planned spend. Optional.
- `manager_id`: UUID. Foreign key to User. Required. One manager only.
- `status`: enum (`not_started`, `in_progress`, `completed`, `abandoned`).
  - Only the manager or an admin sets `completed`.
  - Only an admin sets `abandoned`.
- `is_archived`: boolean. Default `false`. The system sets it to `true` when the status is `completed` or `abandoned`, or when an admin deletes the project.
- `archived_at`: timestamp. Optional. *(added)*
- `created_by`: UUID. Foreign key to User (admin). *(added)*
- `created_at`, `updated_at`: timestamp. *(added)*

The current milestone is a query: the milestone whose status is `in_progress`. Milestones are found through `Milestone.project_id`.

### 2.3 Project Allocation

This object connects employees to projects, and records the hours planned for each. One employee can be on many projects. One project can have many employees. This is a many-to-many relationship, and therefore requires a join table. *(added)*

- `id`: UUID. Primary key.
- `project_id`: UUID. Foreign key to Project. Required.
- `user_id`: UUID. Foreign key to User. Required.
- `planned_hours`: decimal. Required. Zero or more.
- `allocated_by`: UUID. Foreign key to User (manager or admin).
- `allocated_at`: timestamp.
- Rule: the pair `project_id` + `user_id` must be unique.
- Rule: the employee's `manager_id` must equal the project's `manager_id`.
- Over-allocation is a query: the sum of an employee's planned hours across projects compared with 40 hours per week.

### 2.4 Milestone

A milestone is a small project inside a project.

- `id`: UUID. Primary key. *(added)*
- `project_id`: UUID. Foreign key to Project. Required.
- `sequence_number`: integer. Required. Starts at 1 for each project. The pair `project_id` + `sequence_number` must be unique.
- `name`: string. Required.
- `goal`: text. Example: decommission 200 servers.
- `deliverables`: text. The key deliverables.
- `completion_criteria`: text. Set by the manager.
- `start_date`: date. Required. Planned start. Must be in the project dates.
- `end_date`: date. Required. Planned end. Must be in the project dates.
- `actual_start_date`: date. Optional. Shows slippage against `start_date`.
- `actual_end_date`: date. Optional.
- `status`: enum (`not_started`, `in_progress`, `completed`). Only the manager or an admin sets `completed`, after the goal is met.
  - Dates can be edited while the status is `not_started` or `in_progress`. They are locked once `completed`.
  - A completed milestone is not reopened.
- `completed_at`: timestamp. Optional. *(added)*
- `is_archived`: boolean. Default `false`. *(added)*

### 2.5 Milestone Dependency

This object records which milestones must finish before another can start. One milestone can depend on many milestones. This is a many-to-many relationship on Milestone, and therefore requires a join table. *(added)*

- `id`: UUID. Primary key.
- `milestone_id`: UUID. Foreign key to Milestone. The milestone that waits. Required.
- `depends_on_milestone_id`: UUID. Foreign key to Milestone. The predecessor. Required.
- Rule: the pair must be unique.
- Rule: a milestone cannot depend on itself.
- Rule: both milestones must belong to the same project.
- Example: milestone 3 depends on 1 and 2, so it cannot start until both are `completed`.

### 2.6 Milestone Assignment

This object connects milestones to employees. One milestone can have many employees. An employee works on one milestone at a time, so the milestones of one employee do not overlap. This is a many-to-many relationship over time, and therefore requires a join table. *(added)*

- `id`: UUID. Primary key.
- `milestone_id`: UUID. Foreign key to Milestone. Required.
- `user_id`: UUID. Foreign key to User. Required.
- `assigned_by`: UUID. Foreign key to User (manager or admin).
- `assigned_at`: timestamp.
- `detached_at`: timestamp. Optional. The system sets it when the milestone is `completed`. The employee is then free for the next milestone.
- Rule: the pair `milestone_id` + `user_id` must be unique.
- Rule: the employee must be allocated to the milestone's project (see Project Allocation).

### 2.7 Time Entry

This object records the hours that an employee works on a project. The system adds these entries to get the total hours for each employee and each project. *(added)*

Planned hours can also be calculated: employees × 8 hours × working days. Example: 5 employees on a 5-day milestone is 200 hours.

- `id`: UUID. Primary key.
- `project_id`: UUID. Foreign key to Project. Required.
- `milestone_id`: UUID. Foreign key to Milestone. Optional.
- `user_id`: UUID. Foreign key to User. Required.
- `work_date`: date. Required.
- `hours`: decimal. Required. Must be more than 0.
- `note`: text. Optional.
- `created_at`: timestamp.

### 2.8 Expense

This object records project costs that are not salaries, such as technology or licensing. *(added)*

- `id`: UUID. Primary key.
- `project_id`: UUID. Foreign key to Project. Required.
- `amount`: decimal. Required. Zero or more.
- `description`: text. Required.
- `incurred_on`: date. Required.
- `created_by`: UUID. Foreign key to User.
- `created_at`: timestamp.

Actual cost of a project is a query: for each time entry, hours × hourly rate from the employee's salary, plus the project's expenses. Compare it with `Project.budget`.

### 2.9 Audit Log

This object records each action that changes data. Only admins can see it. No user, including an admin, can edit or delete an entry. The system writes an entry in the same transaction as the action. Never store passwords or other secrets.

- `id`: UUID. Primary key. *(added)*
- `actor_id`: UUID. Foreign key to User. The user who did the action. Optional for a failed login with an unknown user.
- `actor_role`: enum (`admin`, `manager`, `employee`). The role at the time of the action.
- `action`: enum (`create`, `update`, `archive`, `restore`, `assign_role`, `assign_manager`, `assign_employee`, `complete`, `abandon`, `login`, `login_failed`, `logout`). *(added)*
- `entity_type`: string. Example: `project`, `user`, `milestone`, `expense`. *(added)*
- `entity_id`: UUID. The ID of the changed object. Not a foreign key, because it points at different tables. *(added)*
- `changes`: JSON. The values before and after the change. *(added)*
- `source`: string. Optional. IP address or request ID.
- `created_at`: timestamp. Set by the server.

---

## Part 3 – Archive

The system does not use a separate Archive table. Nothing is hard-deleted. Each object has `is_archived` and `archived_at`. Only admins can see archived items and restore them. To restore an item, set `is_archived` to `false`. The system writes each archive and restore action to the audit log.
