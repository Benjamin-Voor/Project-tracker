CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE user_role AS ENUM ('admin', 'manager', 'employee');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'project_status') THEN
        CREATE TYPE project_status AS ENUM ('not_started', 'in_progress', 'completed', 'abandoned');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'milestone_status') THEN
        CREATE TYPE milestone_status AS ENUM ('not_started', 'in_progress', 'completed');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'audit_action') THEN
        CREATE TYPE audit_action AS ENUM (
            'create',
            'update',
            'archive',
            'restore',
            'assign_role',
            'assign_manager',
            'assign_employee',
            'complete',
            'abandon',
            'login',
            'login_failed',
            'logout'
        );
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(6) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL,
    password_hash TEXT NOT NULL,
    role user_role NOT NULL,
    job_title VARCHAR(100),
    salary NUMERIC(12,2),
    profile_picture_url TEXT,
    manager_id UUID,
    must_change_password BOOLEAN NOT NULL DEFAULT false,
    is_archived BOOLEAN NOT NULL DEFAULT false,
    archived_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT users_username_length_chk CHECK (char_length(username) = 6),
    CONSTRAINT users_email_unique UNIQUE (email),
    CONSTRAINT users_username_unique UNIQUE (username),
    CONSTRAINT users_employee_manager_chk CHECK (role <> 'employee' OR manager_id IS NOT NULL)
);

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS manager_id UUID,
    ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    allocated_hours INTEGER NOT NULL,
    budget NUMERIC(14,2),
    manager_id UUID NOT NULL,
    status project_status NOT NULL DEFAULT 'not_started',
    is_archived BOOLEAN NOT NULL DEFAULT false,
    archived_at TIMESTAMPTZ,
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT projects_name_unique UNIQUE (name),
    CONSTRAINT projects_date_range_chk CHECK (end_date >= start_date),
    CONSTRAINT projects_budget_chk CHECK (budget IS NULL OR budget >= 0),
    CONSTRAINT projects_allocated_hours_chk CHECK (allocated_hours >= 0)
);

ALTER TABLE projects
    ADD COLUMN IF NOT EXISTS allocated_hours INTEGER,
    ADD COLUMN IF NOT EXISTS budget NUMERIC(14,2),
    ADD COLUMN IF NOT EXISTS manager_id UUID,
    ADD COLUMN IF NOT EXISTS status project_status,
    ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS created_by UUID,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE TABLE IF NOT EXISTS project_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL,
    user_id UUID NOT NULL,
    planned_hours NUMERIC(10,2) NOT NULL,
    allocated_by UUID,
    allocated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT project_allocations_pair_unique UNIQUE (project_id, user_id),
    CONSTRAINT project_allocations_planned_hours_chk CHECK (planned_hours >= 0)
);

ALTER TABLE project_allocations
    ADD COLUMN IF NOT EXISTS project_id UUID,
    ADD COLUMN IF NOT EXISTS user_id UUID,
    ADD COLUMN IF NOT EXISTS planned_hours NUMERIC(10,2),
    ADD COLUMN IF NOT EXISTS allocated_by UUID,
    ADD COLUMN IF NOT EXISTS allocated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE TABLE IF NOT EXISTS milestones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL,
    sequence_number INTEGER NOT NULL,
    name VARCHAR(255) NOT NULL,
    goal TEXT,
    deliverables TEXT,
    completion_criteria TEXT,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    actual_start_date DATE,
    actual_end_date DATE,
    status milestone_status NOT NULL DEFAULT 'not_started',
    completed_at TIMESTAMPTZ,
    is_archived BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT milestones_project_sequence_unique UNIQUE (project_id, sequence_number),
    CONSTRAINT milestones_date_range_chk CHECK (end_date >= start_date)
);

ALTER TABLE milestones
    ADD COLUMN IF NOT EXISTS project_id UUID,
    ADD COLUMN IF NOT EXISTS sequence_number INTEGER,
    ADD COLUMN IF NOT EXISTS name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS goal TEXT,
    ADD COLUMN IF NOT EXISTS deliverables TEXT,
    ADD COLUMN IF NOT EXISTS completion_criteria TEXT,
    ADD COLUMN IF NOT EXISTS start_date DATE,
    ADD COLUMN IF NOT EXISTS end_date DATE,
    ADD COLUMN IF NOT EXISTS actual_start_date DATE,
    ADD COLUMN IF NOT EXISTS actual_end_date DATE,
    ADD COLUMN IF NOT EXISTS status milestone_status,
    ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS milestone_dependencies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    milestone_id UUID NOT NULL,
    depends_on_milestone_id UUID NOT NULL,
    CONSTRAINT milestone_dependencies_pair_unique UNIQUE (milestone_id, depends_on_milestone_id),
    CONSTRAINT milestone_dependencies_no_self_reference_chk CHECK (milestone_id <> depends_on_milestone_id)
);

ALTER TABLE milestone_dependencies
    ADD COLUMN IF NOT EXISTS milestone_id UUID,
    ADD COLUMN IF NOT EXISTS depends_on_milestone_id UUID;

