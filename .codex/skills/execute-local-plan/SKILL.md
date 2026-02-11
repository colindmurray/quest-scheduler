---
name: execute-local-plan
description: Execute any long-running implementation plan locally in Codex CLI (no cloud commands), with checkpoints, tests, and task-list updates.
---

# Execute Local Plan

Use this skill when asked to execute or continue a long-running implementation plan from repository docs.

## Required Inputs
- Plan doc path (feature design, constraints)
- Task doc path (ordered implementation tasks)
- Plan execution tracker path (usually `docs/plan-execution/<plan-id>-task-list.md`)
- Global tracker: `docs/task-list.md`
- Conventions: `AGENTS.md` and `docs/testing.md`

## Local-Only Guardrail
- Use local Codex CLI workflows only.
- Do not use `codex cloud` commands.
- Prefer repo scripts:
  - `scripts/codex/init-plan-run.sh` to scaffold a plan run
  - `scripts/codex/run-local-plan.sh` to run non-interactive cycles

## Workflow
1) Read `AGENTS.md`, `docs/testing.md`, the plan doc, the task doc, and both tracker files first.
2) Confirm checkpoints exist in `docs/task-list.md` and the plan execution tracker; add them if missing.
3) Select the next unfinished task by priority and task order.
4) Implement in small, reviewable batches.
5) Add or update tests for behavior changes.
6) Run relevant tests locally.
7) Update both trackers after each compact batch:
   - task status updates
   - checkpoint updates (`Last Completed`, `Next Step`, `Open Issues`, date)
   - exact test commands and outcomes
8) Record non-obvious assumptions/decisions in `docs/decisions.md`.
9) Continue autonomously until blocked or complete.

## Completion Rule
Mark a task complete only when implementation is done and validation is documented:
- tests passed, or
- explicit partial-validation note with blocker and unverified scope

## Output Expectations
- Surface blockers/risk first.
- Keep implementation summary concise and concrete.
- Always list exact tests run and their results.
