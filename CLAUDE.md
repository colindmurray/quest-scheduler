# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Quest Scheduler is a Firebase-backed scheduling application for tabletop sessions. Users create schedulers with time slots, invite participants via email or shareable links, collect votes (Feasible/Preferred), and finalize sessions by creating Google Calendar events.

## Research & Reasoning Workflow (Expert Mode)
- Start with repo docs: `AGENTS.md`, `docs/decisions.md`, `docs/task-list.md`, `docs/testing.md`, and any feature-specific design docs under `docs/`.
- If external research is required, prioritize official docs and primary sources first.
- Summarize findings as actionable steps, note assumptions, and update `docs/decisions.md` if you introduce new conventions.
- Prefer small, verifiable changes with explicit acceptance criteria and tests.

## Pragmatic Delivery Priorities
- **Ship robust features first.** This is a small project (~10 users) with limited budget; keep scope lean.
- **Avoid YAGNI and over‑engineering.** Only add complexity when it solves a current, real need.
- **Cost‑aware by default.** Avoid recommendations that introduce paid services, heavy infra, or ongoing ops burden.
- **Forward‑looking, not premature scaling.** Prefer designs that can grow later without forcing it now.
- **Actionable > informative.** Prioritize changes that unblock user actions and reduce confusion.

## Documentation Metadata & Audit Skills (Required)
- For any Markdown create/update in this repo (excluding `README.md` / `README*.md`), use:
  - `.claude/skills/docs-frontmatter-maintainer/SKILL.md`
- For stale-risk or suspicious docs, use:
  - `.claude/skills/documentation-auditor/SKILL.md`
- Trigger `documentation-auditor` if any condition is true:
  - `lastUpdated` is older than 30 days vs latest repo commit date.
  - file's latest commit is > 10 commits behind `HEAD`.
  - file's latest commit date is > 30 days older than latest repo commit date.
  - metadata appears inconsistent with code/docs reality.
- Keep this file lightweight; detailed frontmatter schema, enums, warnings, and audit rubric are defined in those skills.

## Commands

### Development
```bash
cd web && npm install && npm run dev   # Start dev server at localhost:5173
```

### Build & Lint
```bash
npm --prefix web run build             # Production build to web/dist/
npm --prefix web run lint              # ESLint
```

### Firebase Deployment
```bash
firebase deploy --only hosting,firestore,extensions --project studio-473406021-87ead
firebase deploy --only hosting --project studio-473406021-87ead   # Hosting only
```

### Testing
See `docs/testing.md` for full setup and emulator steps.

```bash
npm --prefix web run test                      # Web unit tests (Vitest)
npm --prefix web run test:coverage             # Web coverage report
npm --prefix functions run test                # Functions unit tests (Vitest)
npm --prefix functions run test -- --coverage  # Functions coverage report
npm --prefix web run test:rules                # Firestore/Storage rules (emulator)
npm --prefix web run test:e2e                  # Playwright E2E (assumes emulators + seed)
npm --prefix web run test:e2e:emulators        # One-step emulator + seed + E2E
```

### Testing Gate (Required for Every Task)
- Always add or update tests when behavior changes or new logic is introduced.
- Always re-run the relevant test suite(s) locally before finishing a task.
- Always report test commands + results in the final response.
- If tests cannot be run, document why and what remains unverified, and log it in `docs/task-list.md`.
- Prefer CI enforcement (required status checks / merge checks) to prevent untested changes from merging. citeturn0search2turn0search3

## Architecture

### Frontend Stack
- React 19 + Vite + React Router v7
- Tailwind CSS + Radix UI primitives + Lucide icons
- react-big-calendar for calendar views
- date-fns + date-fns-tz for timezone handling
- Framer Motion for animations

### Backend
- Firebase Auth (Google OAuth with basic profile scopes at login; calendar scopes only during linking)
- Firestore for data persistence
- Firebase Hosting
- Firebase Extensions (firestore-send-email for notifications)

### Directory Structure
```
web/src/
  app/          # App shell, routing, auth guards
  features/     # Feature modules (dashboard, scheduler, settings, landing)
  components/   # Shared UI components
  hooks/        # Custom React hooks (Firestore wrappers, useUserSettings)
  lib/          # Firebase SDK, auth helpers, data access layer
  styles/       # Global styles, Tailwind config
```

### Key Patterns
- **Feature-first organization:** UI + logic co-located in `src/features/<feature>`
- **Centralized data layer:** All Firestore operations go through `src/lib/data/`
- **Real-time listeners:** Firestore `onSnapshot` for live updates via custom hooks
- **Auth context:** `useAuth()` hook provides user state throughout the app

### Firestore Data Model
- `users/{userId}` - Profile, settings, address book
- `schedulers/{schedulerId}` - Scheduler metadata (status: OPEN/FINALIZED)
  - `slots/{slotId}` - Time slots with UTC timestamps and vote stats
  - `votes/{userId}` - User's votes mapping slotId → FEASIBLE/PREFERRED

## Critical Conventions

### Timestamps
- **Store in UTC** in Firestore
- **Render in local time** at the UI layer using date-fns-tz

### Naming
- Files/folders: `kebab-case`
- Components: `PascalCase`
- Hooks: `useXxx`
- Firestore docs/fields: `camelCase`

### Voting Logic
- Preferred implies Feasible (selecting Preferred auto-selects Feasible)
- Slots are the unit of voting, not dates

### UX Rules
- Calendar view and list view must stay in sync
- Creator actions are always visually distinct from participant actions
 - Voting: "Preferred" vote implies "Feasible"
 
## Durable State (Long Tasks)
- Progress + checkpoints: `docs/task-list.md`
- Decisions + conventions: `docs/decisions.md`
- Test setup + emulator: `docs/testing.md`
