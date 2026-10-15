-- Demo data for presentations: 2 managers, 6 employees, 3 projects with teams,
-- milestones, assignments, time entries and expenses. All names are fake.
-- Also adds the superhero test users (Bruce Wayne admin; Jameson manages Parker, Kent manages
-- Prince) and 4 superhero projects. The superhero users' password is buzzsawben.
-- Users that already exist are left unchanged.
-- Every demo user's password is Demo1234! (no forced change, to keep the demo moving).
-- Requires an admin (db/seed-admin.sql) as the projects' creator. Safe to re-run.
-- Usage: PGPASSWORD=postgres123 psql -h localhost -U postgres -d postgres -f db/seed-demo.sql
-- AWS: copied into backend/dbsetup/ and run with the payload {"demo": true}.

INSERT INTO users (first_name, last_name, email, password_hash, role, job_title, salary, manager_id)
VALUES
    ('Maria', 'Lopez', 'maria.lopez@example.com', crypt('Demo1234!', gen_salt('bf')), 'manager', 'Infrastructure Manager', 145000, NULL),
    ('James', 'Chen', 'james.chen@example.com', crypt('Demo1234!', gen_salt('bf')), 'manager', 'Engineering Manager', 150000, NULL),
    ('Bruce', 'Wayne', 'DefinitelyNotBatMan@example.com', crypt('buzzsawben', gen_salt('bf')), 'admin', NULL, NULL, NULL),
    ('John', 'Jameson', 'John.Jameson@example.com', crypt('buzzsawben', gen_salt('bf')), 'manager', 'Daily Bugle CEO', 123456, NULL),
    ('Clark', 'Kent', 'DefinitelyNotSuperMan@example.com', crypt('buzzsawben', gen_salt('bf')), 'manager', 'Reporter', NULL, NULL)
ON CONFLICT DO NOTHING;

INSERT INTO users (first_name, last_name, email, password_hash, role, job_title, salary, manager_id)
SELECT v.first_name, v.last_name, v.email,
       crypt(CASE WHEN v.email LIKE 'DefinitelyNot%' THEN 'buzzsawben' ELSE 'Demo1234!' END, gen_salt('bf')), 'employee',
       v.job_title, v.salary, m.id
FROM (VALUES
    ('Alex', 'Smith', 'alex.smith@example.com', 'Systems Engineer', 98000, 'maria.lopez@example.com'),
    ('Priya', 'Kumar', 'priya.kumar@example.com', 'Network Engineer', 102000, 'maria.lopez@example.com'),
    ('David', 'Okafor', 'david.okafor@example.com', 'Data Center Technician', 72000, 'maria.lopez@example.com'),
    ('Sara', 'Novak', 'sara.novak@example.com', 'Software Engineer', 118000, 'james.chen@example.com'),
    ('Tom', 'Brown', 'tom.brown@example.com', 'QA Analyst', 85000, 'james.chen@example.com'),
    ('Lily', 'Wong', 'lily.wong@example.com', 'Business Analyst', 92000, 'james.chen@example.com'),
    ('Peter', 'Parker', 'DefinitelyNotSpiderMan@example.com', 'Reporter for the Daily Bugle', 0.01, 'John.Jameson@example.com'),
    ('Diana', 'Prince', 'DefinitelyNotWonderWoman@example.com', 'Curator', NULL, 'DefinitelyNotSuperMan@example.com')
) AS v(first_name, last_name, email, job_title, salary, manager)
JOIN users m ON lower(m.email) = lower(v.manager)
ON CONFLICT DO NOTHING;

INSERT INTO projects (name, description, start_date, end_date, budget, manager_id, status, created_by)
SELECT v.name, v.description, v.start_date::date, v.end_date::date, v.budget, m.id,
       v.status::project_status,
       (SELECT id FROM users WHERE role = 'admin' AND is_archived = false ORDER BY created_at LIMIT 1)