CREATE TABLE IF NOT EXISTS milestone_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    milestone_id UUID NOT NULL,
    user_id UUID NOT NULL,
    assigned_by UUID,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    detached_at TIMESTAMPTZ,
    CONSTRAINT milestone_assignments_pair_unique UNIQUE (milestone_id, user_id)
);

ALTER TABLE milestone_assignments
    ADD COLUMN IF NOT EXISTS milestone_id UUID,
    ADD COLUMN IF NOT EXISTS user_id UUID,
    ADD COLUMN IF NOT EXISTS assigned_by UUID,
    ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS detached_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS time_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL,
    milestone_id UUID,
    user_id UUID NOT NULL,
    work_date DATE NOT NULL,
    hours NUMERIC(6,2) NOT NULL,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT time_entries_hours_chk CHECK (hours > 0)
);

ALTER TABLE time_entries
    ADD COLUMN IF NOT EXISTS project_id UUID,
    ADD COLUMN IF NOT EXISTS milestone_id UUID,
    ADD COLUMN IF NOT EXISTS user_id UUID,
    ADD COLUMN IF NOT EXISTS work_date DATE,
    ADD COLUMN IF NOT EXISTS hours NUMERIC(6,2),
    ADD COLUMN IF NOT EXISTS note TEXT,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE TABLE IF NOT EXISTS expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL,
    amount NUMERIC(12,2) NOT NULL,
    description TEXT NOT NULL,
    incurred_on DATE NOT NULL,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT expenses_amount_chk CHECK (amount >= 0)
);

