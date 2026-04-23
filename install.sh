#!/usr/bin/env bash
set -euo pipefail

# Context-Router Protocol (CRP) Installer
# Usage: bash install.sh --skill <name> [--project <project-name>] [--shadow] [--dry-run]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_NAME=""
PROJECT_NAME=""
SHADOW_MODE=false
DRY_RUN=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skill) SKILL_NAME="$2"; shift 2 ;;
    --project) PROJECT_NAME="$2"; shift 2 ;;
    --shadow) SHADOW_MODE=true; shift ;;
    --dry-run) DRY_RUN=true; shift ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

# Normalize skill name to kebab-case
SKILL_NAME=$(echo "$SKILL_NAME" | tr '[:upper:]' '[:lower:]' | tr ' ' '-')
# Reject path traversal attempts
if [[ "$SKILL_NAME" == *".."* || "$SKILL_NAME" == *"/"* || -z "$SKILL_NAME" ]]; then
  echo "ERROR: Invalid skill name: $SKILL_NAME"
  exit 1
fi
PROJECT_NAME="${PROJECT_NAME:-$SKILL_NAME}"

if [[ -z "$SKILL_NAME" ]]; then
  echo "Usage: bash install.sh --skill <skill-name> [--project <project-name>] [--shadow] [--dry-run]"
  echo "Example: bash install.sh --skill backend --project my-app"
  exit 1
fi

TARGET_DIR="${TARGET_DIR:-.}"

echo "== Context-Router Protocol (CRP) Installer =="
echo "Skill:   $SKILL_NAME"
echo "Project: $PROJECT_NAME"
echo "Target:  $TARGET_DIR"
if [[ "$SHADOW_MODE" == true ]]; then
  echo "Mode:    SHADOW (non-destructive, appends to existing files)"
fi
if [[ "$DRY_RUN" == true ]]; then
  echo "Mode:    DRY RUN (preview only, no changes)"
fi
echo ""

# Helper: copy with dry-run support
copy_file() {
  local src="$1" dst="$2"
  if [[ "$DRY_RUN" == true ]]; then
    echo "  [DRY RUN] would copy: $src → $dst"
  else
    cp "$src" "$dst"
  fi
}

# Helper: mkdir with dry-run support
make_dir() {
  local dir="$1"
  if [[ "$DRY_RUN" == true ]]; then
    echo "  [DRY RUN] would mkdir: $dir"
  else
    mkdir -p "$dir"
  fi
}

# 1. Copy shells
echo "[1/5] Installing entry proxy shells..."
make_dir "$TARGET_DIR/.claude"
make_dir "$TARGET_DIR/.cursor/rules"
make_dir "$TARGET_DIR/.cursor/skills/$SKILL_NAME"
make_dir "$TARGET_DIR/.codex"

# Install entry shells (shadow mode preserves existing files)
for pair in \
  "$SCRIPT_DIR/templates/shells/CLAUDE.md|$TARGET_DIR/.claude/CLAUDE.md" \
  "$SCRIPT_DIR/templates/shells/GEMINI.md|$TARGET_DIR/.claude/GEMINI.md" \
  "$SCRIPT_DIR/templates/shells/.cursor/rules/workflow.mdc|$TARGET_DIR/.cursor/rules/workflow.mdc" \
  "$SCRIPT_DIR/templates/shells/.codex/instructions.md|$TARGET_DIR/.codex/instructions.md"; do
  src="${pair%|*}"
  dst="${pair#*|}"
  if [[ "$SHADOW_MODE" == true && -f "$dst" ]]; then
    echo "  [SHADOW] preserving existing ${dst##*/}"
  else
    copy_file "$src" "$dst"
  fi
done
# Cursor skill entry is always safe to copy (per-skill)
copy_file "$SCRIPT_DIR/templates/shells/.cursor/skills/{{NAME}}/SKILL.md" "$TARGET_DIR/.cursor/skills/$SKILL_NAME/SKILL.md"

# 2. Copy skill skeleton
echo "[2/5] Installing gateway skeleton..."
make_dir "$TARGET_DIR/.claude/skills/$SKILL_NAME"
make_dir "$TARGET_DIR/.claude/skills/$SKILL_NAME/assets"
make_dir "$TARGET_DIR/.claude/skills/shared"
if [[ "$DRY_RUN" == true ]]; then
  echo "  [DRY RUN] would copy templates/skill/* → $TARGET_DIR/.claude/skills/$SKILL_NAME/"