FROM (VALUES
    ('Server Decommission', 'Retire 300 legacy servers in three waves of 100.',
     '2026-07-01', '2027-06-30', 250000, 'maria.lopez@example.com', 'in_progress'),
    ('Network Refresh', 'Replace end-of-life core switches in both data centers.',
     '2026-09-01', '2027-03-31', 120000, 'maria.lopez@example.com', 'not_started'),
    ('Payroll Portal Upgrade', 'Move the payroll portal to the new web framework.',
     '2026-06-01', '2027-01-31', 180000, 'james.chen@example.com', 'in_progress'),
    ('Take Photos of Spider-Man', 'Get clear front-page photos of the wall-crawling menace.',
     '2026-08-01', '2026-12-31', 5000, 'John.Jameson@example.com', 'in_progress'),
    ('Expose Spider-Man as a Menace', 'A week-long Daily Bugle exposé, with photos, proving Spider-Man is a public threat.',
     '2026-11-01', '2027-02-28', 12000, 'John.Jameson@example.com', 'not_started'),
    ('Interview Wonder Woman', 'Land the Daily Planet''s first sit-down interview with the Amazon princess.',
     '2026-09-01', '2026-11-30', 3000, 'DefinitelyNotSuperMan@example.com', 'in_progress'),
    ('Themysciran Antiquities Exhibit', 'Catalogue and display ancient Greek artefacts of suspiciously recent origin.',
     '2026-10-01', '2027-04-30', 40000, 'DefinitelyNotSuperMan@example.com', 'not_started')
) AS v(name, description, start_date, end_date, budget, manager, status)
JOIN users m ON lower(m.email) = lower(v.manager)
ON CONFLICT DO NOTHING;

INSERT INTO project_allocations (project_id, user_id, allocated_hours, allocated_by)
SELECT p.id, u.id, v.hours, p.manager_id
FROM (VALUES
    ('Server Decommission', 'alex.smith@example.com', 800),
    ('Server Decommission', 'david.okafor@example.com', 1200),
    ('Server Decommission', 'priya.kumar@example.com', 300),
    ('Network Refresh', 'priya.kumar@example.com', 600),
    ('Payroll Portal Upgrade', 'sara.novak@example.com', 900),
    ('Payroll Portal Upgrade', 'tom.brown@example.com', 500),
    ('Payroll Portal Upgrade', 'lily.wong@example.com', 400),
    ('Take Photos of Spider-Man', 'DefinitelyNotSpiderMan@example.com', 400),
    ('Expose Spider-Man as a Menace', 'DefinitelyNotSpiderMan@example.com', 250),
    ('Interview Wonder Woman', 'DefinitelyNotWonderWoman@example.com', 40),
    ('Themysciran Antiquities Exhibit', 'DefinitelyNotWonderWoman@example.com', 600)
) AS v(project, email, hours)
JOIN projects p ON p.name = v.project
JOIN users u ON lower(u.email) = lower(v.email)
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
     '2026-08-01', '2026-12-15', '2026-08-03', NULL, 'in_progress'),
    ('Take Photos of Spider-Man', 1, 'Web-slinging action shots', 'Prove Spider-Man can be photographed at all',
     'Ten usable photos of Spider-Man swinging over Manhattan', 'Jameson buys at least one photo (at a lowball price)',
     '2026-08-01', '2026-09-15', '2026-08-01', '2026-09-12', 'completed'),
    ('Take Photos of Spider-Man', 2, 'Spider-Man fighting a villain', 'Get the shot that sells papers',
     'Front-page photo of Spider-Man mid-fight', 'Photo runs above the fold',
     '2026-09-16', '2026-11-15', '2026-09-16', NULL, 'in_progress'),
    ('Take Photos of Spider-Man', 3, 'Spider-Man unmasked', 'Reveal who is under the mask',
     'One clear photo of Spider-Man''s face', 'Identity confirmed (Parker insists this is impossible)',
     '2026-11-16', '2026-12-31', NULL, NULL, 'not_started'),
    ('Expose Spider-Man as a Menace', 1, 'Gather incriminating photos', 'Find Spider-Man near property damage',
     'Photo dossier', 'Jameson says "Menace!" at least five times',
     '2026-11-01', '2026-12-31', NULL, NULL, 'not_started'),
    ('Interview Wonder Woman', 1, 'Secure the interview', 'Get a yes from Wonder Woman''s people',
     'Confirmed date and location', 'Interview booked',
     '2026-09-01', '2026-09-30', '2026-09-01', '2026-09-24', 'completed'),
    ('Interview Wonder Woman', 2, 'Write the article', 'File the story without revealing anyone''s secret identity',
     'Two-page feature', 'Perry White approves the copy',
     '2026-10-01', '2026-11-30', '2026-10-01', NULL, 'in_progress'),
    ('Themysciran Antiquities Exhibit', 1, 'Catalogue the artefacts', 'Record every item and its (official) origin',
     'Artefact catalogue', 'Every item has a plausible provenance',
     '2026-10-01', '2026-12-31', NULL, NULL, 'not_started')
) AS v(project, seq, name, goal, deliverables, criteria, start_date, end_date, actual_start, actual_end, status)
JOIN projects p ON p.name = v.project
ON CONFLICT DO NOTHING;

