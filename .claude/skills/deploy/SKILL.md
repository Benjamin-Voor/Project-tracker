---
name: deploy
description: Deploy the Project Tracker to AWS (or LocalStack) — backend Lambdas, Aurora schema via the dbsetup Lambda, and the React frontend — then smoke-test the live site. Use when asked to deploy, redeploy, ship, or push changes to AWS, or after changing backend code, frontend code, or db/schema.sql.
---

# Deploy

Deploys with the repo's scripts ([bin/README.md](../../../bin/README.md)). AWS credentials come from `~/.bashrc` (`PARTICIPANT_ID`, `PARTICIPANT_CODE`, `AWS_REGION`); the deploy scripts call `bin/setup-participant.sh`, which refreshes `ENVIRONMENT.config` each run.

**Owner rules ([AGENTS.md](../../../AGENTS.md)):** deploy only when the user asked for it (`/deploy` or an explicit request counts); otherwise ask first. Local first: the change should already work locally (`./bin/start-dev.sh`) — don't deploy speculatively to debug. Never run `bin/cleanup-environment.sh` without asking; it destroys everything with no prompt.

**Never print** `ENVIRONMENT.config`, `frontend/.env.local`, or `~/.bashrc` values — they hold credentials. Source them; don't cat them.

## Decide what to run

| What changed | Steps |
|---|---|
| First deploy ever | 1 → 2 (with admin password) → 3 → 4 |
| Backend code (`backend/*`) or new Lambda folder | 1 → 4 |
| Frontend code (`frontend/*`) | 3 → 4 |
| `db/schema.sql` or `db/seed-demo.sql` | copy files → 1 → 2 → 4 |
| Load demo data | 2 with `{"demo": true}` |
| Infra (`infra/*`) | 1 → 4 |

If unsure, run 1 → 3 → 4. Both scripts are idempotent.

## 1. Backend (Lambdas, Aurora, S3, CloudFront)

```bash
source ~/.bashrc
./bin/deploy-backend.sh aws
```

- First run ~8–15 min (Aurora instance ~6 min, CloudFront ~3 min); later runs are fast. Run it in the background and log to the scratchpad; check `Apply complete!` and the outputs (`website_url`, `lambda_urls`).
- Every folder in `backend/` with a `requirements.txt` becomes a Lambda named `coding-workshop-<folder>-<PARTICIPANT_ID>`, routed at `/api/<folder>`.

## 2. Database schema and first admin (dbsetup Lambda)

Aurora is private to the VPC, so the schema can't be applied with local `psql`. [backend/dbsetup/function.py](../../../backend/dbsetup/function.py) applies its copy of the schema and optionally seeds `admin1`. It only accepts direct invocation; web requests get 404.

After changing the schema or demo seed, first refresh the copies:

```bash
cp db/schema.sql db/seed-demo.sql backend/dbsetup/
```

Invoke (credentials must be sourced in the same shell):

```bash
source ~/.bashrc; source ENVIRONMENT.config
aws lambda invoke --function-name "coding-workshop-dbsetup-$PARTICIPANT_ID" \
  --cli-binary-format raw-in-base64-out --cli-read-timeout 300 \
  --payload '{}' out.json && cat out.json; rm -f out.json
```

- To seed `admin1` (first deploy only), use `--payload "{\"admin_password\":\"$PW\"}"` with `PW=$(openssl rand -base64 12 | tr -d '/+=' | cut -c1-14)`, and give the user the password — it can't be recovered later. `admin1` must change it at first login. Seeding does nothing if `admin1` already exists.
- To load the demo users and projects ([db/seed-demo.sql](../../../db/seed-demo.sql); password `Demo1234!` for every demo user), use `--payload '{"demo": true}'`. Safe to re-run.
- Expect `{"schema": "applied", ...}`. A timeout usually means Aurora was paused (min capacity 0); retry after ~20 s.

## 3. Frontend

```bash
source ~/.bashrc
./bin/deploy-frontend.sh aws
```

Builds with Vite, syncs `dist/` to S3, invalidates CloudFront, and prints `CloudFront URL: https://...`. The URL is stable across deploys.

## 4. Smoke test

```bash
U=<website_url>
curl -s -o /dev/null -w "page %{http_code}\n" $U/
curl -s $U/$(curl -s $U/ | grep -oE 'assets/index-[^"]+\.js') | grep -c localhost:3001   # expect 0
curl -s -w " [%{http_code}]\n" -X POST -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"wrong-pass"}' $U/api/auth/login                 # expect 401
```

Note: CloudFront maps every 404 to `/index.html` with 200 ([infra/cloudfront.tf](../../../infra/cloudfront.tf)), so an API 404 shows up as HTML. Check a Lambda's real response at its direct URL from `lambda_urls`.

## LocalStack

`./bin/start-dev.sh` deploys to LocalStack and runs the dev server; the schema goes straight into local Postgres with `psql` (see [AGENTS.md](../../../AGENTS.md)). `deploy-frontend.sh local` does nothing useful.

## Report back

Say which steps ran, the website URL, smoke-test results, and any temporary admin password. Say what you didn't verify (for example, clicking through in a browser).
