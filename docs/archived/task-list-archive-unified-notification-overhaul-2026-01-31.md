---
created: 2026-01-31
lastUpdated: 2026-01-31
summary: "Archived task list entries for unified-notification-overhaul planning transitions."
category: TASK_TRACKER
status: OBSOLETE
implementationStatus: DEPRECATED
note: "Historical archive preserved for process traceability; not active planning state."
changelog:
  - "2026-01-31: Improve invite flows, notifications, and tests"
---

> [!WARNING]
> This document is **obsolete/deprecated** and retained for historical context only. Do not use it to drive active implementation decisions.

# Quest Scheduler — Task List

## Test Plan Execution Checkpoint
- Last Completed: n/a
- Next Step: n/a
- Open Issues: None
- Last Updated (YYYY-MM-DD): 2026-01-31

## Progress Notes
- 2026-01-31: Reordered /execute-plan steps so expert reviews run immediately after task-list archive, before creating a plan-specific task list.
- 2026-01-31: Made /execute-plan explicit about invoking consult-claude-expert and consult-gemini-expert and waiting for both to complete.
- 2026-01-31: Updated /execute-plan to allow running consult skills in parallel (background terminal) and wait for both to finish.
- 2026-01-31: Relaxed /execute-plan note to allow web research freely as needed (prefer official docs for OpenAI/Codex).
- 2026-01-31: Clarified execute-plan and consult skill instructions to use explicit consult script paths under .codex/skills.