INSERT INTO milestone_assignments (milestone_id, user_id, assigned_by, detached_at)
SELECT m.id, u.id, p.manager_id, CASE WHEN m.status = 'completed' THEN m.completed_at END
FROM (VALUES
    ('Server Decommission', 1, 'alex.smith@example.com'),
    ('Server Decommission', 1, 'david.okafor@example.com'),
    ('Server Decommission', 2, 'alex.smith@example.com'),
    ('Server Decommission', 2, 'david.okafor@example.com'),
    ('Server Decommission', 2, 'priya.kumar@example.com'),
    ('Payroll Portal Upgrade', 1, 'lily.wong@example.com'),
    ('Payroll Portal Upgrade', 2, 'sara.novak@example.com'),
    ('Payroll Portal Upgrade', 2, 'tom.brown@example.com'),
    ('Take Photos of Spider-Man', 1, 'DefinitelyNotSpiderMan@example.com'),
    ('Take Photos of Spider-Man', 2, 'DefinitelyNotSpiderMan@example.com'),
    ('Take Photos of Spider-Man', 3, 'DefinitelyNotSpiderMan@example.com'),
    ('Interview Wonder Woman', 1, 'DefinitelyNotWonderWoman@example.com'),
    ('Interview Wonder Woman', 2, 'DefinitelyNotWonderWoman@example.com'),
    ('Themysciran Antiquities Exhibit', 1, 'DefinitelyNotWonderWoman@example.com')
) AS v(project, seq, email)
JOIN projects p ON p.name = v.project
JOIN milestones m ON m.project_id = p.id AND m.sequence_number = v.seq
JOIN users u ON lower(u.email) = lower(v.email)
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
    ('Payroll Portal Upgrade', 900.00, 'Usability testing sessions', '2026-09-15'),
    ('Take Photos of Spider-Man', 850.00, 'Replacement camera (previous one webbed to a wall)', '2026-08-20'),
    ('Take Photos of Spider-Man', 45.00, 'Film rolls', '2026-09-02'),
    ('Take Photos of Spider-Man', 120.00, 'Web-shooter cartridges (filed as "lens cleaner")', '2026-10-03'),
    ('Interview Wonder Woman', 12.50, 'Spare pair of glasses', '2026-09-18'),
    ('Interview Wonder Woman', 64.00, 'Lunch at the interview', '2026-10-07')
) AS v(project, amount, description, incurred_on)
JOIN projects p ON p.name = v.project
WHERE NOT EXISTS (SELECT 1 FROM expenses e WHERE e.project_id = p.id);
