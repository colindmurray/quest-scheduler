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

### 4.1 Docs Metadata & Audit Workflow (Required)
- For any Markdown create/update in this repo (excluding `README.md` / `README*.md`), use the `docs-frontmatter-maintainer` skill:
  - `.codex/skills/docs-frontmatter-maintainer/SKILL.md`
- For stale-risk docs, use the `documentation-auditor` skill:
  - `.codex/skills/documentation-auditor/SKILL.md`
- Run `documentation-auditor` when any of these are true:
  - `lastUpdated` is older than 30 days relative to latest repo commit date.
  - file's latest commit is > 10 commits behind `HEAD`.
  - file's latest commit date is > 30 days older than latest repo commit date.
  - metadata appears inconsistent with code/docs reality.
- Keep top-level guidance lightweight in this file; the skills are the source of truth for:
  - required frontmatter fields and enums
  - warning callout rules
  - changelog style
  - status/implementation-status decision criteria

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

### 5.1 Legacy Workflows (Archived)
- Legacy skill folders for prior initiatives were archived on 2026-02-11 under:
  - `.codex/skills-archive/2026-02-11/`
- Archived skills:
  - `execute-plan-unified-notification-overhaul`
  - `test-plan-runner`
  - `ts-migration-chunk`
- For new long-running work, use the generic workflow in **5.4** (`execute-local-plan` + `scripts/codex/*`).

### 5.2 Autonomy, Decisions, and Commits
- Operate autonomously and continue through the test plan without interruption unless blocked by missing credentials, conflicting instructions, or destructive risk.
- Resolve routine decisions independently and document assumptions in `docs/decisions.md` when needed.
- If a bug is discovered during this process, commit the current state before fixing it, then fix the bug, run tests, and commit again once tests pass.

### 5.3 TypeScript Migration Protocol (CLI-Focused)
- If TypeScript migration resumes, follow `docs/typescript_migraiton_plan.md` and `docs/typescript-migration-state.md`.
- Execute migration chunks with the generic local plan workflow in **5.4**.
- Keep chunks small (one folder or <= 20 files) and gate with typecheck + lint + relevant tests.
- Record new typing conventions or tsconfig decisions in `docs/decisions.md`.

### 5.4 Generic Long-Running Plan Workflow (Local Codex CLI)
- Local only: run long tasks through local Codex CLI; do **not** use `codex cloud` commands.
- Bootstrap a new plan run with:
  - `scripts/codex/init-plan-run.sh --plan-id <id> --plan-doc <plan-doc> --tasks-doc <tasks-doc> [--archive-task-list]`
- Run an execution cycle with:
  - `scripts/codex/run-local-plan.sh --prompt-file .codex/prompts/<id>-execute.md`
- Use the `execute-local-plan` skill for generic multi-phase plan execution.
- Keep state in two places:
  - Global tracker: `docs/task-list.md`
  - Plan tracker: `docs/plan-execution/<id>-task-list.md`
- Update both trackers after each compact step with:
  - checkpoint fields (`Last Completed`, `Next Step`, `Open Issues`, date)
  - task status changes
  - test commands and outcomes

## Active Long-Running Plan: Basic Poll Implementation
- Plan doc: `docs/basic-poll.md`
- Task doc: `docs/basic-poll-tasks.md`
- Plan task list: `docs/plan-execution/basic-poll-task-list.md`
- Execution skill: `execute-local-plan`
- Prompt scaffold: `.codex/prompts/basic-poll-execute.md`
- Bootstrap shortcut: `scripts/codex/init-basic-poll-run.sh`
- Execution command: `scripts/codex/run-local-plan.sh --prompt-file .codex/prompts/basic-poll-execute.md`

## 6) Deployment Notes
- Target Firebase Hosting for frontend.
- Firebase Functions for email notifications.
- Firestore rules must be reviewed before deploy.

## 7) Open Questions Log
Maintain an evolving list in `docs/decisions.md` when new questions arise.
