#!/usr/bin/env bash
set -euo pipefail

# Deliberately requires a disposable database. Never reuse start-dev's live DB defaults.
[[ "${QA_DATABASE:-}" =~ ^blufftable_[a-zA-Z0-9_]*qa$ ]] || {
  echo 'Set QA_DATABASE to an explicit disposable blufftable_*qa database.' >&2
  exit 2
}
project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root"
jar_path="${1:-server/build/libs/bluff-table.jar}"
[[ -f "$jar_path" ]] || { echo "Build the server jar first: $jar_path" >&2; exit 2; }
export PORT=8181 QA_ORIGIN=http://127.0.0.1:8181
export DB_URL="jdbc:postgresql://127.0.0.1:${PGPORT:-5432}/$QA_DATABASE"
export DB_USERNAME="${PGUSER:-blufftable}" DB_PASSWORD="${PGPASSWORD:-blufftable}"
if (exec 3<>/dev/tcp/127.0.0.1/8181) 2>/dev/null; then
  echo 'Port 8181 is already in use; refusing to run against an existing backend.' >&2
  exit 2
fi

node scripts/test-migration.mjs
mkdir -p server/build/ci
java -jar "$jar_path" > server/build/ci/backend.log 2>&1 &
backend_pid=$!
cleanup() {
  if kill -0 "$backend_pid" 2>/dev/null; then
    kill "$backend_pid" 2>/dev/null || true
    for ((attempt=0; attempt<20; attempt++)); do
      kill -0 "$backend_pid" 2>/dev/null || break
      sleep 0.25
    done
    kill -KILL "$backend_pid" 2>/dev/null || true
  fi
  wait "$backend_pid" 2>/dev/null || true
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
deadline=$((SECONDS + 90))
until curl --silent --fail --connect-timeout 1 --max-time 2 "$QA_ORIGIN/api/health" >/dev/null; do
  if ! kill -0 "$backend_pid" 2>/dev/null || ((SECONDS >= deadline)); then
    tail -n 100 server/build/ci/backend.log >&2
    echo 'Integration backend did not become ready.' >&2
    exit 1
  fi
  sleep 0.5
done
node scripts/smoke-test.mjs
if [[ "${QA_SKIP_BROWSER:-false}" != true ]]; then
  npm --prefix frontend run test:e2e
fi
