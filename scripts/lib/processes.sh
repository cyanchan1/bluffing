#!/usr/bin/env bash
# Register only children owned by this invocation; never stop an existing server.
managed_pids=()

stop_managed_processes() {
  trap - EXIT
  trap '' INT TERM
  local process_id deadline still_running
  for process_id in "${managed_pids[@]}"; do
    kill -TERM -- "-$process_id" 2>/dev/null || kill -TERM "$process_id" 2>/dev/null || true
  done
  deadline=$((SECONDS + 8))
  while ((SECONDS < deadline)); do
    still_running=false
    for process_id in "${managed_pids[@]}"; do
      if kill -0 -- "-$process_id" 2>/dev/null || kill -0 "$process_id" 2>/dev/null; then
        still_running=true
      fi
    done
    [[ "$still_running" == true ]] || break
    sleep 0.1
  done
  for process_id in "${managed_pids[@]}"; do
    kill -KILL -- "-$process_id" 2>/dev/null || kill -KILL "$process_id" 2>/dev/null || true
    wait "$process_id" 2>/dev/null || true
  done
}

check_running() {
  local name="$1" process_id="$2" exit_code=0
  if ! kill -0 "$process_id" 2>/dev/null; then
    wait "$process_id" || exit_code=$?
    echo "$name stopped with status $exit_code before startup completed. See its output above." >&2
    return 1
  fi
}

wait_for_url() {
  local name="$1" url="$2" process_id="$3" startup_timeout="$4" guard_pid="${5:-}"
  local deadline=$((SECONDS + startup_timeout))
  while ((SECONDS < deadline)); do
    check_running "$name" "$process_id" || return 1
    if [[ -n "$guard_pid" ]]; then check_running "Spring Boot" "$guard_pid" || return 1; fi
    if curl --noproxy '*' --connect-timeout 1 --max-time 2 --fail --silent --output /dev/null "$url"; then
      return 0
    fi
    sleep 1
  done
  echo "Timed out after $startup_timeout seconds waiting for $name at $url. See its output above." >&2
  return 1
}
