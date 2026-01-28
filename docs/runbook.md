# Runbook

## Local development
```
cd web
npm install
npm run dev
```

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

## Functions config (env)
- Local dev: create `functions/.env` from `functions/.env.example`.
- Deploy: create `functions/.env.studio-473406021-87ead` (or `functions/.env.<projectId>`).
- Required variables:
  - `QS_APP_URL`
  - `QS_ENC_KEY_B64`
- Optional local fallback variables (if not using the OAuth JSON file):
  - `QS_GOOGLE_OAUTH_CLIENT_ID`
  - `QS_GOOGLE_OAUTH_CLIENT_SECRET`
  - `QS_GOOGLE_OAUTH_REDIRECT_URI`

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

## Extensions config
- Params: `extensions/firestore-send-email.env`
- Secrets: `extensions/firestore-send-email.secret.local` (ignored by git)

Update extension config:
```
firebase deploy --only extensions --project studio-473406021-87ead
```

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

## Notes
- Google Calendar access uses OAuth token from Google sign-in. If finalization fails, re-auth.
- SMTP credentials are placeholders until real provider credentials are added.
