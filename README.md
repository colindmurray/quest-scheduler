# Quest Scheduler

[![CI](https://github.com/colindmurray/quest-scheduler/actions/workflows/ci.yml/badge.svg)](https://github.com/colindmurray/quest-scheduler/actions/workflows/ci.yml)

Firebase-backed scheduling app for tabletop sessions with voting workflows, Google auth, and calendar integration.

## Continuous Integration

The repository CI workflow runs on every pull request and every push to `main`/`master`.

It executes:
- Web linting
- Web unit tests
- Functions unit tests
- Firestore/Storage rules tests (Firebase emulators)
- Integration tests (Firebase emulators)
- Playwright E2E tests in parallel for `chromium`, `firefox`, and `webkit` (Safari engine coverage)

For CI details, required/optional secrets, and debugging workflow failures, see `docs/ci.md`.
