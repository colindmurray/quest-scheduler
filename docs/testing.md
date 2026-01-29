# Testing Guide

This project uses Vitest for unit tests, Firebase emulators for rules/integration, and Playwright for E2E.

## Prerequisites
- Node.js 22
- Java 21 (required for Firebase emulator + rules tests)
- Playwright OS deps (once per machine):
  - `cd web && npx playwright install-deps`

## Install Dependencies
```bash
npm --prefix web install
npm --prefix functions install
```

## Environment Setup (local only)
Create these local files (they are gitignored):

`web/.env.e2e.local`
```bash
E2E_USER_UID=your-test-user-uid
E2E_USER_EMAIL=your-test-email@example.com
E2E_USER_PASSWORD=your-test-password
E2E_SCHEDULER_ID=e2e-scheduler
VITE_EMULATOR_HOST=127.0.0.1
VITE_GOOGLE_OAUTH_CLIENT_ID=your-google-oauth-client-id
```

`functions/.env`
```bash
QS_APP_URL=http://localhost:5173
DISCORD_OAUTH_REDIRECT_URI=http://127.0.0.1:5001/<project-id>/us-central1/discordOAuthCallback
DISCORD_CLIENT_ID=your-discord-client-id
DISCORD_CLIENT_SECRET=your-discord-client-secret
QS_GOOGLE_OAUTH_CLIENT_SECRET_FILE=functions/credentials/quest_scheduler_test_oauth_client.json
```

Place the Google OAuth client JSON at `functions/credentials/quest_scheduler_test_oauth_client.json`
(the path is gitignored) and keep `QS_GOOGLE_OAUTH_CLIENT_SECRET_FILE` pointed at that file.

## Unit Tests
```bash
npm --prefix web run test
npm --prefix functions run test
```

## Coverage (Web)
```bash
npm --prefix web run test:coverage
```

## Coverage (Functions)
```bash
npm --prefix functions run test -- --coverage
```

## Rules Tests (Firestore + Storage)
```bash
npm --prefix web run test:rules
```

## E2E Tests (manual emulator)
1) Start emulators:
```bash
firebase emulators:start --only auth,firestore,functions,storage
```
2) Seed a scheduler in the emulator:
```bash
node functions/scripts/seed-e2e-scheduler.js
```
3) Run Playwright:
```bash
npm --prefix web run test:e2e
```

## E2E Tests (one-step)
This starts emulators, seeds data, and runs Playwright in one command:
```bash
npm --prefix web run test:e2e:emulators
```

## Notes
- The seed script creates/updates the test auth user (from `web/.env.e2e.local`) and writes a scheduler with slots into the emulator.
- Emulator logs may still show `punycode` deprecation warnings and firebase-functions version warnings; tests can still pass.
- Google OAuth test creds must be created in Google Cloud Console (OAuth client for Web). Download the JSON and place it in `functions/credentials/quest_scheduler_test_oauth_client.json`.
