---
name: ts-migration-chunk
description: Convert a small, reviewable set of JS/JSX modules to TS/TSX during the Quest Scheduler TypeScript migration. Use when asked to migrate files, continue the TS migration, or execute a chunked JS→TS conversion with checkpoints, tests, and updates to migration state.
---

# TS Migration Chunk

## Workflow
1. Read `docs/typescript-migration-state.md` and `docs/typescript_migraiton_plan.md` to pick the next small chunk (ideally one folder or <= 20 files).
2. Convert JS/JSX to TS/TSX with minimal behavioral change. Prefer leaf utilities first, then hooks/components, then features.
3. Add minimal typing (prefer explicit types over `any`; use `unknown` + narrowing when needed).
4. Run the relevant checks (typecheck, lint, unit tests). Rerun until green.
5. Update `docs/typescript-migration-state.md` with Done/Next/Blockers and `docs/task-list.md` with a progress note.
6. If you introduce new conventions, record them in `docs/decisions.md`.
7. Commit with a descriptive message.

## Guardrails
- Keep each chunk small and reviewable; avoid cross-cutting refactors.
- Do not change runtime behavior unless explicitly requested.
- If build/test commands do not exist yet, add them per the migration plan before proceeding.
