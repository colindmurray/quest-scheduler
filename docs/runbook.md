---
created: 2026-01-06
lastUpdated: 2026-02-02
summary: "Operational runbook for local development, plan bootstrap scripts, and deployment-oriented workflows."
category: RUNBOOK
status: CURRENT
note: "Still referenced by active local execution workflows and script conventions."
changelog:
  - "2026-02-02: chore: sync notifications, discord, and identity updates"
  - "2026-01-31: Improve invite flows, notifications, and tests"
  - "2026-01-28: uuid: phase4 uid-only participants/members"
  - "2026-01-27: uuid: dual-read + group invite enforcement"
  - "2026-01-27: chore: document admin access + uuid migration run"
---

# Runbook

## Local development
```
cd web
npm install
npm run dev
```

## Local Codex long runs (non-cloud)
Use these scripts for repeatable long-running implementation cycles via local Codex CLI.

1. Bootstrap a new plan run (generic):
```bash
scripts/codex/init-plan-run.sh \
  --plan-id <plan-id> \
  --plan-doc docs/<plan-doc>.md \
  --tasks-doc docs/<task-doc>.md \
  --archive-task-list
```
This creates:
- `docs/plan-execution/<plan-id>-task-list.md` (execution checklist + checkpoint)
- `.codex/prompts/<plan-id>-execute.md` (execution prompt scaffold)

2. Bootstrap the current basic-poll plan:
```bash
scripts/codex/init-basic-poll-run.sh --force
```

3. Run a local execution cycle:
```bash
scripts/codex/run-local-plan.sh \
  --prompt-file .codex/prompts/basic-poll-execute.md \
  --run-name basic-poll-cycle-001
```

4. Inspect run artifacts:
- `.codex/runs/<run-name>/events.jsonl`
- `.codex/runs/<run-name>/final-message.md`
- `.codex/runs/<run-name>/metadata.txt`
- `.codex/runs/<run-name>/exit-status.txt`

Notes:
- The runner is local-only and does not use Codex Cloud commands.
- Defaults: sandbox=`danger-full-access`, approvals=`never`.
- Defaults also include `-c model_reasoning_effort="high"` (matches local `codex-yolo` behavior). Override with `--reasoning-effort <value>` or disable via `--reasoning-effort off`.
- If interrupted early (for example `Ctrl+C`), the runner now exits non-zero when no `final-message.md` is produced.

## Build for production
```
npm --prefix web install
npm --prefix web run build
```

## Web app config (env)
Optional Vite env overrides (prefix with `VITE_`):
- `VITE_APP_URL` (default: current origin in browser, else `https://questscheduler.cc`)
- `VITE_SUPPORT_EMAIL` (default: `support@questscheduler.cc`)
- `VITE_APP_NAME` (default: `Quest Scheduler`)
- `VITE_GOOGLE_OAUTH_CLIENT_ID` (Google Identity Services client ID for the web login button)
- Firebase web config overrides:
  - `VITE_FIREBASE_API_KEY`
  - `VITE_FIREBASE_AUTH_DOMAIN`
  - `VITE_FIREBASE_PROJECT_ID`
  - `VITE_FIREBASE_STORAGE_BUCKET`
  - `VITE_FIREBASE_MESSAGING_SENDER_ID`
  - `VITE_FIREBASE_APP_ID`

## Functions config (env)
- Local dev: create `functions/.env.local` from `functions/.env.example`.
- Deploy: create `functions/.env.studio-473406021-87ead` (or `functions/.env.<projectId>`).
- Required variables:
  - `QS_APP_URL`
  - `QS_ENC_KEY_B64`
- Optional local fallback variables (if not using the OAuth JSON file):
  - `QS_GOOGLE_OAUTH_CLIENT_ID`
  - `QS_GOOGLE_OAUTH_CLIENT_SECRET`
  - `QS_GOOGLE_OAUTH_REDIRECT_URI`
- Optional Discord override (local/emulator only unless you need a custom domain):
  - `DISCORD_OAUTH_REDIRECT_URI` (set in `functions/.env.<projectId>` for deploys; avoid localhost in prod)

