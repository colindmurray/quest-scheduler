# AGENTS.md — Quest Scheduler Conventions

This file is the working contract for all agents (including Codex) contributing to this repo.

## 1) Project Goals
- Build a Firebase-backed Quest Scheduler app for tabletop sessions with Google Auth + Google Calendar integration.
- Support slot-based voting (Feasible/Preferred), results sorting, and re-open workflow.
- Keep implementation simple, deterministic, and maintainable.

## 2) Repository Layout (Planned)
```
/                  (repo root)
  AGENTS.md         This file
  docs/             Product & engineering docs
    implementation-plan.md
    task-list.md
    decisions.md    (architecture + tradeoffs)
    runbook.md      (deploy + local dev)
  web/              Frontend app (Vite + React)
    src/
      app/          App shell, routing, auth gates
      features/     Feature modules (scheduler, voting, settings)
      components/   Shared UI building blocks
      lib/          Client SDKs, Firebase, API helpers
      hooks/        Reusable hooks
      styles/       Global styles, theme tokens
      tests/        Frontend tests
    public/
  functions/        Firebase Cloud Functions (email notifications)
  firebase.json     Hosting + functions config
  firestore.rules   Firestore rules
```

## 3) Conventions
### 3.1 Code Organization
- **Feature-first:** UI + logic for a feature live together in `src/features/<feature>`.
- **Shared UI:** Reusable components go in `src/components/`.
- **SDK wiring:** Firebase initialization goes in `src/lib/firebase.ts`.
- **No deep nesting:** Prefer 2–3 levels of folders max.

### 3.2 Data & Time
- **All timestamps stored in UTC** in Firestore.
- **Render in local time** at the UI layer using `date-fns-tz`.
- **Slots are the unit of voting** (not dates).

### 3.3 Naming
- Files/folders: `kebab-case`.
- Components: `PascalCase`.
- Hooks: `useXxx`.
- Firestore docs/fields: `camelCase`.

### 3.4 State & Data Access
- Firestore reads/writes should be centralized in `src/lib/data/` (e.g., `schedulers.ts`).
- Avoid inline Firestore calls scattered throughout components.

### 3.5 UX Principles
- Calendar view + list view must remain in sync.
- Voting UX should minimize friction (preferred implies feasible).
- Creator actions are always visibly distinct.

## 4) Documentation Strategy
- **Keep docs updated** as decisions are made.
- Use `docs/decisions.md` to record key architectural choices.
- Update `docs/task-list.md` as work progresses.
- Archive `docs/task-list.md` before starting a new long-running plan so it contains only the current plan’s tasks.
- Use `docs/testing.md` as the source of truth for local test commands and emulator setup.

### Task List Archive Process
- Before a new long-running task begins, move the current `docs/task-list.md` contents to an archive file:
  - `docs/task-list-archive-YYYY-MM-DD.md` (or `docs/task-list-archive-<plan-stem>-YYYY-MM-DD.md`).
- Create a fresh `docs/task-list.md` with:
  - The standard header
  - A new checkpoint block
  - A clean Progress Notes section
- Keep archives in `docs/` (never delete).

## Testing
- Follow `docs/testing.md` for setup, env files, and emulator steps.
- Common commands:
  - `npm --prefix web run test`
  - `npm --prefix functions run test`
  - `npm --prefix web run test:rules`
  - `npm --prefix web run test:e2e:emulators`
  - `npm --prefix web run test:coverage`

### Testing Gate (Required for Every Task)
- **Always update or add tests** when behavior changes or new logic is introduced.
- **Always re-run relevant tests locally** before finishing a task. This includes any tests you modified or the closest applicable suite.
- **Record test commands + results** in your final response and (for multi-step work) in `docs/task-list.md`.
- **If tests cannot be run**, explicitly state why, what was attempted, and what coverage remains unverified. Note this in `docs/task-list.md` and mark the task as partially validated.
- **Prefer CI enforcement** (required status checks / merge checks) so merges are blocked unless tests pass. citeturn0search2turn0search3

## 5) Implementation Workflow (for Codex)
- Work in small, reviewable steps.
- After each compact step, update `docs/task-list.md` with progress notes.
- Prefer patching one feature at a time.

### 5.1 Long-Running Test Plan Workflow (Codex)
- Use `docs/unit-integration-e2e-automated-test-plan.md` as the source of truth.
- Use the `test-plan-runner` skill when executing the test plan or any testing-overhaul tasks.
- Execute tasks in priority order (P0 → P1 → P2 → P3…), then numeric order.
- Mark task `Status` as `[x]` only after the task is completed **and** validated (tests run or explicitly noted).
- Maintain a persistent checkpoint in `docs/task-list.md` named `Test Plan Execution Checkpoint` with: `Last Completed`, `Next Step`, `Open Issues`, `Last Updated (YYYY-MM-DD)`.
- At the start of each cycle, read the checkpoint first; after each task and at the end, update it even if no tasks were completed.
- If dependencies shift, update priorities/order and explain in Notes.
- If any tool/API/test behavior is unclear, do web research (official docs first) and update the test plan or `docs/decisions.md` with corrections.
- For long-running chunks, split tasks into smaller prompts and run everything locally in the CLI, but do not pause for user input unless blocked.
- Always run tests after writing tests or changing test-related code; record results in task notes.

### 5.2 Autonomy, Decisions, and Commits
- Operate autonomously and continue through the test plan without interruption unless blocked by missing credentials, conflicting instructions, or destructive risk.
- Resolve routine decisions independently and document assumptions in `docs/decisions.md` when needed.
- If a bug is discovered during this process, commit the current state before fixing it, then fix the bug, run tests, and commit again once tests pass.

### 5.3 TypeScript Migration Protocol (CLI-Focused)
- Follow `docs/typescript_migraiton_plan.md` for the staged migration order.
- Maintain durable state in `docs/typescript-migration-state.md` (update after every chunk).
- Prefer small, reviewable chunks (one folder or <= 20 files).
- Use the `ts-migration-chunk` skill for ongoing conversions.
- Gate each chunk with typecheck + lint + relevant tests before marking progress.
- Record new typing conventions or tsconfig decisions in `docs/decisions.md`.

## Long-Running Plan: Unified Notification Overhaul
- Plan doc: `docs/unified-notification-overhaul.md`
- Task list: `docs/plan-execution/unified-notification-overhaul-task-list.md`
- Execution skill: `execute-plan-unified-notification-overhaul`
- Autonomy: Continue without interruption; stop only when blocked or complete.
- Test gate: Update/add tests, run relevant suites, and record results in `docs/task-list.md` and `docs/plan-execution/unified-notification-overhaul-task-list.md` progress notes.

## 6) Deployment Notes
- Target Firebase Hosting for frontend.
- Firebase Functions for email notifications.
- Firestore rules must be reviewed before deploy.

## 7) Open Questions Log
Maintain an evolving list in `docs/decisions.md` when new questions arise.
