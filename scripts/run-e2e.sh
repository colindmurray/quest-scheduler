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

firebase emulators:exec --only auth,firestore,functions,storage \
  "node \"$ROOT_DIR/functions/scripts/seed-e2e-scheduler.js\" && npm --prefix \"$ROOT_DIR/web\" run test:e2e"
