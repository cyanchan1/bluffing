#!/usr/bin/env bash
# Sourced helpers only: no services, traps, or configuration changes on import.

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

require_commands() {
  local command_name
  for command_name in "$@"; do
    if ! command -v "$command_name" >/dev/null 2>&1; then
      echo "Required command not found: $command_name" >&2
      return 1
    fi
  done
}

validate_port() {
  local value="$1" label="${2:-Port}"
  if [[ ! "$value" =~ ^[0-9]{1,5}$ ]] || ((10#$value < 1 || 10#$value > 65535)); then
    echo "$label must be a number between 1 and 65535." >&2
    return 1
  fi
}

port_is_open() {
  (exec 3<>/dev/tcp/127.0.0.1/"$1") 2>/dev/null
}
