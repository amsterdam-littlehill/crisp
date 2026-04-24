#!/usr/bin/env bash
set -euo pipefail

# Smoke Test — 48 项自检脚本
# Usage: bash smoke-test.sh <skill-name>
# 验证 skill 安装后的结构完整性、内容合规性和跨工具一致性

SKILL_NAME="${1:-}"
if [[ -z "$SKILL_NAME" ]]; then
  echo "Usage: bash smoke-test.sh <skill-name>"
  exit 1
fi

SKILL_DIR=".claude/skills/$SKILL_NAME"
ERRORS=0
WARNINGS=0
CHECKS=0

check() {
  local msg="$1"
  local status="${2:-PASS}"
  ((CHECKS++)) || true
  case "$status" in
    PASS)  echo "  ✅ PASS:  $msg" ;;
    WARN)  echo "  ⚠️  WARN:  $msg"; ((WARNINGS++)) || true ;;
    FAIL)  echo "  ❌ FAIL:  $msg"; ((ERRORS++)) || true ;;
  esac
}

echo "== Smoke Test: $SKILL_NAME (48 checks) =="
echo ""

# ===== GROUP 1: 目录结构 (8 checks) =====
echo "[Group 1/6] Directory Structure"
[[ -d "$SKILL_DIR" ]]                           && check "SKILL dir exists"          || check "SKILL dir missing" FAIL
[[ -d "$SKILL_DIR/rules" ]]                     && check "rules/ exists"             || check "rules/ missing" FAIL
[[ -d "$SKILL_DIR/workflows" ]]                 && check "workflows/ exists"         || check "workflows/ missing" FAIL
[[ -d "$SKILL_DIR/references" ]]                && check "references/ exists"        || check "references/ missing" FAIL
[[ -d "$SKILL_DIR/scripts" ]]                   && check "scripts/ exists"           || check "scripts/ missing" FAIL
[[ -d "$SKILL_DIR/assets" ]]                    && check "assets/ exists"            || check "assets/ missing" WARN
[[ -d ".claude/hooks" ]]                        && check "hooks/ exists"             || check "hooks/ missing" FAIL
[[ -d ".claude/skills/shared" ]]                && check "shared/ exists"            || check "shared/ missing" WARN

echo ""

# ===== GROUP 2: 核心文件 (8 checks) =====
echo "[Group 2/6] Core Files"
[[ -f "$SKILL_DIR/SKILL.md" ]]                  && check "SKILL.md exists"           || check "SKILL.md missing" FAIL
[[ -f "$SKILL_DIR/rules/project-rules.md" ]]    && check "project-rules.md"          || check "project-rules.md missing" FAIL
[[ -f "$SKILL_DIR/rules/coding-standards.md" ]] && check "coding-standards.md"       || check "coding-standards.md missing" FAIL
[[ -f "$SKILL_DIR/workflows/fix-bug.md" ]]      && check "fix-bug.md"                || check "fix-bug.md missing" FAIL
[[ -f "$SKILL_DIR/workflows/add-feature.md" ]]  && check "add-feature.md"            || check "add-feature.md missing" FAIL
[[ -f "$SKILL_DIR/workflows/update-rules.md" ]] && check "update-rules.md"           || check "update-rules.md missing" FAIL
[[ -f "$SKILL_DIR/references/gotchas.md" ]]     && check "gotchas.md"                || check "gotchas.md missing" FAIL
[[ -f "$SKILL_DIR/scripts/smoke-test.sh" ]]     && check "smoke-test.sh self-check"  || check "smoke-test.sh missing" FAIL

echo ""

# ===== GROUP 3: SKILL.md 内容合规 (10 checks) =====
echo "[Group 3/6] SKILL.md Content Compliance"

SKILL_LINES=$(wc -l < "$SKILL_DIR/SKILL.md" | tr -d ' ')
if [[ "$SKILL_LINES" -le 100 ]]; then
  check "SKILL.md size: $SKILL_LINES lines (≤100)"
else
  check "SKILL.md size: $SKILL_LINES lines (>100)" WARN
fi

# YAML frontmatter
if head -1 "$SKILL_DIR/SKILL.md" | grep -q '^---$'; then
  check "YAML frontmarker start (---)"
else
  check "YAML frontmatter missing start marker" FAIL
fi

if grep -q '^name:' "$SKILL_DIR/SKILL.md"; then
  check "frontmatter: name field"
else
  check "frontmatter: name field missing" FAIL
fi

if grep -q '^description:' "$SKILL_DIR/SKILL.md"; then
  check "frontmatter: description field"
else
  check "frontmatter: description field missing" FAIL
fi

# Required sections
for section in "Always Read" "Common Tasks" "Known Gotchas" "Core Principles" "Session Discipline"; do
  if grep -q "$section" "$SKILL_DIR/SKILL.md"; then
    check "section: $section"
  else
    check "section: $section missing" FAIL
  fi
done

# Session Discipline has verification sentence
if grep -q "检验" "$SKILL_DIR/SKILL.md" || grep -q "verify" "$SKILL_DIR/SKILL.md"; then
  check "Session Discipline has verification sentence"
else
  check "Session Discipline lacks verification" WARN
fi

echo ""

# ===== GROUP 4: 占位符清理 (4 checks) =====
echo "[Group 4/6] Placeholder Cleanup"

FILL_COUNT=$((grep -rsn '\<!-- FILL:' "$SKILL_DIR/" ".claude/CLAUDE.md" ".cursor/" ".codex/" 2>/dev/null || true) | wc -l | tr -d ' ')
if [[ "$FILL_COUNT" -eq 0 ]]; then
  check "No FILL markers remaining"
