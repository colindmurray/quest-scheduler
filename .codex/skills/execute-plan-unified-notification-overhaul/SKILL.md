---
name: execute-plan-unified-notification-overhaul
description: Execute the Unified Notification Overhaul plan in priority order with checkpoints, tests, and documentation updates.
---

# Execute Plan: Unified Notification Overhaul

Use this skill when asked to execute or continue the unified notification overhaul plan.

## Inputs
- Plan doc: `docs/unified-notification-overhaul.md`
- Task list: `docs/plan-execution/unified-notification-overhaul-task-list.md`
- Conventions: `AGENTS.md`

## Workflow
1) Read `AGENTS.md`, the plan doc, and the plan task list.
2) Start from the Execution Checkpoint in the plan task list.
3) Execute tasks in priority order (P0 → P3), then numeric order.
4) For each task:
   - Verify Definition of Ready or document blockers.
   - Implement changes in small, reviewable steps.
   - Add/update tests for behavior changes.
   - Run relevant test suites and capture results.
   - Update task status, acceptance criteria, and progress notes.
   - Update the Execution Checkpoint after each chunk.
   - Record non-obvious assumptions in `docs/decisions.md`.
5) Update `docs/task-list.md` progress notes after each compact step.
6) Stop only when blocked or all tasks are complete.

## Testing Gate
- Always run the most relevant test suites after changes.
- Record test commands + outcomes in both task lists.
- If tests cannot be run, document why and mark the task as partially validated.
