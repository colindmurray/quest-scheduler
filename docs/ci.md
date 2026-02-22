---
created: 2026-02-22
lastUpdated: 2026-02-22
summary: "Reference for the GitHub Actions CI pipeline, including matrix E2E strategy, emulator setup, secrets policy, and CI failure debugging."
category: CORE_DOCUMENTATION
status: CURRENT
note: "Describes the active repository CI workflow used for pull requests and protected branch validation."
changelog:
  - "2026-02-22: Added comprehensive CI workflow documentation for lint/unit/integration/rules and multi-browser Playwright E2E."
relatedDocs:
  - docs/testing.md
  - AGENTS.md
---

# CI/CD Pipeline (`.github/workflows/ci.yml`)

## Trigger Conditions
- `pull_request`: all branches
- `push`: `main`, `master`
- `workflow_dispatch`: manual runs

## Job Layout
1. `lint-and-unit`
   - Node.js setup + npm cache
   - `npm --prefix web run lint`
   - `npm --prefix web run test`
   - `npm --prefix functions run test`
2. `integration`
   - Java 21 + Firebase CLI setup
   - Rules tests: `npm --prefix web run test:rules`
   - Integration tests: `npm --prefix web run test:integration`
   - Uploads logs on failure
3. `e2e` (matrix)
   - Matrix: `os=ubuntu-latest`, `node=22.x`, `browser=chromium|firefox|webkit`
   - Shard dimension: default `1/1` (ready to expand if suite runtime grows)
   - `strategy.fail-fast: false`
   - Runs Firebase emulators, seeds test data, and runs Playwright with `--project=<browser> --shard=<index/total>`
   - Uploads Playwright report and logs on failure

## Browser Coverage
- `chromium`: Chrome engine coverage
- `firefox`: Firefox engine coverage
- `webkit`: Safari engine coverage via Playwright WebKit project

Note: Playwright `webkit` uses the Safari/WebKit engine behavior model, but CI on Linux does not run Apple’s macOS Safari binary.

## Caching Strategy
- Node dependencies: `actions/setup-node` npm cache keyed by lockfiles
- Playwright browsers: cached from `~/.cache/ms-playwright`

Note: Playwright docs indicate browser caching is not always faster due archive size and restore cost; this repo still enables browser cache because CI runtime is browser-heavy.

## Environment and Emulator Setup
- Global CI env:
  - `CI=true`
  - `XDG_CONFIG_HOME=/tmp/firebase-config` (avoids Firebase CLI config permission issues)
- E2E env files are generated during the job:
  - `web/.env.e2e.local`
  - `functions/.env`
  - `functions/credentials/quest_scheduler_test_oauth_client.json`
- E2E suite runs with Firebase emulators only (`auth,firestore,functions,storage`)

## Secrets Policy
No required secret is hardcoded in workflow files.

Optional secrets used by CI:
- `VITE_GOOGLE_OAUTH_CLIENT_ID`
- `DISCORD_CLIENT_ID`
- `DISCORD_CLIENT_SECRET`
- `QS_GOOGLE_OAUTH_CLIENT_JSON`

If optional secrets are absent (including fork PRs), CI falls back to deterministic test values and still runs.

## Debugging CI Failures
When jobs fail, download artifacts from the run summary:
- Integration logs:
  - `artifacts/rules-tests.log`
  - `artifacts/integration-tests.log`
- E2E logs/reports:
  - `artifacts/e2e-<browser>.log`
  - `web/playwright-report/`
  - `web/test-results/`

Common failure patterns:
1. Emulator startup errors
   - Verify Java 21 and Firebase CLI version logs in job output.
   - Confirm no port conflicts in workflow customization.
2. Playwright browser install errors
   - Check `Install Playwright browser + OS deps` step for apt/system package failures.
3. Flaky tests
   - Playwright retries in CI are enabled in `web/e2e/playwright.config.js`.
   - Re-run only the failing project locally first, then full emulator E2E.
4. Timeout pressure
   - Job-level timeouts are configured in workflow.
   - Scale by expanding the matrix shard dimension beyond `1/1` if runtime grows.

## Local Command Parity
Use the same core commands locally before pushing:

```bash
npm --prefix web run lint
npm --prefix web run test
npm --prefix functions run test
npm --prefix web run test:rules
npm --prefix web run test:integration
npm --prefix web run test:e2e:emulators
```
