#!/usr/bin/env bash
set -euo pipefail

# Context-Router Protocol (CRP) Installer
# Thin wrapper around crp-setup.py init
# Usage: bash install.sh --skill <name> [--project <project-name>] [--shadow] [--dry-run]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Forward all arguments to crp-setup.py init
python "$SCRIPT_DIR/scripts/crp-setup.py" init "$@"

# Skip sync during dry-run (no files were actually created)
if [[ "$*" != *"--dry-run"* ]]; then
    # Regenerate shells from SKILL.md so installed proxies match generator output
    python "$SCRIPT_DIR/scripts/crp-setup.py" sync
fi
