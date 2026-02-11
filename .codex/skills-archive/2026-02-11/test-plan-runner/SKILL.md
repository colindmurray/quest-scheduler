---
name: test-plan-runner
description: Execute long-running testing overhauls and the unit/integration/e2e automated test plan in this repo. Use when asked to process docs/unit-integration-e2e-automated-test-plan.md, run multi-cycle testing tasks, or maintain test-plan checkpoints in docs/task-list.md.
---

# Test Plan Runner

## Core workflow
1) Read `docs/unit-integration-e2e-automated-test-plan.md` and the latest `docs/task-list.md` checkpoint first.
2) If the checkpoint is missing, add a `Test Plan Execution Checkpoint` section with `Last Completed`, `Next Step`, `Open Issues`, and `Last Updated (YYYY-MM-DD)`.
3) If the test plan is not yet mirrored into `docs/task-list.md`, convert it into a structured execution checklist with priorities, status, and notes.
4) Use the plan tool to track multi-step execution and update it after each compact step.
5) For each task: pick the next highest-priority item, implement changes, run the relevant tests, and record results.
6) Continue executing tasks without pausing for user input unless blocked by missing credentials, conflicting instructions, or destructive risk.
7) Update the checkpoint after each task and at the end of the run, even if no tasks were completed.
8) If any test/tool/API behavior is unclear, do web research using official docs first and record corrections in the test plan or `docs/decisions.md`.
9) Always run tests after writing tests or altering test-related code. Record failures and fixes.
10) If a bug is discovered during the run, commit the current state before fixing it, then fix the bug, run tests, and commit again once tests pass.

## Output expectations
- Keep changes small and reviewable.
- Always update `docs/task-list.md` after each task or logical batch.
- Note any failed or skipped tests explicitly in task notes and checkpoint Open Issues.
