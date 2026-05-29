#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Support global Playwright installs (brew/npm global)
if [[ -z "${NODE_PATH:-}" ]]; then
  NODE_PATH="$(npm root -g 2>/dev/null || true)"
  export NODE_PATH
fi

cd "$ROOT_DIR"
node "$SCRIPT_DIR/deploy-regression-check.cjs" "$@"
