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

## 5) Implementation Workflow (for Codex)
- Work in small, reviewable steps.
- After each compact step, update `docs/task-list.md` with progress notes.
- Prefer patching one feature at a time.

### 5.1 Discord Bot MVP Workflow (Codex)
- Use `docs/discord-bot-feature-design-doc.md` + `docs/discord-bot-feature-design-tasks-list.md` as source of truth.
- Use the `discord-task-runner` skill when executing the Discord MVP task list.
- Execute tasks in priority order (P0 → P1 → P2 → P3…), then numeric order.
- Mark task `Status` as `[x]` only after the task is completed **and** validated (tests run or explicitly noted).
- If a dependency mismatch appears, update the task list priority/order and explain in Notes.
- If any Discord/Firebase/API behavior is unclear, do web research (official docs first) and update the design doc to reflect corrections.
- Commit at milestones (typically each Section 1.x group) after tests pass; message format: `discord: <milestone summary>`.
- When all P0 tasks are complete and tests pass, stop and await user manual testing before continuing.
- For long-running chunks, split tasks into smaller prompts and run everything locally in the CLI.

## 6) Deployment Notes
- Target Firebase Hosting for frontend.
- Firebase Functions for email notifications.
- Firestore rules must be reviewed before deploy.

## 7) Open Questions Log
Maintain an evolving list in `docs/decisions.md` when new questions arise.
