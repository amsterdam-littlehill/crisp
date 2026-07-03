#!/usr/bin/env bash
set -euo pipefail

# Context-Router Protocol (CRP) Installer
# Thin wrapper around `crp init`
# Usage: bash install.sh [--project <project-name>] [--description <text>] [--dry-run]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Forward all arguments to crp init via bun
bun run "$SCRIPT_DIR/src/cli.ts" init "$@"

# Skip sync during dry-run (no files were actually created)
if [[ "$*" != *"--dry-run"* ]]; then
    # Regenerate shells from SKILL.md so installed proxies match generator output
    bun run "$SCRIPT_DIR/src/cli.ts" sync
fi
