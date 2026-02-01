---
name: task-list-reviewer-expert
description: Review a task list for ordering, dependencies, clarity, acceptance criteria, and test gates. Use when asked to critique task lists without modifying code.
---

# Task List Reviewer Expert (Gemini)

Provide a critical review of a task list document. Do not make code changes.

## Workflow
1) Identify the task list path (ask if missing).
2) Read the task list and skim related repo context:
   - `AGENTS.md`
   - `docs/decisions.md`
   - `docs/testing.md`
3) Evaluate for:
   - Clear priority ordering (P0–P3)
   - Dependencies and sequencing risks
   - Acceptance criteria / Definition of Done
   - Test gates and verification steps
   - Missing checkpoints or progress tracking
4) Produce a structured review with:
   - Summary (3–6 bullets)
   - Gaps/Risks
   - Suggested adjustments (ordered)
   - Open questions
5) Save feedback to `docs/external-feedback/gemini-task-list-review.md`.

## Output Rules
- Do not modify source code.
- If you must note a change, describe it in the feedback file only.
- Prefer concrete, actionable recommendations.
