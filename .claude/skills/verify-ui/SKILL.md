---
name: verify-ui
description: Drive the running Project Tracker in VS Code's integrated browser to check the UI as admin, manager and employee, then report what works and what is broken. Use when asked to check, review, test, smoke-test or verify the UI or someone else's frontend work, or after changing frontend or backend code.
---

# Verify the UI in the browser

Needs a browser tool (VS Code integrated browser: `open_browser_page`, `read_page`, `click_element`, `type_in_page`, `screenshot_page`, `run_playwright_code`). If you have no browser tool, say so, read the diff instead, and give the user a click-through checklist from step 4. Do not claim you checked the UI.

## Rules

- **Read-only by default.** Open pages, click tabs, open and cancel dialogs. Ask before creating, archiving or editing data, seeding demo data (`db/seed-demo.sql`), or running `./bin/start-dev.sh`, `bin/deploy-*.sh` or `bin/cleanup-environment.sh` (see [AGENTS.md](../../../AGENTS.md)).
- **Credentials:** never write a password into any file, command history, commit or reply. If the user types one in chat, use it for the browser only. Documented fake demo users (password in AGENTS.md) are fine if the demo data is loaded. Do not use `vscode_askQuestions` to collect a password; ask the user to type it in chat or to log in themselves.
- Log out when finished (it writes a `logout` audit row).
- **Own tab only (owner decision):** open your own tab with `open_browser_page` and `forceNew: true`. The user keeps their tab; never click, type in or navigate it.

## 1. Check the app is up

- `curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/api/users` should be `401` (proxy and Lambda are up; no `actor_id`). `502` or a timeout means the backend is not deployed or the proxy is stale: tell the user to run `./bin/start-dev.sh`.
- Frontend is `http://localhost:3000`.

## 2. Open a usable tab

- `open_browser_page` with `forceNew: true` and `http://localhost:3000/`. A new tab has empty `sessionStorage`, so it shows the login page.
- The user's own tab is theirs. It is often hidden ("not visible"), which makes clicks time out, so do not try to reuse it.
- Log in with `type_in_page` (username, then password with `submit: true`). Wrong credentials create `login_failed` audit rows; do not retry blindly.

## 3. Tool tips

- Prefer `screenshot_page` for how it looks and `click_element` with a selector like `role=tab[name="Users"]` or `button:has-text("Open")` over refs, which go stale after re-renders.
- `read_page` snapshots of the audit log and tables are very large. Use them once, then screenshots.
- `read_page` lists `Recent events` (console errors and warnings). Read them after each navigation; 401s from a failed login are expected, MUI "out-of-range value" warnings are worth reporting.
- MUI selects: click the combobox, then click the option (it appears in a `listbox`).
- The admin "View as" dropdown switches to another user without logging out, so one admin login can check all three roles. Everything done while viewing as someone is recorded under that user.

## 4. What to check

Admin:
- Projects: list, "Show archived", New project, Open (tabs Milestones / Time / Budget), Team, Edit, Archive.
- Users tab: Users and Audit log sub-tabs, Add user, Edit, Archive, salary column.
- Profile and Password dialogs open and cancel cleanly. Profile always shows the logged-in user (for example `admin1`), even while viewing as someone else. That is intended (owner decision), not a bug.

View as a manager (own projects only):
- No "New project"; Edit, Team and Archive on own projects; Users tab hidden.
- Budget tab and "New milestone" present.

View as an employee:
- Only allocated projects, no Edit/Archive/New milestone, no Budget tab, no Users tab.
- Time tab lets them log their own time.

Always:
- No red console errors; no blank screens; the warning banner shows while viewing as another user.
- Layout: the "View as" label and table actions are not clipped.

## 5. Report

List what you opened and saw per role, then findings ordered by severity, each with the page, what you did, what happened, and the likely file in `frontend/src` or `backend/`. Also run `cd frontend && npm run lint && npm run build` (lint warnings are known; errors are not). Say plainly what you did not check.
