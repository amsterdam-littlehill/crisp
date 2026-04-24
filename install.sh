#!/usr/bin/env bash
set -euo pipefail

# Context-Router Protocol (CRP) Installer
# Thin wrapper around crp-setup.py init
# Usage: bash install.sh --skill <name> [--project <project-name>] [--shadow] [--dry-run]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Forward all arguments to crp-setup.py init
python "$SCRIPT_DIR/scripts/crp-setup.py" init "$@"