else
  cp -R "$SCRIPT_DIR/templates/skill/"* "$TARGET_DIR/.claude/skills/$SKILL_NAME/"
fi

# 3. Copy hooks
echo "[3/5] Installing SessionStart hooks..."
make_dir "$TARGET_DIR/.claude/hooks"
if [[ "$DRY_RUN" == true ]]; then
  echo "  [DRY RUN] would copy templates/hooks/* → $TARGET_DIR/.claude/hooks/"
else
  cp -R "$SCRIPT_DIR/templates/hooks/"* "$TARGET_DIR/.claude/hooks/"
fi

# 4. Replace placeholders
echo "[4/5] Replacing placeholders..."
if [[ "$DRY_RUN" == true ]]; then
  echo "  [DRY RUN] would replace {{NAME}} → $SKILL_NAME, {{PROJECT}} → $PROJECT_NAME"
else
  # Cross-platform sed: macOS (BSD) requires -i '' while GNU sed uses -i
  SED_INPLACE=(-i)
  if [[ "$OSTYPE" == "darwin"* ]]; then
    SED_INPLACE=(-i "")
  fi

  find "$TARGET_DIR/.claude" "$TARGET_DIR/.cursor" "$TARGET_DIR/.codex" -type f \
    \( -name "*.md" -o -name "*.mdc" -o -name "*.sh" -o -name "*.json" \) -print0 | \
    while IFS= read -r -d '' file; do
      # Use temp file to preserve symlinks
      tmp="${file}.tmp.$$.$RANDOM"
      sed "s/{{NAME}}/$SKILL_NAME/g; s/{{PROJECT}}/$PROJECT_NAME/g" "$file" > "$tmp"
      mv "$tmp" "$file"
    done
fi

# 5. Report FILL markers
echo ""
echo "[5/5] Checking FILL markers..."
if [[ "$DRY_RUN" == true ]]; then
  echo "  [DRY RUN] skipping FILL check"
else
  FILL_COUNT=$(grep -rn '\<!-- FILL:' "$TARGET_DIR/.claude/skills/$SKILL_NAME/" "$TARGET_DIR/.claude/CLAUDE.md" "$TARGET_DIR/.cursor/" "$TARGET_DIR/.codex/" 2>/dev/null | wc -l || echo 0)

  if [[ "$FILL_COUNT" -gt 0 ]]; then
    echo "⚠️  Found $FILL_COUNT FILL markers that MUST be replaced:"
    grep -rn '\<!-- FILL:' "$TARGET_DIR/.claude/skills/$SKILL_NAME/" "$TARGET_DIR/.claude/CLAUDE.md" "$TARGET_DIR/.cursor/" "$TARGET_DIR/.codex/" 2>/dev/null || true
    echo ""
    echo "👉 Edit these files and replace every FILL marker with your project-specific content."
  else
    echo "✅ No FILL markers remaining."
  fi
fi

if [[ "$SHADOW_MODE" == true ]]; then
  echo ""
  echo "== Shadow Mode Complete =="
  echo "Existing files were preserved. New skill scaffold installed at:"
  echo "  $TARGET_DIR/.claude/skills/$SKILL_NAME/"
  echo ""
  echo "Next steps:"
  echo "  1. Append to your existing CLAUDE.md:"
  echo "     echo '<!-- CRP-ROUTE: see .claude/skills/$SKILL_NAME/SKILL.md -->' >> $TARGET_DIR/.claude/CLAUDE.md"
  echo "  2. vim .claude/skills/$SKILL_NAME/SKILL.md      # Edit description & routes"
  echo "  3. vim .claude/skills/$SKILL_NAME/rules/*.md    # Fill project rules"
  echo "  4. python scripts/sync-shells.py --skill $SKILL_NAME   # Sync entry shells"
  echo "  5. bash .claude/skills/$SKILL_NAME/scripts/smoke-test.sh $SKILL_NAME"
else
  echo ""
  echo "== Installation Complete =="
  echo "Next steps:"
  echo "  1. vim .claude/skills/$SKILL_NAME/SKILL.md      # Edit description & routes"
  echo "  2. vim .claude/skills/$SKILL_NAME/rules/*.md    # Fill project rules"
  echo "  3. vim .claude/CLAUDE.md                        # Review entry proxy"
  echo "  4. bash .claude/skills/$SKILL_NAME/scripts/smoke-test.sh $SKILL_NAME"
fi
