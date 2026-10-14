## Plan: Create V5 from V4, then generate and run the Postgres schema

Decisions from the user:
- Milestone to employee is many-to-many (`milestone_assignments`).
- Replace teams with `User.manager_id`. Drop Team and Project Team.
- Add Project Allocation and Expense. Keep Time Entry. No deliverable tables.
- SQL goes in `db/schema.sql` and is run on local Postgres (database `postgres`, user `postgres`, password `postgres123`).

Sources: `Transcript_of_project.md` (kickoff notes) takes precedence over V4 where they conflict. `Workshop_Guidance.md` is the employer source.

### Phase 1: create `Object Structure V5.md` (leave `Object Structure V4.md` unchanged)
Start from the V4 content, apply the changes below, and save the result as the new file.
1. Remove Team (2.2) and Project Team (2.4). Remove team references from sections 1.1 and 1.2, from the `assign_team` audit action and from `User.team_id`. This reverses the earlier Project Team restore.
2. User: add `manager_id`, a foreign key to User. It is required for employees and null for admins and managers.
   - Employees see the projects they are allocated to.
   - Managers edit only their own employees' name and email.
   - Managers can see salary.
3. Project: statuses become `not_started`, `in_progress`, `completed`, `abandoned`. Archiving stays a flag. Keep `manager_id`, `budget` (planned) and `allocated_hours`.
4. Milestone:
   - `sequence_number`, unique per project.
   - `completion_criteria`.
   - Planned and actual dates, so slippage shows.
   - Statuses `not_started`, `in_progress`, `completed`.
   - Dates locked once completed.
5. Replace the 2.5.1 stub with Milestone Assignment: `milestone_id`, `user_id`, `assigned_at`, `detached_at`. An employee has no overlapping milestones. Employees are detached when the milestone completes.
6. New objects:
   - Milestone Dependency: `milestone_id`, `depends_on_milestone_id`, unique pair, no self-reference. This is an MVP requirement in the transcript.
   - Project Allocation: `project_id`, `user_id`, `planned_hours`, unique pair. The employee must share the project's manager. It also records who is on which project.
   - Expense: `project_id`, `amount`, `description`, `incurred_on`, `created_by`.
7. Time Entry is kept. Note that hours can also be calculated as employees x 8 hrs x working days. Actual cost is salary-derived hourly rate x hours plus expenses.
8. Audit Log: add `actor_role` and an optional `source`. Add the actions `login`, `login_failed`, `logout`, `assign_manager`, `assign_employee`. It stays append-only.
9. Update the decisions line in `AGENTS.md`.

### Phase 2: `db/schema.sql` (depends on Phase 1; generated from V5)
- Enums, and UUID primary keys with `gen_random_uuid()`.
- CHECK constraints:
  - `username` is 6 characters.
  - Employees require `manager_id`.
  - `end_date` is on or after `start_date`.
  - Hours are greater than 0.
  - Amounts are 0 or more.
- Unique pairs, and indexes on foreign keys.
- Circular project and milestone foreign keys added with `ALTER` after both tables exist.
- A trigger that blocks `UPDATE` and `DELETE` on the audit log.
- One view, `project_budget_summary`, for budget versus actual.
- Safe to re-run (`IF NOT EXISTS` and `DO` blocks).

### Phase 3: run it
- Run `PGPASSWORD=postgres123 psql -h localhost -U postgres -d postgres -f db/schema.sql`. Locally the database name is empty, so the default `postgres` database is used.
- Verify with `\dt` and a sample insert wrapped in a rollback.
- `Unitled (1).sql` and `database.dbml` stay in place but are superseded.

### Not included
- Deliverables table.
- Team features.
- Overlap-prevention trigger.
- Reopening milestones.
- RAG status.

### Open points
- Whether managers can see archived projects. Following "admin only".
- Whether hours are logged or only calculated. The user chose to keep logging.
