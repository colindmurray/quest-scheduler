#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

DEPLOY_ONLY="${DEPLOY_ONLY:-hosting,firestore,storage}"
PROJECT_ALIAS="${FIREBASE_PROJECT:-default}"

echo "Deploying production (project: ${PROJECT_ALIAS}) with VITE_BUILD_MODE=production"
VITE_BUILD_MODE=production firebase deploy --project "${PROJECT_ALIAS}" --only "${DEPLOY_ONLY}"
