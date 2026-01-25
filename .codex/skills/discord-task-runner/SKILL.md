---
name: discord-task-runner
description: Run the Discord bot MVP task list in dnd-scheduler (design doc + tasks list). Use when implementing tasks from docs/discord-bot-feature-design-doc.md and docs/discord-bot-feature-design-tasks-list.md with long-running automation, tests, doc updates, and milestone commits.
---

# Discord Task Runner

## When to use
- The user asks to implement or continue the Discord bot MVP using the design doc and task list.
- The user wants long-running, automated execution of tasks with progress tracking.

## Required inputs
- `docs/discord-bot-feature-design-doc.md`
- `docs/discord-bot-feature-design-tasks-list.md`
- `AGENTS.md`

## Workflow (mandatory)
1) **Re-read docs**: Open `AGENTS.md`, the design doc, and the tasks list at the start of each task.
2) **Pick next task**:
   - Work in priority order (P0 → P1 → P2 → P3…).
   - Within the same priority, follow the numeric order.
   - If you discover a missing dependency, **update the task list** (priority/order) and note the reason in the task’s Notes.
3) **Implement in small steps**:
   - Edit code/documents as needed.
   - Prefer incremental, reviewable changes.
4) **Research if blocked**:
   - If any Discord/Firebase/API behavior is unclear or has likely changed, run web research (official docs first).
   - Update `docs/discord-bot-feature-design-doc.md` to correct any assumptions and add clarity.
5) **Validate**:
   - Run relevant tests or add minimal tests for new behavior.
   - If no tests exist, document that in the task’s Notes.
6) **Update task status**:
   - Mark the task `Status` as `[x]` **only after** it is completed and validated.
7) **Commit at milestones**:
   - After each major milestone (typically each Section 1.x), run tests and commit if they pass.
   - Commit format: `discord: <short milestone summary>`.
   - Do not amend commits.
8) **MVP completion behavior**:
   - When all P0 tasks (1–62) are complete and tests pass, stop and await further user instructions.

## Long-running execution guidance
- Prefer **small, sequential tasks**; if a task grows beyond ~1 hour, split it into smaller prompts.
- Run everything locally in the CLI (no Codex Cloud dependency).
- For fully automated pipelines, consider orchestrating Codex CLI via MCP + Agents SDK (only if requested).

## Notes
- Use the prompt template in `references/prompt-template.md` for single tasks.
- Use the generated prompts in `references/mvp-task-prompts.md` for MVP execution.
- Keep changes aligned with repo conventions in `AGENTS.md`.
