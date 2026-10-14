# AGENTS

This repository is a workshop project for a project-tracking platform. Treat it as a realistic but intentionally scoped application: fake data, limited edge cases, and a clear emphasis on shipping working end-to-end features rather than niche production complexity.

## Source of truth

Precedence, highest first: the owner's decisions (see [Owner decisions](#owner-decisions)), [TuesdayNotes.md](TuesdayNotes.md), [db/schema.sql](db/schema.sql), then the files below.

- [TuesdayNotes.md](TuesdayNotes.md): role and feature requirements from the workshop briefing.
- [db/schema.sql](db/schema.sql): active database schema.
- [Workshop_Guidance.md](Workshop_Guidance.md): employer requirements and the business problem.
- [Object Structure V4.md](Object Structure V4.md): detailed domain model and schema decisions.
- [README.md](README.md): repository entry point and general project context.
- [docs/README.md](docs/README.md): workshop-specific guidance and role-based tasks.
- [bin/README.md](bin/README.md): local development and deployment scripts.

When requirements are ambiguous, prefer these files over older drafts such as [database.dbml](database.dbml), [Unitled (1).sql](Unitled%20(1).sql), and the V1/V2 notes. [db/schema.sql](db/schema.sql) is the active model; V4/V5 are background only and may differ (for example, they describe teams, which the schema does not have).

## Project context

- Stack: React + MUI frontend, Python backend (Lambda), PostgreSQL/Aurora data layer, and Terraform infrastructure.
- Local dev environment: PostgreSQL is expected at `localhost:5432` with user `postgres` and password `postgres123` (see [bin/setup-environment.sh](bin/setup-environment.sh)).
- The core business model (per [db/schema.sql](db/schema.sql)) includes users, projects, project allocations, milestones, milestone assignments and dependencies, time entries, expenses, and an append-only audit log.
- Important domain decisions:
  - There is no teams table. An employee has exactly one `manager_id` (required for employees), and a project has exactly one `manager_id`.
  - Employee-to-project is many-to-many through `project_allocations`; an allocation requires the employee's manager to match the project manager.
  - Milestone-to-employee is one-to-many through `milestone_assignments` (many assignees per milestone). Archiving a milestone detaches its employees.
  - Archival is handled via `is_archived` and `archived_at` fields instead of a separate archive table. Nothing is hard-deleted.
  - Usernames are 6 characters and meant to be auto-generated.

## Owner decisions

These override anything else in this repo, including agent suggestions.

- Authentication: simple login, no tokens. Role checks are enforced in the UI; the backend cannot fully trust a client-sent role.
- Admin: everything a manager and employee can do; creates users (employees and admins) and projects; un-archives projects; sole viewer of archived projects and audit logs.
- Manager: everything an employee can do; cannot create projects; edits their projects (including start/end dates), adjusts budget, creates milestones, assigns employees to their projects, edits/archives employees on their team, and archives a project only after all its milestones are done.
- Employee: views their assigned projects, logs time, and edits only their own name and email.
- Deploy to both LocalStack and AWS; deploy early.
- Authentication (started 2026-10-14, reversing the earlier "deferred" decision): simple username + password login, no tokens. The browser keeps only the user in `sessionStorage`; the client still sends `actor_id` and the backend looks up the role. Login, failed login and logout are written to `audit_log`.
- Admins may keep an "acting as" picker to view the app as another user (demos only). Everyone else loses the picker.
- No bootstrap page: the first admin is seeded with SQL ([db/seed-admin.sql](db/seed-admin.sql)). A seeded or admin-created user must change their password on first login (`users.must_change_password`).
- `/api/users` requires `actor_id`; only admins can create users.
- Next feature to build: projects (CRUD, manager and employee allocation).
- Fixed (owner approved): the `validate_milestone_dependency()` typo in [db/schema.sql](db/schema.sql) now uses `depends_on_milestone_id`.

## Current state

- Done: `backend/users` Lambda (GET list, POST create) and the frontend admin page (`AdminPage`, `AddUserDialog`, `UserTable`, `services/users.js`). The user form still asks for a typed username instead of generating one.
- Done: `backend/projects` Lambda (list, create, edit, archive/restore, allocations; every request needs `actor_id`) and the frontend Projects page. Handler tested locally against Postgres.
- Done (not yet deployed or run in the browser): `backend/auth` Lambda (`/login`, `/password`, `/logout`), login page, forced password change, admin-only "View as" picker, `/api/users` scoped by role and admin-only create, `users.must_change_password`, [db/seed-admin.sql](db/seed-admin.sql). Handlers tested against a throwaway Postgres database.
- To run auth locally: re-apply [db/schema.sql](db/schema.sql) (adds `must_change_password`), seed the admin with [db/seed-admin.sql](db/seed-admin.sql), then deploy with `./bin/start-dev.sh`.
- AWS database setup: Aurora is private to the VPC, so `backend/dbsetup` (direct `aws lambda invoke` only) applies its copy of the schema and seeds `admin1`. Re-copy [db/schema.sql](db/schema.sql) into `backend/dbsetup/` after schema changes.
- Not done: milestones, time entries, expenses, audit log viewer, username auto-generation, login rate limiting.
- Known issue: `npm run lint` in `frontend/` fails because `eslint-plugin-react-hooks` is not installed.

## Repo structure

- [frontend/](frontend/): React application and UI assets.
- [backend/](backend/): Python service code and examples.
- [infra/](infra/): Terraform for AWS deployment.
- [bin/](bin/): setup, local-start, and deployment scripts.
- [data/](data/): example data and job-related assets.
- [docs/](docs/): workshop role guides and validation material.

## Working conventions

- Prefer small, testable changes that fit the existing workshop structure.
- Do not introduce over-engineered patterns just because they are common in production systems.
- Keep fake-data assumptions in mind; skip niche edge cases unless they are explicitly required in the workshop docs.
- When changing schema or data rules, align with [db/schema.sql](db/schema.sql) and the owner decisions above before relying on older SQL or DBML drafts.
- Record the owner's answers to decision questions in this file so context persists across conversations.
- For infrastructure or deployment work, follow the scripts in [bin/README.md](bin/README.md) and keep AWS/local-stack differences in mind.

## Local workflow

Common commands to use during development:

- `./bin/start-dev.sh` — start the local dev environment.
- `./bin/deploy-backend.sh [aws|local]` — deploy backend changes.
- `./bin/deploy-frontend.sh [aws|local]` — deploy frontend changes.
- `./bin/setup-environment.sh` — set up the environment on a fresh Ubuntu machine.

The repo is designed around a local-stack workflow first and AWS deployment second.

## Agent guidance

- Keep instructions concise and aligned to the actual repo, not generic software advice.
- Link to the relevant docs instead of duplicating long requirements in chat or custom instructions.
- If a task is workflow-specific, prefer the workshop docs over ad hoc assumptions.
- Keep domain-specific rules grounded in the project model: users, projects, allocations, milestones, assignments, time entries, and audit logging.
- Ask the owner for decisions that are theirs to make instead of assuming; owner decisions beat agent preferences.
- Never copy credentials or tokens from [TuesdayNotes.md](TuesdayNotes.md) into other files.
