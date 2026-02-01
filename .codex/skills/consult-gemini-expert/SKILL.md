---
name: consult-gemini-expert
description: Run a headless Gemini review of a plan/document and capture feedback without changing code. Use when a long-running task needs external critique before execution.
---

# Consult Gemini Expert

Create a read-only request to Gemini for plan review. Do not make repo changes based on this skill alone.

## Steps
1) Read the plan doc path and optional extra instructions.
2) Run `.codex/skills/consult-gemini-expert/scripts/consult_gemini.sh <plan-doc-path> "<optional instructions>"` from the repo root to generate a prompt and (if configured) send a headless request. Allow **at least 5 minutes** before timing out.
3) If the CLI is unavailable, save the prompt and ask the user to run it externally, then paste the response.
4) Store Gemini feedback in `docs/external-feedback/gemini-response.md`.
5) Summarize any actionable guidance and add it to the plan/task list as needed.
