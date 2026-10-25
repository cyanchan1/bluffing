#!/usr/bin/env bash
set -euo pipefail

# Stable entry point; implementation and reusable helpers live below scripts/.
exec bash "$(dirname "${BASH_SOURCE[0]}")/dev/start.sh" "$@"
