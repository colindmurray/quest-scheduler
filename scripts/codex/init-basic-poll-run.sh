#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

"${script_dir}/init-plan-run.sh" \
  --plan-id basic-poll \
  --plan-doc docs/basic-poll.md \
  --tasks-doc docs/basic-poll-tasks.md \
  "$@"
