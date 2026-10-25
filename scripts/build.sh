#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

case "${1:-}" in
  --help|-h) echo 'Usage: bash scripts/build.sh — build the backend jar and frontend assets (no database needed).'; exit 0 ;;
  '') ;;
  *) echo 'Usage: bash scripts/build.sh' >&2; exit 2 ;;
esac
if (($# > 1)); then echo 'Too many arguments.' >&2; exit 2; fi
require_commands java node npm
cd "$project_root"
bash ./gradlew --console=plain :server:bootJar
npm --prefix frontend ci --include=optional
npm --prefix frontend run build
echo 'Built: server/build/libs/bluff-table.jar and frontend/dist/'
