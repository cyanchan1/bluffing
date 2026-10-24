#!/usr/bin/env bash
set -euo pipefail
umask 077

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
database="blufftable"
db_user="blufftable"
db_host="127.0.0.1"
db_port="5432"
backend_port="8080"
container=""
runtime=""
source_mode=""
backup_path=""
dry_run=false

usage() {
  cat <<'HELP'
Usage: ./scripts/clear-database.sh (--container NAME | --local) [options]

Clear Bluff Table application data, keeping its schema and Flyway history.
Stop the backend first. A full database backup and typed confirmation are required.

  --container NAME    Use PostgreSQL inside an existing container
  --runtime NAME      podman or docker (auto-detect if omitted)
  --local             Use installed psql and pg_dump; password via PGPASSWORD
  --database NAME     Exact target database (default: blufftable)
  --user NAME         Database user (default: blufftable)
  --host HOST         Local mode database host (default: 127.0.0.1)
  --port PORT         Local mode database port (default: 5432)
  --backend-port PORT Backend listener to check is stopped (default: 8080)
  --backup PATH       New backup file; refuses overwrite (default: .backups/...dump)
  --dry-run           Show the plan without connecting, backing up, or clearing
  --help              Show this help

Deletes accounts, rooms, balances, leaderboards and skin ownership. No automatic
"yes" flag is provided. DB_URL is not used: choose the target explicitly above.
HELP
}
die() { echo "Error: $*" >&2; exit 1; }
value() { [[ $# -ge 2 && -n "$2" ]] || die "Missing value for $1"; }
while (($#)); do
  case "$1" in
    --container) value "$@"; [[ -z "$source_mode" ]] || die "Choose one connection mode"; source_mode=container; container="$2"; shift 2 ;;
    --local) [[ -z "$source_mode" ]] || die "Choose one connection mode"; source_mode=local; shift ;;
    --runtime) value "$@"; runtime="$2"; shift 2 ;;
    --database) value "$@"; database="$2"; shift 2 ;;
    --user) value "$@"; db_user="$2"; shift 2 ;;
    --host) value "$@"; db_host="$2"; shift 2 ;;
    --port) value "$@"; db_port="$2"; shift 2 ;;
    --backend-port) value "$@"; backend_port="$2"; shift 2 ;;
    --backup) value "$@"; backup_path="$2"; shift 2 ;;
    --dry-run) dry_run=true; shift ;;
    --help|-h) usage; exit 0 ;;
    *) die "Unknown option: $1" ;;
  esac
done
[[ -n "$source_mode" ]] || { usage >&2; exit 2; }
[[ "$database" =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ ]] || die "Use a simple, explicit database name"
[[ ! "$database" =~ ^(postgres|template0|template1)$ ]] || die "Refusing a system database"
[[ "$db_user" =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ ]] || die "Invalid database user"
[[ "$db_port" =~ ^[0-9]{1,5}$ && "$backend_port" =~ ^[0-9]{1,5}$ ]] || die "Invalid port"
((10#$db_port > 0 && 10#$db_port <= 65535 && 10#$backend_port > 0 && 10#$backend_port <= 65535)) || die "Invalid port"
[[ -z "$runtime" || "$runtime" == podman || "$runtime" == docker ]] || die "Runtime must be podman or docker"
if [[ "$source_mode" == container ]]; then
  [[ "$container" =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]*$ ]] || die "Invalid container name"
  echo "Target: database '$database' in container '$container', user '$db_user'"
else
  echo "Target: database '$database' at '$db_host:$db_port', user '$db_user'"
fi
echo "Clears: accounts, rooms, memberships, balances, win records, personal and legacy skins."
echo "Keeps: schema, migrations, and a full backup. Backend port $backend_port must be stopped."
if [[ "$dry_run" == true ]]; then echo "Dry run only. No connection or changes made."; exit 0; fi
if (exec 3<>/dev/tcp/127.0.0.1/"$backend_port") 2>/dev/null; then
  die "Port $backend_port is listening. Stop the backend before clearing its database"
fi
if [[ "$source_mode" == container ]]; then
  if [[ -z "$runtime" ]]; then
    if command -v podman >/dev/null; then runtime=podman
    elif command -v docker >/dev/null; then runtime=docker
    else die "Install podman/docker or use --local"; fi
  fi
  command -v "$runtime" >/dev/null || die "$runtime is not installed"
  "$runtime" inspect "$container" >/dev/null
  sql=("$runtime" exec -i "$container" psql -X --set=ON_ERROR_STOP=1 -U "$db_user" -d "$database")
  dump=("$runtime" exec "$container" pg_dump -U "$db_user" -d "$database")
  check_dump=("$runtime" exec -i "$container" pg_restore --list)
else
  command -v psql >/dev/null && command -v pg_dump >/dev/null && command -v pg_restore >/dev/null || die "psql, pg_dump and pg_restore are required"
  sql=(psql -X --set=ON_ERROR_STOP=1 --host "$db_host" --port "$db_port" --username "$db_user" --dbname "$database")
  dump=(pg_dump --host "$db_host" --port "$db_port" --username "$db_user" --dbname "$database")
  check_dump=(pg_restore --list)
fi
actual_database="$("${sql[@]}" -Atc 'SELECT current_database()' </dev/null)"
[[ "$actual_database" == "$database" ]] || die "Database target did not match"
echo "This reset removes ALL application data. Recovery requires restoring the backup."
read -r -p "Type CLEAR $database to confirm (anything else cancels): " confirmation || die "Cancelled"
[[ "$confirmation" == "CLEAR $database" ]] || die "Cancelled; confirmation did not match"
if [[ -z "$backup_path" ]]; then
  mkdir -p "$project_root/.backups"
  backup_path="$project_root/.backups/${database}-$(date +%Y%m%d-%H%M%S)-$$.dump"
fi
[[ ! -e "$backup_path" && ! -L "$backup_path" ]] || die "Backup already exists; refusing overwrite"
(set -o noclobber; "${dump[@]}" --format=custom --no-owner --no-privileges > "$backup_path") || die "Backup failed; database was not cleared (partial backup may remain at $backup_path)"
[[ -s "$backup_path" ]] || die "Empty backup; database was not cleared"
"${check_dump[@]}" < "$backup_path" >/dev/null || die "Backup verification failed; database was not cleared"
echo "Backup saved: $backup_path"
"${sql[@]}" <<'SQL'
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $$
DECLARE targets text;
BEGIN
    IF to_regclass('public.players') IS NULL OR to_regclass('public.rooms') IS NULL
       OR to_regclass('public.flyway_schema_history') IS NULL THEN
        RAISE EXCEPTION 'Not a migrated Bluff Table database; refusing reset';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid()) THEN
        RAISE EXCEPTION 'Other database connections exist. Stop all backends/clients first';
    END IF;
    SELECT string_agg(format('public.%I', name), ', ') INTO targets
    FROM unnest(ARRAY['member_skins','room_skins','room_memberships','rooms','players']) AS t(name)
    WHERE to_regclass('public.' || name) IS NOT NULL;
    -- No CASCADE: unknown referencing tables must cause a safe rollback, not be erased.
    EXECUTE 'TRUNCATE TABLE ' || targets;
END $$;
COMMIT;
SQL
echo "Cleared '$database'. Schema/migrations kept. Backup: $backup_path"
echo "Restart the backend and reload each browser. Device identities will be recreated."
