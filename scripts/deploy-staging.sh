#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f "web/.env.staging" ]]; then
  echo "Missing web/.env.staging. Create it before deploying staging." >&2
  exit 1
fi

DEPLOY_ONLY="${DEPLOY_ONLY:-hosting,firestore,storage}"
PROJECT_ALIAS="${FIREBASE_PROJECT:-staging}"

echo "Deploying staging (project: ${PROJECT_ALIAS}) with VITE_BUILD_MODE=staging"
VITE_BUILD_MODE=staging firebase deploy --project "${PROJECT_ALIAS}" --only "${DEPLOY_ONLY}"