else
  check "$FILL_COUNT FILL markers present" WARN
fi

# Use variable concatenation so template replacement doesn't break the grep pattern
LP='{{'
RP='}}'
PLACEHOLDER_COUNT=$((grep -rsn "${LP}NAME${RP}\|${LP}PROJECT${RP}" "$SKILL_DIR/" ".claude/" ".cursor/" ".codex/" 2>/dev/null || true) | wc -l | tr -d ' ')
if [[ "$PLACEHOLDER_COUNT" -eq 0 ]]; then
  check "No placeholder residues"
else
  check "$PLACEHOLDER_COUNT placeholders present" FAIL
fi

# Anti-template compliance: no forbidden files in skill dir
FORBIDDEN=("README.md" "INSTALLATION_GUIDE.md" "CHANGELOG.md" "QUICK_REFERENCE.md")
FORBIDDEN_FOUND=0
for f in "${FORBIDDEN[@]}"; do
  if [[ -f "$SKILL_DIR/$f" ]]; then
    ((FORBIDDEN_FOUND++)) || true
  fi
done
if [[ "$FORBIDDEN_FOUND" -eq 0 ]]; then
  check "No anti-template files in skill dir"
else
  check "$FORBIDDEN_FOUND anti-template files found" WARN
fi

# No session logs in references/
LOG_FILES=$(find "$SKILL_DIR/references/" -name "*session*" -o -name "*log*" -o -name "*debug*" 2>/dev/null | wc -l || echo 0)
if [[ "$LOG_FILES" -eq 0 ]]; then
  check "No session logs in references/"
else
  check "$LOG_FILES log-like files in references/" WARN
fi

echo ""

# ===== GROUP 5: 薄壳一致性 (10 checks) =====
echo "[Group 5/6] Thin Shell Consistency"

SHELLS=(".claude/CLAUDE.md" ".claude/GEMINI.md" ".codex/instructions.md" ".cursor/rules/workflow.mdc")
SHELL_NAMES=("CLAUDE.md" "GEMINI.md" "Codex" "Cursor")

for i in "${!SHELLS[@]}"; do
  shell="${SHELLS[$i]}"
  name="${SHELL_NAMES[$i]}"
  if [[ -f "$shell" ]]; then
    check "$name shell exists"

    # Check size <= 60 lines
    lines=$(wc -l < "$shell" | tr -d ' ')
    if [[ "$lines" -le 15 ]]; then
      check "$name shell: $lines lines (≤15 — ideal)"
    elif [[ "$lines" -le 60 ]]; then
      check "$name shell: $lines lines (≤60 — acceptable)"
    else
      check "$name shell: $lines lines (>60)" WARN
    fi

    # Check has Quick Routing table
    if grep -q "Quick Routing" "$shell"; then
      check "$name has Quick Routing"
    else
      check "$name missing Quick Routing" WARN
    fi

    # Check has Red Flags
    if grep -q "Red Flags" "$shell"; then
      check "$name has Red Flags"
    else
      check "$name missing Red Flags" WARN
    fi
  else
    check "$name shell missing" WARN
  fi
done

echo ""

# ===== GROUP 6: 路由完整性 (8 checks) =====
echo "[Group 6/6] Routing Integrity"

# Check all referenced workflow files exist
while IFS= read -r line; do
  if [[ "$line" =~ workflows/([a-z0-9-]+)\.md ]]; then
    WF="${BASH_REMATCH[1]}"
    [[ -f "$SKILL_DIR/workflows/$WF.md" ]] && check "workflow/$WF.md exists" || check "workflow/$WF.md referenced but missing" FAIL
  fi
  if [[ "$line" =~ rules/([a-z0-9-]+)\.md ]]; then
    RULE="${BASH_REMATCH[1]}"
    [[ -f "$SKILL_DIR/rules/$RULE.md" ]] && check "rules/$RULE.md exists" || check "rules/$RULE.md referenced but missing" FAIL
  fi
done < "$SKILL_DIR/SKILL.md"

# Check Common Tasks has fallback entry
if grep -q "Other / unlisted\|Other/unlisted\|other / unlisted" "$SKILL_DIR/SKILL.md"; then
  check "Common Tasks has fallback entry"
else
  check "Common Tasks missing fallback" WARN
fi

# Check gotchas.md is mostly empty (should only have FILL markers or comments)
# Count non-empty, non-comment, non-FILL lines
GOTCHAS_CONTENT=$(grep -v '^#' "$SKILL_DIR/references/gotchas.md" | grep -v '^\s*$' | grep -vi 'FILL\|empty\|start empty\|natural accumulation' | wc -l || echo 0)
if [[ "$GOTCHAS_CONTENT" -le 2 ]]; then
  check "gotchas.md is near-empty (as intended)"
else
  check "gotchas.md has $GOTCHAS_CONTENT non-comment lines — consider if pre-fabricated" WARN
fi

echo ""
echo "== Summary =="
echo "Checks: $CHECKS, Errors: $ERRORS, Warnings: $WARNINGS"

if [[ "$ERRORS" -gt 0 ]]; then
  echo "❌ FAILED — fix errors before using this skill"
  exit 1
elif [[ "$WARNINGS" -gt 0 ]]; then
  echo "⚠️  PASSED with warnings — review warnings for best practices"
  exit 0
else
  echo "✅ ALL CLEAR — skill passes all checks"
  exit 0
fi
