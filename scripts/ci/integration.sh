#!/usr/bin/env bash
set -euo pipefail

# Deliberately requires a disposable database. Never reuse start-dev's live DB defaults.
[[ "${QA_DATABASE:-}" =~ ^blufftable_[a-zA-Z0-9_]*qa$ ]] || {
  echo 'Set QA_DATABASE to an explicit disposable blufftable_*qa database.' >&2
  exit 2
}
source "$(dirname "${BASH_SOURCE[0]}")/../lib/common.sh"
source "$project_root/scripts/lib/processes.sh"
cd "$project_root"
jar_path="${1:-server/build/libs/bluff-table.jar}"
[[ -f "$jar_path" ]] || { echo "Build the server jar first: $jar_path" >&2; exit 2; }
export PORT=8181 QA_ORIGIN=http://127.0.0.1:8181
export DB_URL="jdbc:postgresql://127.0.0.1:${PGPORT:-5432}/$QA_DATABASE"
export DB_USERNAME="${PGUSER:-blufftable}" DB_PASSWORD="${PGPASSWORD:-blufftable}"
require_commands java node curl setsid
validate_port "${PGPORT:-5432}" PGPORT
if port_is_open 8181; then
  echo 'Port 8181 is already in use; refusing to run against an existing backend.' >&2
  exit 2
fi

node scripts/ci/migration.mjs
mkdir -p server/build/ci
setsid java -jar "$jar_path" > server/build/ci/backend.log 2>&1 &
backend_pid=$!
managed_pids+=("$backend_pid")
trap stop_managed_processes EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
if ! wait_for_url 'Integration backend' "$QA_ORIGIN/api/health" "$backend_pid" 90; then
  tail -n 100 server/build/ci/backend.log >&2
  exit 1
fi
node scripts/ci/smoke.mjs
if [[ "${QA_SKIP_BROWSER:-false}" != true ]]; then
  npm --prefix frontend run test:e2e
fi
