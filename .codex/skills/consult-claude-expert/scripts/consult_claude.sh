#!/usr/bin/env bash
set -euo pipefail

DOC_PATH="${1:-}"
EXTRA="${2:-}"

if [[ -z "$DOC_PATH" || ! -f "$DOC_PATH" ]]; then
  echo "Missing or invalid plan doc path: $DOC_PATH" >&2
  exit 1
fi

OUT_DIR="docs/external-feedback"
mkdir -p "$OUT_DIR"
PROMPT_FILE="$OUT_DIR/claude-request.md"
RESPONSE_FILE="$OUT_DIR/claude-response.md"

cat > "$PROMPT_FILE" <<EOF_PROMPT
You are Claude Code.

Please review the plan document at: $DOC_PATH

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
${EXTRA:-"(none)"}

Output format:
1) Summary (3-6 bullets)
2) Gaps / Risks (bullets)
3) Suggested adjustments (ordered list)
4) Open questions (if any)
EOF_PROMPT

if [[ -n "${CLAUDE_CMD:-}" ]]; then
  bash -lc "${CLAUDE_CMD}" < "$PROMPT_FILE" > "$RESPONSE_FILE"
  echo "Saved Claude response to $RESPONSE_FILE"
  exit 0
fi

if [[ -x "/home/colin/.claude/local/claude" ]]; then
  if command -v timeout >/dev/null 2>&1; then
    timeout 600 /home/colin/.claude/local/claude --dangerously-skip-permissions -p "$(cat "$PROMPT_FILE")" > "$RESPONSE_FILE"
  else
    /home/colin/.claude/local/claude --dangerously-skip-permissions -p "$(cat "$PROMPT_FILE")" > "$RESPONSE_FILE"
  fi
  echo "Saved Claude response to $RESPONSE_FILE"
  exit 0
fi

if command -v claude >/dev/null 2>&1; then
  if command -v timeout >/dev/null 2>&1; then
    timeout 600 claude --dangerously-skip-permissions -p "$(cat "$PROMPT_FILE")" > "$RESPONSE_FILE"
  else
    claude --dangerously-skip-permissions -p "$(cat "$PROMPT_FILE")" > "$RESPONSE_FILE"
  fi
  echo "Saved Claude response to $RESPONSE_FILE"
  exit 0
fi

cat >&2 <<EOF_ERR
No headless Claude command found.
- Set CLAUDE_CMD to a headless invocation, or
- Install a CLI named 'claude' in PATH.
Prompt saved to: $PROMPT_FILE
Save response to: $RESPONSE_FILE
EOF_ERR
exit 2
