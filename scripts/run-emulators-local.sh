#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ -f "functions/.env.local" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "functions/.env.local"
  set +a
fi

firebase emulators:start --only auth,firestore,functions,storage
