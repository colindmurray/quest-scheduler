---
created: 2026-01-31
lastUpdated: 2026-01-31
summary: "Archived historical task list snapshot from the 2026-01-31 transition window."
category: TASK_TRACKER
status: OBSOLETE
implementationStatus: DEPRECATED
note: "Archive-only tracker superseded by newer planning cycles; not for active execution."
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
- 2026-01-31: Moved expert review out of execution skill; /execute-plan now owns doc/task-list review before running plan.
- 2026-01-31: Generated external review prompts for Claude/Gemini (plan + task list) in `docs/external-feedback/`; awaiting responses due to missing consult scripts.
- 2026-01-31: Ran Claude/Gemini reviews for plan + task list; saved responses in `docs/external-feedback/`.
- 2026-01-31: Vetted expert feedback against current codebase and updated the notification overhaul plan + execution task list accordingly.
- 2026-01-31: Set notification retention decision to delete dismissed notifications after 20 days; updated plan + task list.
- 2026-01-31: Updated Claude consult script to detect /home/colin/.claude/local/claude and run headless with -p.
- 2026-01-31: Updated /execute-plan prompt to delete external-feedback request/response artifacts after expert review unless retention requested.
- 2026-01-31: Added 10-minute timeout allowance for expert consult scripts to avoid premature termination.
- 2026-01-31: Updated consult scripts to run Claude with --dangerously-skip-permissions and Gemini with --yolo.
- 2026-01-31: Added review-expert-feedback skill and wired /execute-plan to invoke it after expert reviews.
- 2026-01-31: Added review-expert-feedback skill and noted 5+ minute allowance in consult skill instructions; wired execute-plan to run the new skill after expert reviews.
- 2026-01-31: Added pragmatic delivery priorities (avoid YAGNI, cost-aware, ship robust features) to CLAUDE.md and GEMINI.md.
- 2026-01-31: Deleted docs/plan-execution/unified-notification-overhaul-task-list.md per request.
