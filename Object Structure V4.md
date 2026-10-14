# Project Tracking System – Data Objects

This doc gives the roles and the data objects for the system. Each key shows: name, type, and rules.

Fields marked *(added)* are not in the original notes. They are necessary for the database.

---

## Part 1 – Roles

Inherits:
Admin -> Manager -> Employee

### 1.1 Employee

- An admin creates each employee.
- Each employee is on one team. A team is not a project.
- Can see only the active projects of their team.
- Cannot see archived, completed, or abandoned projects.
- Can modify only their own personal data.

### 1.2 Manager

- Can have more than one team.
- Each team has one manager. Each project has one manager.
- Cannot see archived, completed, or abandoned projects.
- Can add and edit teams.
- Can assign their teams to their projects.
- Can create and modify these items on their projects:
  - Milestones
  - Project description and project fields
  - Project and milestone start dates and end dates
  - Budget
  - Allocated hours
- Can set a project or a milestone to `completed`.

### 1.3 Admin

- Can do all the manager actions.
- Can create projects.
- Can archive (delete) projects and set them to `abandoned`.
- Can create employees (users).
- Can assign roles, including the admin role.
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
- `salary`: decimal. Only admins can see it.
- `profile_picture_url`: string. Optional.
- `team_id`: UUID. Foreign key to Team. Required for employees (i.e. `NOT NULL` if `role` equals `employee`). Optional for Admins and managers.
- ~~`current_projects`: array of Project IDs. The system gets this list from the projects of the user's team.~~
  - See addendum
- `is_archived`: boolean. Default `false`. *(added)*
- `archived_at`: timestamp. Optional. *(added)*
- `created_at`, `updated_at`: timestamp. *(added)*

### 2.2 Team

- `id`: UUID. Primary key. *(added)*
- `name`: string. Required. *(added)*
- `manager_id`: UUID. Foreign key to User. Required. One manager to one team is one to one relationship.
~~- `members`: array of User IDs. The system gets this list from `User.team_id`.~~
  - See addendum
- `is_archived`: boolean. Default `false`. *(added)*
- `created_at`, `updated_at`: timestamp. *(added)*

### 2.3 Project

- `id`: UUID. Primary key. *(added)*
- `name`: string. Required. Unique.
- `description`: text. The project description and goal.
- `start_date`: date. Required.
- `end_date`: date. Required. Must be after `start_date`.
- `allocated_hours`: integer. Required.
- `budget`: decimal. Optional.
- `manager_id`: UUID. Foreign key to User. Required. One manager only.
- ~~`teams`: array of Team IDs. The system gets this list from Project Team.~~
  - See addendum
- ~~`assigned_employees`: array of User IDs. The system gets this list from the members of the assigned teams.~~
  - See addendum
- ~~`milestones`: array of Milestone IDs. The system gets this list from `Milestone.project_id`.~~
  - See addendum
- `active_milestone_id`: UUID. Foreign key to Milestone. Optional.
- `status`: enum (`active`, `completed`, `abandoned`).
  - Only the manager or an admin sets `completed`.
  - Only an admin sets `abandoned`.
- `is_archived`: boolean. Default `false`. The system sets it to `true` when the status is `completed` or `abandoned`, or when an admin deletes the project.
- `archived_at`: timestamp. Optional. *(added)*
- `created_by`: UUID. Foreign key to User (admin). *(added)*
- `created_at`, `updated_at`: timestamp. *(added)*

### 2.4 Project Team

This object connects teams to projects. One team can be on many projects. One project can have many teams. This is a many-to-many relationship, and therefore requires a join table. *(added)*

- `id`: UUID. Primary key.
- `project_id`: UUID. Foreign key to Project. Required.
- `team_id`: UUID. Foreign key to Team. Required.
- `assigned_by`: UUID. Foreign key to User (manager or admin).
- `assigned_at`: timestamp.
- Rule: the pair `project_id` + `team_id` must be unique.

### 2.5.0 Milestone

A milestone is a small project inside a project.

- `id`: UUID. Primary key. *(added)*
- `project_id`: UUID. Foreign key to Project. Required. Sequential ID
- `name`: string. Required.
- `goal`: text. Example: decommission 200 servers.
- `deliverables`: text or list of strings.
- ~~`Assigned Employees`: List~~
  - See addendum
- `start_date`: date. Required. Must be in the project dates.
- `end_date`: date. Required. Must be in the project dates.
- `status`: enum (`active`, `completed`). Only the manager or an admin sets `completed`, after the team meets the goal.
- `completed_at`: timestamp. Optional. *(added)*
- `is_archived`: boolean. Default `false`. *(added)*

### 2.5.1 Milestone Assignments

This object connects milestones to employees. One milestone can have many employees


### 2.6 Time Entry

This object records the hours that an employee works on a project. The system adds these entries to get the total hours for each employee and each project. *(added)*

- `id`: UUID. Primary key.
- `project_id`: UUID. Foreign key to Project. Required.
- `milestone_id`: UUID. Foreign key to Milestone. Optional.
- `user_id`: UUID. Foreign key to User. Required.
- `work_date`: date. Required.
- `hours`: decimal. Required. Must be more than 0.
- `note`: text. Optional.
- `created_at`: timestamp.

### 2.7 Audit Log

This object records each action that changes data. Only admins can see it. No user can edit or delete an entry.

- `id`: UUID. Primary key. *(added)*
- `actor_id`: UUID. Foreign key to User. The user who did the action.
- `action`: enum (`create`, `update`, `archive`, `restore`, `assign_role`, `assign_team`, `complete`, `abandon`). *(added)*
- `entity_type`: string. Example: `project`, `user`, `team`, `milestone`. *(added)*
- `entity_id`: UUID. The ID of the changed object. *(added)*
- `changes`: JSON. The values before and after the change. *(added)*
- `created_at`: timestamp.

---

## Part 3 – Archive

The system does not use a separate Archive table. Each object has `is_archived` and `archived_at`. Only admins can see archived items and restore them. To restore an item, set `is_archived` to `false`. The system writes each archive and restore action to the audit log.

*Addendum*: Junction tables are better than arrays of foreign keys. Source: https://stackoverflow.com/questions/69898284/postgresql-array-of-foreign-keys