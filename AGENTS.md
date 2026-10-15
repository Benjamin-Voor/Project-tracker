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
  - Users have no username. They are identified by `users.id` (UUID) and sign in with their email (owner decision, 2026-10-14).

## Owner decisions

These override anything else in this repo, including agent suggestions.

- Authentication and authorization are explicit design goals: [Workshop_Guidance.md](Workshop_Guidance.md) lists "User authentication and authorization" and "Role-based access control" as required features (owner, 2026-10-14). Current approach: simple login, no tokens. Role checks are enforced in the UI; the backend cannot fully trust a client-sent role.
- Admin: everything a manager and employee can do; creates users (employees and admins) and projects; un-archives projects; sole viewer of archived projects and audit logs.
- Manager: everything an employee can do; cannot create projects; edits their projects (including start/end dates), adjusts budget, creates milestones, assigns employees to their projects, edits/archives employees on their team, and archives a project only after all its milestones are done.
- Employee: views their assigned projects, logs time, and edits only their own name and email.
- Deploy to both LocalStack and AWS; deploy early.
- Authentication (started 2026-10-14; a required feature, not optional): simple login, no tokens; email + password since 2026-10-14 (email matched case-insensitively, unique via `users_email_lower_unique`). The browser keeps only the user in `sessionStorage`; the client still sends `actor_id` and the backend looks up the role. Login, failed login and logout are written to `audit_log`.
- Admins may keep an "acting as" picker to view the app as another user (demos only). Everyone else loses the picker.
- No bootstrap page: the first admin is seeded with SQL ([db/seed-admin.sql](db/seed-admin.sql)). A seeded or admin-created user must change their password on first login (`users.must_change_password`).
- `/api/users` requires `actor_id`; only admins can create users.
- Priorities: projects came first (built); authentication followed as a required workshop feature. Next feature is not yet chosen.
- Fixed (owner approved): the `validate_milestone_dependency()` typo in [db/schema.sql](db/schema.sql) now uses `depends_on_milestone_id`.
- Source of truth for the data model is [db/schema.sql](db/schema.sql) as-is, not V4/V5. Milestones have many assignees.
- Local first: the app must work locally before it is deployed. Fix packaging problems locally and do not deploy speculatively.
- Ask before running `bin/deploy-*.sh`, `bin/cleanup-environment.sh` (it runs `terraform destroy` with no prompt), or anything that restarts the owner's running dev processes (`start-dev.sh`, the proxy on port 3001).
- Restart after backend changes (2026-10-14, from [docs/full-stack.md](docs/full-stack.md)): after creating a new backend service, or after running `./bin/deploy-backend.sh local`, the dev environment must be restarted with `./bin/start-dev.sh`. The local deploy can give the Lambdas new Function URLs, and the proxy on port 3001 only reads them at startup, so until it restarts every API call returns 403. Agents must tell the owner plainly, every time, that a restart is needed and why. Do not run it without asking (see the rule below).
- Git (changed 2026-10-15): pushing is allowed to the owner's fork, remote `fork` (https://github.com/Benjamin-Voor/Project-tracker), signed in through `gh`. Never push to `origin` (the citi repo). Work lives on the `deploy-aws` branch; the fork's `main` follows citi upstream, so do not force-push it. Commit only the files for the feature at hand. Leave out `TuesdayNotes.md`, notes and draft files, the vendored `backend/*/psycopg*` folders and `.pip_installed` markers (created by `bin/start-dev.sh`), and the owner's own edits to `bin/start-dev.sh` and `docs/README.md`.
- `TuesdayNotes.md` holds credentials, so it is excluded from git locally (`.git/info/exclude`). AI tools must still read it; do not add it to `.aiexclude`.
- Stray files named `tgres123 psql ...` in the repo root were not created by the agent; leave them unless the owner asks to delete them.
- AI tools (2026-10-14): Copilot and Claude Code share instructions. `CLAUDE.md` imports this file and `.github/instructions/*.md` with `@path`; `.claude/commands/` symlinks to `.github/prompts/`; `.claude/settings.json` mirrors `.aiexclude` as read-deny rules. Edit the Copilot files, not copies.
- Working style: owner decisions beat agent suggestions; ask for decisions that are the owner's to make; record every answer in this file (the agent's private memory is not visible to other tools).
- Profile (changed 2026-10-14, replacing the earlier "always the logged-in user" decision): the app-bar "Profile" button shows the "View as" user, so an admin can test a manager's or employee's profile. Saves are recorded under that user, like everything else done while viewing as someone.
- Usernames removed (2026-10-14): with email sign-in the username was unused, so `users.username` was dropped (overriding the workshop brief's "auto-generated username" field). `users.id` (UUID) identifies a user everywhere: foreign keys, `actor_id`, and `POST /api/auth/password`, which now takes `user_id`. Seed scripts look users up by email; UI labels show email.
- Local test users (2026-10-14): the keyboard-mash users were renamed in place (not deleted) to superhero alter egos with `DefinitelyNot…@example.com` emails: Bruce Wayne (admin), Clark Kent (manager), Diana Prince (employee). Their password is `buzzsawben` (owner put it in [db/seed-demo.sql](db/seed-demo.sql), 2026-10-14). John Jameson and Peter Parker were created by the owner.
- Project hours (2026-10-14): a project has no hand-entered hours. Total hours are the sum of hours employees log (`time_entries`); allocated hours are the sum of each employee's manual allocation (`project_allocations.allocated_hours`, renamed from `planned_hours`). `projects.allocated_hours` was dropped; the owner chose to drop it rather than keep it, knowingly breaking "nothing is deleted" for this workshop. The transcript's formula (employees × 8 hours × working days) is for projects without time reporting, so it is not used here. V4/V5 describe a manual project field; ignore that.
- Demo projects (2026-10-14): every project added to seed or demo data must follow the superhero theme (like the Daily Bugle and Daily Planet projects in [db/seed-demo.sql](db/seed-demo.sql)).
- Late vs at risk (2026-10-14): only open projects (not archived, completed or abandoned) are flagged. Late: past `end_date`, so the deadline is already missed. At risk: deadline still ahead, and either at least 75% of the time (start to end) has passed with fewer than 75% of active milestones completed (no milestones = 0% done), or any active, not-completed milestone is past its planned end. Projects return `is_late`, `at_risk`, `progress` and `risk_reasons`; the dashboard lists late and at-risk projects separately. "Today" is server time (UTC on Lambda).
- Browser: for UI checks the agent opens its own tab (`forceNew`); the owner keeps the human tab and the agent does not drive it.
- Milestone dates (2026-10-14): a milestone's planned dates must lie within its project's dates (planned start on or after the project start, planned end on or before the project end). Actual dates are not checked; work may really finish after the project end. Editing a project's dates so that active milestones no longer fit is rejected, naming the milestones; the manager moves them first.
- Salaries (2026-10-14): every user needs a salary, admins included. [db/seed-demo.sql](db/seed-demo.sql) gives the superhero users salaries and fills any user still without one (by role: admin 120,000, manager 130,000, employee 80,000); salaries already set are kept. On AWS this runs with `dbsetup` `{"demo": true}`. Salary stays optional in the Add user form and schema (owner, 2026-10-14): only the seed fills it.
- React Responsive (2026-10-14): the brief names both MUI and `react-responsive`, so both are used. `useIsPhone` in [responsive.js](frontend/src/components/responsive.js) uses `react-responsive` (`maxWidth: 599`, matching MUI's `sm` breakpoint); table columns still use MUI `sx` breakpoints.
- Budget column (2026-10-14): employees still see the Budget column in the project list (no Budget tab). The owner is fine either way, so it was left as is.

## Open questions

- With authorization a stated requirement, is "no tokens" still enough? The backend trusts the client-sent `actor_id`, so anyone who calls the API directly can act as any user. Options: keep it (workshop scope) or add a server-checked session token. Unanswered.
- Removing an employee from a project hard-deletes the `project_allocations` row (the table has no archive column). Keep that, or add an archive column to the schema? Unanswered.
- Whether to add `backend/*/psycopg*` and `.pip_installed` to `.gitignore`. Unanswered.
- Login rate limiting is not started.
- Agent defaults from 2026-10-14 awaiting owner confirmation:
  - Over-allocated: an employee's `allocated_hours` summed over active projects exceeds 8 h × weekdays in those projects' combined date ranges; flags even single-project employees.
  - Dashboard tab is hidden from employees.
  - Removing a milestone dependency hard-deletes the row (no archive column; audit row keeps history), like allocations. Cycles are blocked in Python, not in the schema. Dependencies don't block status changes or enforce date order.
  - Time-entry notes are hidden on phones.
  - Filters are client-side, not saved across reloads, and managers' "My team" gets search only.

## Current state

- Done: `backend/users` Lambda: list, create (admin), `PATCH /{id}` (self: name/email; manager: own team incl. job title/salary; admin: also an employee's manager), `/{id}/archive` (manager: own team; admin), `/{id}/restore` (admin), `GET /audit` (admin). Frontend: `AdminPage` (admin "Users" + "Audit log" tabs; managers see "My team"), `EditUserDialog`, "Profile" in the app bar.
- Done: `backend/projects` Lambda (list, create, edit, archive/restore, allocations; every request needs `actor_id`) and the frontend Projects page. Handler tested locally against Postgres.
- Done (deployed to AWS 2026-10-14; browsed locally read-only, create/edit flows not yet clicked through): sub-routes of `/api/projects/{id}`: `milestones` (create/edit/status, assign/unassign allocated employees, archive detaches assignees), `time-entries` (log own hours; managers/admins see all), `expenses` and `budget` (manager/admin; uses the `project_budget_summary` view: logged hours × salary/2080 + expenses). Frontend: "Open" on a project shows `ProjectDetail` with Milestones, Time and Budget tabs.
- Done (2026-10-14; dragging checked in Chrome locally as Clark Kent and Diana Prince): "Gantt" tab in `ProjectDetail` ([MilestoneGantt.jsx](frontend/src/components/MilestoneGantt.jsx)), the owner's "look like Microsoft Project" request scoped to a Gantt view only (rest of the UI unchanged). Uses `frappe-gantt` (owner wanted a library; `gantt-task-react` needs React 18 and its fork needs MUI 6). Managers/admins drag bars to change a milestone's planned dates via the existing milestone `PATCH`; others see it read-only. frappe-gantt reports date changes during a drag, so the component saves once on mouse-up. The planned-date rule (owner decisions) is enforced in `backend/projects`; tested against a throwaway database; deployed to AWS 2026-10-14.
- Demo data: [db/seed-demo.sql](db/seed-demo.sql) (2 managers, 6 employees, 3 projects; every demo user's password is `Demo1234!`). It also seeds the superhero test users (Bruce Wayne admin; Jameson manages Parker, Kent manages Prince; password `buzzsawben` where the seed creates them, existing users are left unchanged) and 9 superhero projects covering every project status, late and at-risk examples, and an over-allocated employee (owner, 2026-10-14). On AWS invoke `dbsetup` with `{"demo": true}`.
- Done (deployed to AWS 2026-10-14; email login, roles and View as checked in the browser locally): `backend/auth` Lambda (`/login`, `/password`, `/logout`), login page, forced password change, admin-only "View as" picker, `/api/users` scoped by role and admin-only create, `users.must_change_password`, [db/seed-admin.sql](db/seed-admin.sql). Handlers tested against a throwaway Postgres database.
- To run auth locally: re-apply [db/schema.sql](db/schema.sql) (adds `must_change_password`), seed the admin with [db/seed-admin.sql](db/seed-admin.sql), then deploy with `./bin/start-dev.sh`.
- AWS database setup: Aurora is private to the VPC, so `backend/dbsetup` (direct `aws lambda invoke` only) applies its copy of the schema, seeds the first admin (`admin@example.com`) and optionally the demo data. Re-copy [db/schema.sql](db/schema.sql) and [db/seed-demo.sql](db/seed-demo.sql) into `backend/dbsetup/` after changing them.
- Deployed to AWS 2026-10-14 (evening): calculated project hours, `project_allocations.allocated_hours` rename, username removal, and the demo seed with superhero users (`dbsetup` run with `{"demo": true}`). API smoke-tested; not clicked through in the browser.
- Done (2026-10-14, by four parallel agents; lint and build pass, backend handlers tested against throwaway databases; MUI prop fixes done; deployed to AWS 2026-10-14 with the salary seed (`dbsetup` `{"demo": true}`), API smoke-tested only. Local check 2026-10-14: schema and seed re-applied; API smoke test as admin/manager/employee passed (risk fields, workload scoping, dependency add/cycle/self/permission checks, planned-date rule); headless-Chromium screenshots of Projects, Dashboard, Users/My team, milestones, Gantt and phone layout for all three roles, no console errors. Create/edit dialogs and filter interactions were not clicked through; the Dashboard no longer shows empty "(0)" sections while loading (frontend fix not yet on AWS):
  - Search and filter: [FilterBar.jsx](frontend/src/components/FilterBar.jsx) on Projects (search, status, manager, risk), Users/My team, and milestones.
  - Risk and workload: projects return `is_late`, `at_risk`, `progress`, `risk_reasons`; `GET /api/projects/workload`; "Risk" column in `ProjectTable` (every project gets a chip: late, at risk, on track, or closed for completed/abandoned/archived; same values in the risk filter); [DashboardPage.jsx](frontend/src/pages/DashboardPage.jsx) tab for managers/admins.
  - Milestone dependencies: `GET /api/projects/{id}/milestones/dependencies`, `POST`/`DELETE .../milestones/{mid}/dependencies[/{depends_on_id}]`; milestones return `depends_on`; "Depends on" chips in `MilestonesPanel`; arrows in the Gantt.
  - Mobile layout: helpers in [responsive.js](frontend/src/components/responsive.js) (`hideOnXs`, `hideBelowMd`, `scrollX`, `useIsPhone`); tables scroll and hide columns, dialogs go full screen on phones, app bar collapses account buttons into a menu.
- Not done: login rate limiting. React 19 ignores the `defaultProps` still set on some components (harmless: all are null/empty defaults).
- Lint: `npm run lint` passes; `react-hooks/set-state-in-effect` and `react-refresh/only-export-components` are warnings (data loading and form resets in effects is the codebase's pattern).

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
- Skills in `.claude/skills/` (read by Claude Code and by VS Code Copilot): `deploy` (ship to AWS or LocalStack) and `verify-ui` (check the running app in VS Code's integrated browser; Claude Code could not use that browser as of 2026-10-14).

The repo is designed around a local-stack workflow first and AWS deployment second.

## Agent guidance

- Keep instructions concise and aligned to the actual repo, not generic software advice.
- Link to the relevant docs instead of duplicating long requirements in chat or custom instructions.
- If a task is workflow-specific, prefer the workshop docs over ad hoc assumptions.
- Keep domain-specific rules grounded in the project model: users, projects, allocations, milestones, assignments, time entries, and audit logging.
- Ask the owner for decisions that are theirs to make instead of assuming; owner decisions beat agent preferences.
- Never copy credentials or tokens from [TuesdayNotes.md](TuesdayNotes.md) into other files.
