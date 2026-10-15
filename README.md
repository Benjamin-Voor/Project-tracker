# Project Tracker

A project-tracking web app built during the Citi coding workshop. Admins,
managers and employees use it to plan projects, assign people, track
milestones on a Gantt chart, log time, and watch budgets and delivery risk.

This repository is a fork of
[citi/coding-workshop-participant](https://github.com/citi/coding-workshop-participant),
the workshop's starter repo. The scripts, Terraform and workshop guides come
from that repo; the application (frontend, backend services and database) was
built here.

## Features

* **Sign-in and roles:** email and password login, a forced password change
  on first login, and role-based access for admins, managers and employees.
* **Projects:** create, edit, archive and restore projects; allocate employees
  with planned hours; total hours are calculated from logged time.
* **Milestones:** create milestones, assign employees, set dependencies
  between milestones, and drag planned dates on a Gantt chart.
* **Time and budget:** employees log hours; managers record expenses and see
  spend (logged hours × salary rate + expenses) against budget.
* **Dashboard:** late and at-risk projects, and employee workload with
  over-allocation flags.
* **Users:** admins create and manage users and read the audit log; managers
  manage their own team; everyone can edit their own profile.
* **Search and filters** on projects, users and milestones.
* **Mobile layout:** tables, dialogs and the app bar adapt to phone screens.
* **Audit log:** changes, logins and logouts are recorded in an append-only
  log. Nothing is hard-deleted; records are archived instead.

## Roles

| Role | Can do |
| --- | --- |
| Admin | Everything a manager can, plus create users and projects, restore archived projects, view archived projects and the audit log |
| Manager | Everything an employee can, plus edit their projects and budgets, create milestones, assign employees, and manage their team |
| Employee | View assigned projects, log time, edit their own name and email |

## Tech stack

* **Frontend:** React, Material UI, React Responsive, frappe-gantt
  ([frontend/](./frontend/))
* **Backend:** Python AWS Lambda services for auth, users and projects
  ([backend/](./backend/))
* **Database:** PostgreSQL locally, Aurora PostgreSQL on AWS
  ([db/schema.sql](./db/schema.sql))
* **Infrastructure:** Terraform ([infra/](./infra/)) and shell scripts
  ([bin/](./bin/)), deployed to LocalStack or AWS (S3, CloudFront, Lambda,
  Aurora)

## Getting started

On a fresh Ubuntu machine:

```sh
./bin/setup-environment.sh   # install tools; starts PostgreSQL on localhost:5432
```

Create the database and seed data:

```sh
export PGPASSWORD=postgres123
psql -h localhost -U postgres -d postgres -f db/schema.sql

# First admin (admin@example.com) with a one-time password
PW=$(openssl rand -base64 12); echo "temporary password: $PW"
psql -h localhost -U postgres -d postgres -v password="$PW" -f db/seed-admin.sql

# Optional demo data
psql -h localhost -U postgres -d postgres -f db/seed-demo.sql
```

Start the app locally:

```sh
./bin/start-dev.sh
```

Restart `start-dev.sh` after deploying backend changes locally. The local
API proxy only reads the Lambda URLs at startup, so API calls fail until it
restarts.

The demo data has superhero-themed users and projects covering every project
status, plus late and at-risk examples. Passwords for the seeded accounts are
in the seed files.

## Deploying

```sh
./bin/deploy-backend.sh aws    # or: local
./bin/deploy-frontend.sh aws   # or: local
```

On AWS the database sits inside a private VPC, so the `dbsetup` Lambda
applies the schema and seeds data. See [bin/README.md](./bin/README.md) for
details.

## Repository layout

* [frontend/](./frontend/): React app
* [backend/](./backend/): Lambda services (`auth`, `users`, `projects`,
  `dbsetup`)
* [db/](./db/): schema and seed scripts
* [infra/](./infra/): Terraform
* [bin/](./bin/): setup, local dev and deployment scripts
* [docs/](./docs/): workshop guides from the original repo

## Workshop background

The workshop asked participants to build a stand-alone web app with
authentication, role-based access, CRUD operations, search and filtering, and a
responsive layout, using React, Material UI, Python and PostgreSQL, deployed to
AWS serverless. The original brief and role guides are in
[docs/README.md](./docs/README.md) and
[Workshop_Guidance.md](./Workshop_Guidance.md).

## License

Licensed under the Apache License 2.0. See [LICENSE](./LICENSE).

## Credits

Built by Benjamin Voor ([@Benjamin-Voor](https://github.com/Benjamin-Voor)).

The workshop and starter repository were created by Colin Heilman
([@heilmancs](https://github.com/heilmancs)), Eugene Istrati
([@eistrati](https://github.com/eistrati)), Isaiah Cornelius Smith
([@corneliusmith](https://github.com/corneliusmith)), Juan Arevalo
([@jparevalo27](https://github.com/jparevalo27)) and Michael Annucci
([@michael-annucci](https://github.com/michael-annucci)).
