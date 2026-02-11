You are executing the "basic-poll" long-running implementation plan in this repository.

Primary sources (read first):
- AGENTS.md
- docs/basic-poll.md
- docs/basic-poll-tasks.md
- docs/plan-execution/basic-poll-task-list.md
- docs/task-list.md
- docs/testing.md
- docs/decisions.md

Execution requirements:
1. Use the `execute-local-plan` skill workflow.
2. Operate in local Codex CLI mode only. Never use `codex cloud` commands.
3. Execute tasks in priority order from `docs/basic-poll-tasks.md` (P0/P1/P2/P3..., then numeric order).
4. Implement in small, reviewable chunks.
5. After each chunk:
   - update `docs/plan-execution/basic-poll-task-list.md` statuses and checkpoint
   - update `docs/task-list.md` checkpoint + progress notes
   - run relevant tests and record exact commands/results
6. Mark a task complete only after implementation and validation.
7. Continue autonomously until blocked or all tasks are complete.

If blocked:
- document blockers in both tracker files
- continue with the next safe unblocked task when possible
