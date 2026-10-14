-- Seed the first admin with a one-time password; they must change it at first login.
-- Usage (prints the password once):
--   PW=$(openssl rand -base64 12); echo "temporary password: $PW"
--   PGPASSWORD=postgres123 psql -h localhost -U postgres -d postgres -v password="$PW" -f db/seed-admin.sql
-- Re-running does nothing if username "admin1" or the email already exists.

INSERT INTO users (username, first_name, last_name, email, password_hash, role, must_change_password)
VALUES ('admin1', 'System', 'Admin', 'admin@example.com',
        crypt(:'password', gen_salt('bf')), 'admin', true)
ON CONFLICT DO NOTHING;

