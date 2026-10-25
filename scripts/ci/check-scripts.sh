#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/../lib/common.sh"
require_commands bash node
cd "$project_root"
bash -n gradlew
while IFS= read -r -d '' script; do bash -n "$script"; done < <(find scripts -type f -name '*.sh' -print0)
while IFS= read -r -d '' script; do node --check "$script"; done < <(find scripts -type f -name '*.mjs' -print0)
for suite in scripts/tests/*.test.mjs; do node "$suite"; done
