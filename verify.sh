#!/usr/bin/env bash
# CRISP Post-Fix Verification Script
# Run this after applying all fixes to validate the project.

set -e

echo "==================================="
echo "CRISP Fix Verification Script"
echo "==================================="
echo ""

# 1. Check Bun availability
echo "[1/6] Checking Bun..."
if ! command -v bun &> /dev/null; then
    echo "ERROR: Bun not found. Install from https://bun.sh"
    exit 1
fi
bun --version
echo ""

# 2. Install dependencies
echo "[2/6] Installing dependencies..."
bun install
echo ""

# 3. TypeScript type check
echo "[3/6] Running TypeScript type check..."
if bun run typecheck; then
    echo "PASS: TypeScript compilation successful"
else
    echo "FAIL: TypeScript compilation errors found"
    exit 1
fi
echo ""

# 4. Lint check
echo "[4/6] Running linter..."
if bun run lint; then
    echo "PASS: Linting successful"
else
    echo "FAIL: Linting errors found"
    exit 1
fi
echo ""

# 5. CLI smoke tests
echo "[5/6] Running CLI smoke tests..."

echo "  - Testing --help..."
bun run src/cli.ts --help > /dev/null || { echo "FAIL: --help failed"; exit 1; }

echo "  - Testing --version..."
VERSION_OUTPUT=$(bun run src/cli.ts --version 2>&1)
if echo "$VERSION_OUTPUT" | grep -q "0.5.0"; then
    echo "    PASS: Version is 0.5.0"
else
    echo "    FAIL: Expected version 0.5.0, got: $VERSION_OUTPUT"
    exit 1
fi

echo "  - Testing validate (no crp.yaml)..."
if ! bun run src/cli.ts validate 2>/dev/null; then
    echo "    PASS: validate correctly fails without crp.yaml"
else
    echo "    WARN: validate should fail without crp.yaml"
fi

echo "  - Testing status (no project)..."
bun run src/cli.ts status > /dev/null || true

echo ""

# 6. Quick functional tests with a temp project
echo "[6/6] Running functional tests in temp project..."
TEMP_DIR=$(mktemp -d)
cd "$TEMP_DIR"

echo "  - Init project..."
bun run "$OLDPWD/src/cli.ts" init --project test-project --description "Test project"

echo "  - Validate after init..."
bun run "$OLDPWD/src/cli.ts" validate || { echo "FAIL: validate after init"; exit 1; }

echo "  - Check budget..."
bun run "$OLDPWD/src/cli.ts" check || { echo "FAIL: check after init"; exit 1; }

echo "  - Doctor check..."
bun run "$OLDPWD/src/cli.ts" doctor || true

echo "  - Status check..."
bun run "$OLDPWD/src/cli.ts" status > /dev/null || { echo "FAIL: status"; exit 1; }

echo "  - Sync routes..."
bun run "$OLDPWD/src/cli.ts" sync || { echo "FAIL: sync"; exit 1; }

echo "  - Check after sync..."
bun run "$OLDPWD/src/cli.ts" check || { echo "FAIL: check after sync"; exit 1; }

echo ""
cd "$OLDPWD"
rm -rf "$TEMP_DIR"

echo "==================================="
echo "All verification checks passed!"
echo "==================================="