## Functions OAuth secret (recommended)
- Store the OAuth client JSON in Secret Manager:
```
cat /path/to/client_secret.json | firebase functions:secrets:set QS_GOOGLE_OAUTH_CLIENT_JSON --format=json --project studio-473406021-87ead
```
- Local dev: keep the JSON file at repo root (ignored) or set `QS_GOOGLE_OAUTH_CLIENT_SECRET_FILE`. Emulator overrides can go in `functions/.secret.local`.

## Auth flows
- `/auth` hosts login + registration for Google and Email/Password.
- Email/password accounts must verify email before creating schedulers or questing groups (Firestore rules).
- Password reset uses Firebase Auth for password accounts and callable `sendPasswordResetInfo` (functions/src/auth.js) for Google-only accounts (SendGrid via `mail` collection).

## Admin user tool
- Script: `functions/scripts/admin-user-tool.js`
- Requires admin credentials (Application Default Credentials or `GOOGLE_APPLICATION_CREDENTIALS`).
- Local service account key (qs-admin-tools): `/home/colin/keys/qs-admin.json`
- Examples:
  - `node functions/scripts/admin-user-tool.js info --email user@example.com`
  - `node functions/scripts/admin-user-tool.js suspend --uid <uid> --commit`
  - `node functions/scripts/admin-user-tool.js unsuspend --email user@example.com --allowance 50 --commit`
  - `node functions/scripts/admin-user-tool.js set-allowance --email user@example.com --allowance 10 --commit`
  - `node functions/scripts/admin-user-tool.js delete --uid <uid> --commit`

## Admin database access
- Preferred: set `GOOGLE_APPLICATION_CREDENTIALS=/home/colin/keys/qs-admin.json`
- Migration tools accept `--service-account /home/colin/keys/qs-admin.json` for explicit credentials
- Keep the key outside the repo and never commit it

## Firebase deploy
- Hosting + Firestore rules + Extensions (recommended):
```
firebase deploy --only hosting,firestore,extensions --project studio-473406021-87ead
```

- Hosting only:
```
firebase deploy --only hosting --project studio-473406021-87ead
```

- Convenience scripts (set build mode automatically):
```
./scripts/deploy-prod.sh
DEPLOY_ONLY=hosting ./scripts/deploy-prod.sh
```

## Staging deploy (quest-scheduler-stg)
- Create `web/.env.staging` from `web/.env.staging.example`.
- Create `functions/.env.quest-scheduler-stg` with staging values (set `QS_APP_URL=https://quest-scheduler-stg.web.app`).
- Build + deploy with staging mode:
```
VITE_BUILD_MODE=staging firebase deploy --only hosting,firestore,extensions --project quest-scheduler-stg
```
- Convenience script:
```
./scripts/deploy-staging.sh
DEPLOY_ONLY=hosting ./scripts/deploy-staging.sh
```

## Extensions config
- Params: `extensions/firestore-send-email.env`
- Secrets: `extensions/firestore-send-email.secret.local` (ignored by git)

Update extension config:
```
firebase deploy --only extensions --project studio-473406021-87ead
```

## Firestore TTL
- Configure TTL for `notificationEvents.expiresAt` (default 90 days).
- Firebase Console: Firestore Database → TTL → add collection `notificationEvents` with field `expiresAt`.
- TTL is not enforced by the local emulator; validate in staging/prod.

## Migrations
### Set allowLinkSharing default on existing polls
Dry run (no writes):
```
node functions/scripts/migrate-allow-link-sharing.js
```

Apply updates:
```
node functions/scripts/migrate-allow-link-sharing.js --commit
```

Force set for all schedulers (rare):
```
node functions/scripts/migrate-allow-link-sharing.js --all --commit
```

### UUID identifier backfill (participantIds/memberIds/voterId)
Dry run:
```
node functions/scripts/migrate-uuid-identifiers.js --service-account /home/colin/keys/qs-admin.json
```

Apply:
```
node functions/scripts/migrate-uuid-identifiers.js --service-account /home/colin/keys/qs-admin.json --commit
```

Cleanup legacy email arrays (Phase 4):
```
node functions/scripts/migrate-uuid-identifiers.js \
  --service-account /home/colin/keys/qs-admin.json \
  --commit \
  --cleanup
```

## Notes
- Google Calendar access uses OAuth token from Google sign-in. If finalization fails, re-auth.
- SMTP credentials are placeholders until real provider credentials are added.
