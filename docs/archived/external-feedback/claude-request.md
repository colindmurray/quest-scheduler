---
created: 2026-02-11
lastUpdated: 2026-02-11
summary: "Request prompt used to solicit external plan review feedback from Claude."
category: REFERENCE
status: OBSOLETE
note: "One-time review artifact retained for traceability; not an active operating document."
changelog:
  - "2026-02-11: Document present in workspace (no git history available)."
---

> [!WARNING]
> This document is **obsolete/deprecated** and retained for historical context only. Do not use it to drive active implementation decisions.

You are Claude Code.

Please review the plan document at: docs/basic-poll.md

Repo root: /home/colin/Projects/dnd-scheduler

Instructions:
- Do NOT modify any files. Do NOT propose code changes directly.
- Read the plan doc and inspect relevant repo docs/files for context.
- Provide critique focused on gaps, missing steps, ordering, risks, and validation/testing.
- Call out naming inconsistencies, edge cases, and migration hazards.
- Suggest improvements to make execution autonomous and resilient.
- If anything is unclear, ask specific questions.
- Use your 'document-reviewer-expert' skill (or 'task-list-reviewer-expert' if the target is a task list).

Optional additional instructions:
Use your document-reviewer-expert skill and focus on execution ordering, risk controls, validation gates, and gaps that would block autonomous execution.

Output format:
1) Summary (3-6 bullets)
2) Gaps / Risks (bullets)
3) Suggested adjustments (ordered list)
4) Open questions (if any)
