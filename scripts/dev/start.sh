#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/../lib/common.sh"
source "$project_root/scripts/lib/processes.sh"
source "$project_root/scripts/lib/development.sh"
tailnet=false
backend_pid=""
frontend_pid=""
backend_port="${PORT:-8080}"
startup_timeout="${BLUFF_STARTUP_TIMEOUT:-120}"

usage() {
  cat <<'EOF'
Usage: ./scripts/start-dev.sh [--tailnet]

Starts the Spring Boot backend and Vite frontend together.

  --tailnet  Also configure private HTTPS access with Tailscale Serve.
  --help     Show this help.

Starts the backend first; Vite opens only after its health check succeeds.
PostgreSQL must already be running (localhost:5432 unless DB_URL is set).
PORT overrides the backend port; BLUFF_STARTUP_TIMEOUT defaults to 120 seconds.
Press Ctrl+C to stop both development servers.
EOF
}

for argument in "$@"; do
  case "$argument" in
    --tailnet) tailnet=true ;;
    --help|-h) usage; exit 0 ;;
    *) echo "Unknown argument: $argument" >&2; usage >&2; exit 2 ;;
  esac
done

cleanup() {
  echo
  echo "Stopping Bluff Table development servers..."
  stop_managed_processes
}

require_commands java node curl setsid timeout
validate_port "$backend_port" PORT
backend_port=$((10#$backend_port))
backend_url="http://127.0.0.1:$backend_port"
if [[ ! "$startup_timeout" =~ ^[1-9][0-9]{0,3}$ ]]; then
  echo "BLUFF_STARTUP_TIMEOUT must be a positive number of seconds (at most 9999)." >&2
  exit 1
fi

check_development_environment "$backend_port"

if [[ "$tailnet" == true ]]; then
  bash "$project_root/scripts/network/tailscale.sh" --check
fi

trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

echo "Starting Spring Boot on $backend_url ..."
(cd "$project_root" && exec setsid bash ./gradlew --console=plain :server:bootRun) &
backend_pid=$!
managed_pids+=("$backend_pid")
wait_for_url "Spring Boot" "$backend_url/api/health" "$backend_pid" "$startup_timeout"

echo "Starting Vite on http://127.0.0.1:5173 ..."
# Run entry points through their interpreters so a copied executable bit cannot
# break startup, and keep both frontend API paths aligned with the local server.
(cd "$project_root/frontend" && export BLUFF_BACKEND_URL="$backend_url" VITE_LOCAL_API_URL="$backend_url" && exec setsid node ./node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5173 --strictPort) &
frontend_pid=$!
managed_pids+=("$frontend_pid")
wait_for_url "Vite" "http://127.0.0.1:5173/" "$frontend_pid" "$startup_timeout" "$backend_pid"

echo
echo "Bluff Table is ready locally: http://127.0.0.1:5173/"

if [[ "$tailnet" == true ]]; then
  bash "$project_root/scripts/network/tailscale.sh"
fi

echo
echo "Press Ctrl+C to stop the backend and frontend."
set +e
wait -n "$backend_pid" "$frontend_pid"
exit_code=$?
set -e
echo "A development server exited unexpectedly with status $exit_code. See its output above." >&2
if ((exit_code == 0)); then exit_code=1; fi
exit "$exit_code"
