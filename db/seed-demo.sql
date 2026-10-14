-- Demo data for presentations: 2 managers, 6 employees, 3 projects with teams,
-- milestones, assignments, time entries and expenses. All names are fake.
-- Every demo user's password is Demo1234! (no forced change, to keep the demo moving).
-- Requires an admin (db/seed-admin.sql) as the projects' creator. Safe to re-run.
-- Usage: PGPASSWORD=postgres123 psql -h localhost -U postgres -d postgres -f db/seed-demo.sql
-- AWS: copied into backend/dbsetup/ and run with the payload {"demo": true}.

INSERT INTO users (username, first_name, last_name, email, password_hash, role, job_title, salary, manager_id)
VALUES
    ('mlopez', 'Maria', 'Lopez', 'maria.lopez@example.com', crypt('Demo1234!', gen_salt('bf')), 'manager', 'Infrastructure Manager', 145000, NULL),
    ('jchen1', 'James', 'Chen', 'james.chen@example.com', crypt('Demo1234!', gen_salt('bf')), 'manager', 'Engineering Manager', 150000, NULL)
ON CONFLICT DO NOTHING;

INSERT INTO users (username, first_name, last_name, email, password_hash, role, job_title, salary, manager_id)
SELECT v.username, v.first_name, v.last_name, v.email, crypt('Demo1234!', gen_salt('bf')), 'employee',
       v.job_title, v.salary, m.id
FROM (VALUES
    ('asmith', 'Alex', 'Smith', 'alex.smith@example.com', 'Systems Engineer', 98000, 'mlopez'),
    ('pkumar', 'Priya', 'Kumar', 'priya.kumar@example.com', 'Network Engineer', 102000, 'mlopez'),
    ('dokafo', 'David', 'Okafor', 'david.okafor@example.com', 'Data Center Technician', 72000, 'mlopez'),
    ('snovak', 'Sara', 'Novak', 'sara.novak@example.com', 'Software Engineer', 118000, 'jchen1'),
    ('tbrown', 'Tom', 'Brown', 'tom.brown@example.com', 'QA Analyst', 85000, 'jchen1'),
    ('lwongx', 'Lily', 'Wong', 'lily.wong@example.com', 'Business Analyst', 92000, 'jchen1')
) AS v(username, first_name, last_name, email, job_title, salary, manager)
JOIN users m ON m.username = v.manager
ON CONFLICT DO NOTHING;

INSERT INTO projects (name, description, start_date, end_date, allocated_hours, budget, manager_id, status, created_by)
SELECT v.name, v.description, v.start_date::date, v.end_date::date, v.hours, v.budget, m.id,
       v.status::project_status,
       (SELECT id FROM users WHERE role = 'admin' AND is_archived = false ORDER BY created_at LIMIT 1)
FROM (VALUES
    ('Server Decommission', 'Retire 300 legacy servers in three waves of 100.',
     '2026-07-01', '2027-06-30', 4000, 250000, 'mlopez', 'in_progress'),
    ('Network Refresh', 'Replace end-of-life core switches in both data centers.',
     '2026-09-01', '2027-03-31', 1500, 120000, 'mlopez', 'not_started'),
    ('Payroll Portal Upgrade', 'Move the payroll portal to the new web framework.',
     '2026-06-01', '2027-01-31', 2500, 180000, 'jchen1', 'in_progress')
) AS v(name, description, start_date, end_date, hours, budget, manager, status)
JOIN users m ON m.username = v.manager
ON CONFLICT DO NOTHING;

INSERT INTO project_allocations (project_id, user_id, planned_hours, allocated_by)
SELECT p.id, u.id, v.hours, p.manager_id
FROM (VALUES
    ('Server Decommission', 'asmith', 800),
    ('Server Decommission', 'dokafo', 1200),
    ('Server Decommission', 'pkumar', 300),
    ('Network Refresh', 'pkumar', 600),
    ('Payroll Portal Upgrade', 'snovak', 900),
    ('Payroll Portal Upgrade', 'tbrown', 500),
    ('Payroll Portal Upgrade', 'lwongx', 400)
) AS v(project, username, hours)
JOIN projects p ON p.name = v.project
JOIN users u ON u.username = v.username
ON CONFLICT DO NOTHING;

INSERT INTO milestones (project_id, sequence_number, name, goal, deliverables, completion_criteria,
                        start_date, end_date, actual_start_date, actual_end_date, status, completed_at)