ALTER TABLE expenses
    ADD COLUMN IF NOT EXISTS project_id UUID,
    ADD COLUMN IF NOT EXISTS amount NUMERIC(12,2),
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS incurred_on DATE,
    ADD COLUMN IF NOT EXISTS created_by UUID,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE TABLE IF NOT EXISTS audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID,
    actor_role user_role,
    action audit_action NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id UUID,
    changes JSONB,
    source VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'users_manager_fk'
    ) THEN
        ALTER TABLE users
            ADD CONSTRAINT users_manager_fk
            FOREIGN KEY (manager_id) REFERENCES users(id);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'projects_manager_fk'
    ) THEN
        ALTER TABLE projects
            ADD CONSTRAINT projects_manager_fk
            FOREIGN KEY (manager_id) REFERENCES users(id);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'projects_created_by_fk'
    ) THEN
        ALTER TABLE projects
            ADD CONSTRAINT projects_created_by_fk
            FOREIGN KEY (created_by) REFERENCES users(id);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'project_allocations_project_fk'
    ) THEN
        ALTER TABLE project_allocations
            ADD CONSTRAINT project_allocations_project_fk
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'project_allocations_user_fk'
    ) THEN
        ALTER TABLE project_allocations
            ADD CONSTRAINT project_allocations_user_fk
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'project_allocations_allocated_by_fk'
    ) THEN
        ALTER TABLE project_allocations
            ADD CONSTRAINT project_allocations_allocated_by_fk
            FOREIGN KEY (allocated_by) REFERENCES users(id);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'milestones_project_fk'
    ) THEN
        ALTER TABLE milestones
            ADD CONSTRAINT milestones_project_fk
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'milestone_dependencies_milestone_fk'
    ) THEN
        ALTER TABLE milestone_dependencies
            ADD CONSTRAINT milestone_dependencies_milestone_fk
            FOREIGN KEY (milestone_id) REFERENCES milestones(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'milestone_dependencies_depends_on_fk'
    ) THEN
        ALTER TABLE milestone_dependencies
            ADD CONSTRAINT milestone_dependencies_depends_on_fk
            FOREIGN KEY (depends_on_milestone_id) REFERENCES milestones(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'milestone_assignments_milestone_fk'
    ) THEN
        ALTER TABLE milestone_assignments
            ADD CONSTRAINT milestone_assignments_milestone_fk
            FOREIGN KEY (milestone_id) REFERENCES milestones(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'milestone_assignments_user_fk'
    ) THEN
        ALTER TABLE milestone_assignments
            ADD CONSTRAINT milestone_assignments_user_fk
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'milestone_assignments_assigned_by_fk'
    ) THEN
        ALTER TABLE milestone_assignments
            ADD CONSTRAINT milestone_assignments_assigned_by_fk
            FOREIGN KEY (assigned_by) REFERENCES users(id);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'time_entries_project_fk'
    ) THEN
        ALTER TABLE time_entries
            ADD CONSTRAINT time_entries_project_fk
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'time_entries_milestone_fk'
    ) THEN
        ALTER TABLE time_entries
            ADD CONSTRAINT time_entries_milestone_fk
            FOREIGN KEY (milestone_id) REFERENCES milestones(id) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'time_entries_user_fk'
    ) THEN
        ALTER TABLE time_entries
            ADD CONSTRAINT time_entries_user_fk
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'expenses_project_fk'
    ) THEN
        ALTER TABLE expenses
            ADD CONSTRAINT expenses_project_fk
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'expenses_created_by_fk'
    ) THEN
        ALTER TABLE expenses
            ADD CONSTRAINT expenses_created_by_fk
            FOREIGN KEY (created_by) REFERENCES users(id);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'audit_log_actor_fk'
    ) THEN
        ALTER TABLE audit_log
            ADD CONSTRAINT audit_log_actor_fk
            FOREIGN KEY (actor_id) REFERENCES users(id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_users_manager_id ON users(manager_id);
CREATE INDEX IF NOT EXISTS idx_projects_manager_id ON projects(manager_id);
CREATE INDEX IF NOT EXISTS idx_projects_created_by ON projects(created_by);
CREATE INDEX IF NOT EXISTS idx_project_allocations_project_id ON project_allocations(project_id);
CREATE INDEX IF NOT EXISTS idx_project_allocations_user_id ON project_allocations(user_id);
CREATE INDEX IF NOT EXISTS idx_milestones_project_id ON milestones(project_id);
CREATE INDEX IF NOT EXISTS idx_milestone_dependencies_milestone_id ON milestone_dependencies(milestone_id);
CREATE INDEX IF NOT EXISTS idx_milestone_dependencies_depends_on_milestone_id ON milestone_dependencies(depends_on_milestone_id);
CREATE INDEX IF NOT EXISTS idx_milestone_assignments_milestone_id ON milestone_assignments(milestone_id);
CREATE INDEX IF NOT EXISTS idx_milestone_assignments_user_id ON milestone_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_project_id ON time_entries(project_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_milestone_id ON time_entries(milestone_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_user_id ON time_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_expenses_project_id ON expenses(project_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor_id ON audit_log(actor_id);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_set_updated_at ON users;
CREATE TRIGGER users_set_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS projects_set_updated_at ON projects;
CREATE TRIGGER projects_set_updated_at
    BEFORE UPDATE ON projects
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION validate_project_allocation()
RETURNS TRIGGER AS $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM users u
        JOIN projects p ON p.id = NEW.project_id
        WHERE u.id = NEW.user_id
          AND u.manager_id IS DISTINCT FROM p.manager_id
    ) THEN
        RAISE EXCEPTION 'Employee manager must match the project manager';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS project_allocations_validate_manager ON project_allocations;
CREATE TRIGGER project_allocations_validate_manager
    BEFORE INSERT OR UPDATE OF project_id, user_id ON project_allocations
    FOR EACH ROW
    EXECUTE FUNCTION validate_project_allocation();

CREATE OR REPLACE FUNCTION validate_milestone_assignment()
RETURNS TRIGGER AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM project_allocations pa
        JOIN milestones m ON m.id = NEW.milestone_id
        WHERE pa.project_id = m.project_id
          AND pa.user_id = NEW.user_id
    ) THEN
        RAISE EXCEPTION 'Milestone assignee must be allocated to the milestone project';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS milestone_assignments_validate_allocation ON milestone_assignments;
CREATE TRIGGER milestone_assignments_validate_allocation
    BEFORE INSERT OR UPDATE OF milestone_id, user_id ON milestone_assignments
    FOR EACH ROW
    EXECUTE FUNCTION validate_milestone_assignment();

CREATE OR REPLACE FUNCTION validate_milestone_dependency()
RETURNS TRIGGER AS $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM milestones m1
        JOIN milestones m2 ON m2.id = NEW.depends_on_milestone_id
        WHERE m1.id = NEW.milestone_id
          AND m2.project_id <> m1.project_id
    ) THEN
        RAISE EXCEPTION 'Dependency milestones must belong to the same project';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS milestone_dependencies_validate_project ON milestone_dependencies;
CREATE TRIGGER milestone_dependencies_validate_project
    BEFORE INSERT OR UPDATE OF milestone_id, depends_on_milestone_id ON milestone_dependencies
    FOR EACH ROW
    EXECUTE FUNCTION validate_milestone_dependency();

CREATE OR REPLACE FUNCTION block_audit_log_changes()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Audit log is append-only and cannot be updated or deleted';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_log_block_updates ON audit_log;
CREATE TRIGGER audit_log_block_updates
    BEFORE UPDATE OR DELETE ON audit_log
    FOR EACH ROW
    EXECUTE FUNCTION block_audit_log_changes();

CREATE OR REPLACE VIEW project_budget_summary AS
SELECT
    p.id AS project_id,
    p.name AS project_name,
    p.budget,
    COALESCE(s.salary_cost, 0) AS salary_cost,
    COALESCE(e.expense_cost, 0) AS expense_cost,
    COALESCE(s.salary_cost, 0) + COALESCE(e.expense_cost, 0) AS actual_cost,
    p.budget - (COALESCE(s.salary_cost, 0) + COALESCE(e.expense_cost, 0)) AS variance
FROM projects p
LEFT JOIN (
    SELECT
        te.project_id,
        SUM(te.hours * (u.salary / 2080.0)) AS salary_cost
    FROM time_entries te
    JOIN users u ON u.id = te.user_id
    GROUP BY te.project_id
) s ON s.project_id = p.id
LEFT JOIN (
    SELECT
        project_id,
        SUM(amount) AS expense_cost
    FROM expenses
    GROUP BY project_id
) e ON e.project_id = p.id;
