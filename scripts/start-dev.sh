#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
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
  trap - EXIT
  trap '' INT TERM
  echo
  echo "Stopping Bluff Table development servers..."
  local process_id deadline
  for process_id in "$frontend_pid" "$backend_pid"; do
    [[ -z "$process_id" ]] || kill -TERM -- "-$process_id" 2>/dev/null || kill -TERM "$process_id" 2>/dev/null || true
  done
  deadline=$((SECONDS + 8))
  while ((SECONDS < deadline)); do
    local still_running=false
    for process_id in "$frontend_pid" "$backend_pid"; do
      if [[ -n "$process_id" ]] && { kill -0 -- "-$process_id" 2>/dev/null || kill -0 "$process_id" 2>/dev/null; }; then
        still_running=true
      fi
    done
    [[ "$still_running" == true ]] || break
    sleep 0.1
  done
  for process_id in "$frontend_pid" "$backend_pid"; do
    [[ -z "$process_id" ]] || kill -KILL -- "-$process_id" 2>/dev/null || kill -KILL "$process_id" 2>/dev/null || true
  done
  [[ -z "$frontend_pid" ]] || wait "$frontend_pid" 2>/dev/null || true
  [[ -z "$backend_pid" ]] || wait "$backend_pid" 2>/dev/null || true
}

for required_command in java node curl setsid timeout; do
  if ! command -v "$required_command" >/dev/null 2>&1; then
    echo "Required command not found: $required_command" >&2
    exit 1
  fi
done

if [[ ! "$backend_port" =~ ^[0-9]{1,5}$ ]] || ((10#$backend_port < 1 || 10#$backend_port > 65535)); then
  echo "PORT must be a number between 1 and 65535." >&2
  exit 1
fi
backend_port=$((10#$backend_port))
backend_url="http://127.0.0.1:$backend_port"
if [[ ! "$startup_timeout" =~ ^[1-9][0-9]{0,3}$ ]]; then
  echo "BLUFF_STARTUP_TIMEOUT must be a positive number of seconds (at most 9999)." >&2
  exit 1
fi

if [[ ! -r "$project_root/gradlew" ]]; then
  echo "Gradle wrapper is missing or unreadable: $project_root/gradlew" >&2
  exit 1
fi

if [[ ! -f "$project_root/frontend/node_modules/vite/bin/vite.js" ]]; then
  echo "Frontend dependencies are missing." >&2
  echo "Run: cd frontend && npm ci --include=optional" >&2
  exit 1
fi

# Import the actual runtime to catch wrong-platform or missing native bindings
# before booting Spring. node_modules must be installed on this machine.
if ! (cd "$project_root/frontend" && node --input-type=module -e "await import('vite')"); then
  echo "Frontend dependencies cannot run on this machine." >&2
  echo "Reinstall frontend/node_modules locally with npm ci --include=optional; keep package-lock.json." >&2
  exit 1
fi

if [[ -z "${DB_URL:-}" ]] && ! (exec 3<>/dev/tcp/127.0.0.1/5432) 2>/dev/null; then
  echo "PostgreSQL is not reachable on 127.0.0.1:5432." >&2
  echo "Start it with: podman start blufftable-db" >&2
  exit 1
fi

for port in "$backend_port" 5173; do
  if (exec 3<>/dev/tcp/127.0.0.1/"$port") 2>/dev/null; then
    echo "Port $port is already occupied. Stop the existing server before starting another pair." >&2
    exit 1
  fi
done
if [[ "$backend_port" == 5173 ]]; then
  echo "PORT 5173 is reserved for Vite. Choose a different backend port." >&2
  exit 1
fi

if [[ "$tailnet" == true ]]; then
  bash "$project_root/scripts/tailscale-serve.sh" --check
fi

check_running() {
  local name="$1" process_id="$2" exit_code=0
  if ! kill -0 "$process_id" 2>/dev/null; then
    wait "$process_id" || exit_code=$?
    echo "$name stopped with status $exit_code before startup completed. See its output above." >&2
    return 1
  fi
}

wait_for_url() {
  local name="$1"
  local url="$2"
  local process_id="$3"
  local deadline=$((SECONDS + startup_timeout))
  while ((SECONDS < deadline)); do
    check_running "$name" "$process_id" || return 1
    check_running "Spring Boot" "$backend_pid" || return 1
    if curl --noproxy '*' --connect-timeout 1 --max-time 2 --fail --silent --output /dev/null "$url"; then
      return 0
    fi
    sleep 1
  done
  echo "Timed out after $startup_timeout seconds waiting for $name at $url. See its output above." >&2
  return 1
}

trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

echo "Starting Spring Boot on $backend_url ..."
(cd "$project_root" && exec setsid bash ./gradlew --console=plain :server:bootRun) &
backend_pid=$!
wait_for_url "Spring Boot" "$backend_url/api/health" "$backend_pid"

echo "Starting Vite on http://127.0.0.1:5173 ..."
# Run entry points through their interpreters so a copied executable bit cannot
# break startup, and keep both frontend API paths aligned with the local server.
(cd "$project_root/frontend" && export BLUFF_BACKEND_URL="$backend_url" VITE_LOCAL_API_URL="$backend_url" && exec setsid node ./node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5173 --strictPort) &
frontend_pid=$!
wait_for_url "Vite" "http://127.0.0.1:5173/" "$frontend_pid"

echo
echo "Bluff Table is ready locally: http://127.0.0.1:5173/"

if [[ "$tailnet" == true ]]; then
  bash "$project_root/scripts/tailscale-serve.sh"
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
