---
name: consult-claude-expert
description: Run a headless Claude review of a plan/document and capture feedback without changing code. Use when a long-running task needs external critique before execution.
---

# Consult Claude Expert

Create a read-only request to Claude for plan review. Do not make repo changes based on this skill alone.

## Steps
1) Read the plan doc path and optional extra instructions.
2) Run `.codex/skills/consult-claude-expert/scripts/consult_claude.sh <plan-doc-path> "<optional instructions>"` from the repo root to generate a prompt and (if configured) send a headless request. Allow **at least 5 minutes** before timing out.
3) If the CLI is unavailable, save the prompt and ask the user to run it externally, then paste the response.
4) Store Claude feedback in `docs/external-feedback/claude-response.md`.
5) Summarize any actionable guidance and add it to the plan/task list as needed.
