#!/usr/bin/env bash
# Development-only preflight. Source common.sh first.
check_development_environment() {
  local backend_port="$1" port
  if [[ ! -r "$project_root/gradlew" ]]; then
    echo "Gradle wrapper is missing or unreadable: $project_root/gradlew" >&2
    return 1
  fi
  if [[ ! -f "$project_root/frontend/node_modules/vite/bin/vite.js" ]]; then
    echo "Frontend dependencies are missing." >&2
    echo "Run: cd frontend && npm ci --include=optional" >&2
    return 1
  fi
  if ! (cd "$project_root/frontend" && node --input-type=module -e "await import('vite')"); then
    echo "Frontend dependencies cannot run on this machine." >&2
    echo "Reinstall frontend/node_modules locally with npm ci --include=optional; keep package-lock.json." >&2
    return 1
  fi
  if [[ -z "${DB_URL:-}" ]] && ! port_is_open 5432; then
    echo "PostgreSQL is not reachable on 127.0.0.1:5432." >&2
    echo "Start it with: podman start blufftable-db" >&2
    return 1
  fi
  if [[ "$backend_port" == 5173 ]]; then
    echo "PORT 5173 is reserved for Vite. Choose a different backend port." >&2
    return 1
  fi
  for port in "$backend_port" 5173; do
    if port_is_open "$port"; then
      echo "Port $port is already occupied. Stop the existing server before starting another pair." >&2
      return 1
    fi
  done
}
