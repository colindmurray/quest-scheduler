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

## Notes
- Google Calendar access uses OAuth token from Google sign-in. If finalization fails, re-auth.
- SMTP credentials are placeholders until real provider credentials are added.