SELECT p.id, v.seq, v.name, v.goal, v.deliverables, v.criteria, v.start_date::date, v.end_date::date,
       v.actual_start::date, v.actual_end::date, v.status::milestone_status,
       CASE WHEN v.status = 'completed' THEN v.actual_end::timestamptz END
FROM (VALUES
    ('Server Decommission', 1, 'Decommission first 100 servers', 'Retire the oldest rack row',
     'Wiped drives, asset tags returned', 'All 100 servers powered off and removed from inventory',
     '2026-07-01', '2026-09-30', '2026-07-01', '2026-09-26', 'completed'),
    ('Server Decommission', 2, 'Decommission next 100 servers', 'Retire application tier servers',
     'Migration sign-off per app, wiped drives', 'All 100 servers powered off and removed from inventory',
     '2026-10-01', '2026-12-31', '2026-10-01', NULL, 'in_progress'),
    ('Server Decommission', 3, 'Decommission final 100 servers', 'Retire database tier servers',
     'Data archive confirmation, wiped drives', 'Inventory shows zero legacy servers',
     '2027-01-04', '2027-06-30', NULL, NULL, 'not_started'),
    ('Network Refresh', 1, 'Site survey and design', 'Agree the target topology',
     'Design document', 'Design approved by architecture board',
     '2026-09-01', '2026-11-30', NULL, NULL, 'not_started'),
    ('Payroll Portal Upgrade', 1, 'Requirements and design', 'Capture payroll team needs',
     'Requirements doc, UI mockups', 'Sign-off from payroll lead',
     '2026-06-01', '2026-07-31', '2026-06-01', '2026-07-29', 'completed'),
    ('Payroll Portal Upgrade', 2, 'Build and test', 'Rebuild the portal screens',
     'Working portal in staging, test report', 'All critical tests pass in staging',
     '2026-08-01', '2026-12-15', '2026-08-03', NULL, 'in_progress')
) AS v(project, seq, name, goal, deliverables, criteria, start_date, end_date, actual_start, actual_end, status)
JOIN projects p ON p.name = v.project
ON CONFLICT DO NOTHING;

INSERT INTO milestone_assignments (milestone_id, user_id, assigned_by, detached_at)
SELECT m.id, u.id, p.manager_id, CASE WHEN m.status = 'completed' THEN m.completed_at END
FROM (VALUES
    ('Server Decommission', 1, 'asmith'),
    ('Server Decommission', 1, 'dokafo'),
    ('Server Decommission', 2, 'asmith'),
    ('Server Decommission', 2, 'dokafo'),
    ('Server Decommission', 2, 'pkumar'),
    ('Payroll Portal Upgrade', 1, 'lwongx'),
    ('Payroll Portal Upgrade', 2, 'snovak'),
    ('Payroll Portal Upgrade', 2, 'tbrown')
) AS v(project, seq, username)
JOIN projects p ON p.name = v.project
JOIN milestones m ON m.project_id = p.id AND m.sequence_number = v.seq
JOIN users u ON u.username = v.username
ON CONFLICT DO NOTHING;

-- Time entries: weekly 8-hour days for each assignee across their milestone, up to today.
INSERT INTO time_entries (project_id, milestone_id, user_id, work_date, hours, note)
SELECT m.project_id, m.id, ma.user_id, d::date, 8, 'Planned work'
FROM milestone_assignments ma
JOIN milestones m ON m.id = ma.milestone_id
CROSS JOIN LATERAL generate_series(
    COALESCE(m.actual_start_date, m.start_date),
    LEAST(COALESCE(m.actual_end_date, CURRENT_DATE - 1), CURRENT_DATE - 1),
    interval '7 days') AS d
WHERE m.actual_start_date IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM time_entries te WHERE te.project_id = m.project_id);

INSERT INTO expenses (project_id, amount, description, incurred_on, created_by)
SELECT p.id, v.amount, v.description, v.incurred_on::date, p.manager_id
FROM (VALUES
    ('Server Decommission', 4800.00, 'Certified drive destruction (wave 1)', '2026-09-20'),
    ('Server Decommission', 1250.00, 'Recycling pickup', '2026-09-28'),
    ('Server Decommission', 3600.00, 'Temporary rack rental', '2026-10-05'),
    ('Payroll Portal Upgrade', 2400.00, 'UI component library licence', '2026-08-10'),
    ('Payroll Portal Upgrade', 900.00, 'Usability testing sessions', '2026-09-15')
) AS v(project, amount, description, incurred_on)
JOIN projects p ON p.name = v.project
WHERE NOT EXISTS (SELECT 1 FROM expenses e WHERE e.project_id = p.id);
