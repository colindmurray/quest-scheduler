#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/web/.env.e2e.local"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

NODE_OPTIONS="${NODE_OPTIONS:-}"
if [[ "$NODE_OPTIONS" != *"--no-deprecation"* ]]; then
  export NODE_OPTIONS="${NODE_OPTIONS} --no-deprecation"
fi
export NODE_NO_WARNINGS=1

FILTER_PATTERN='Application Default Credentials detected|following emulators are not running|outdated version of firebase-functions|Loaded environment variables|Trying to access secret|callable-request-verification|DeprecationWarning: The `punycode` module|trace-deprecation|NO_COLOR|Using node@|Serving at port'

PLAYWRIGHT_CMD=(npm --prefix "$ROOT_DIR/web" run test:e2e)
if [[ "$#" -gt 0 ]]; then
  PLAYWRIGHT_CMD+=(-- "$@")
fi
printf -v PLAYWRIGHT_CMD_ESCAPED '%q ' "${PLAYWRIGHT_CMD[@]}"

firebase emulators:exec --only auth,firestore,functions,storage --log-verbosity SILENT \
  "node \"$ROOT_DIR/functions/scripts/seed-e2e-scheduler.js\" && ${PLAYWRIGHT_CMD_ESCAPED}" \
  2>&1 | sed -E "/$FILTER_PATTERN/d"
