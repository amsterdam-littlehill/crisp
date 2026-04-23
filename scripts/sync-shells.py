#!/usr/bin/env python3
"""
sync-shells.py — Auto-generate thin shell entry files from gateway.md Common Tasks.

Reads the Common Tasks table from gateway.md (or SKILL.md) and regenerates
all IDE entry files (CLAUDE.md, .cursorrules, GEMINI.md, Codex instructions)
with inline routing tables. This eliminates manual drift between shells.

Usage:
    python scripts/sync-shells.py --skill <name> [--check]

    --check     Dry-run: report what would change without writing files.
"""

import argparse
import os
import re
import sys
from pathlib import Path


def normalize_name(name: str) -> str:
    """Convert to kebab-case: lowercase, spaces→hyphens, remove non-alphanumeric."""
    name = name.lower().strip()
    name = re.sub(r'[^\w\s-]', '', name)
    name = re.sub(r'\s+', '-', name)
    if not name:
        raise ValueError("Skill name cannot be empty after normalization")
    return name


def parse_common_tasks(gateway_path: Path) -> list[dict]:
    """Extract the Common Tasks markdown table from gateway.md."""
    content = gateway_path.read_text(encoding="utf-8")

    # Find the Common Tasks section
    match = re.search(
        r"##\s+Common Tasks.*?(\n##\s|\Z)",
        content,
        re.DOTALL | re.IGNORECASE,
    )
    if not match:
        raise ValueError(f"Could not find 'Common Tasks' section in {gateway_path}")

    section = match.group(0)
    lines = [ln for ln in section.splitlines() if ln.strip().startswith("|")]

    # Skip header and separator lines
    data_rows = []
    for line in lines:
        # Skip separator like |------|------|
        if re.search(r"\|[\s-:]+\|", line) and not re.search(r"[a-zA-Z]", line):
            continue
        cells = [c.strip() for c in line.split("|")]
        cells = [c for c in cells if c]  # remove empty edge cells
        if len(cells) >= 3 and cells[0].lower() not in ("task", "<!-- fill:"):
            data_rows.append(
                {
                    "task": cells[0],
                    "reads": cells[1],
                    "workflow": cells[2],
                }
            )
    return data_rows


def generate_claude_md(skill_name: str, project_name: str, tasks: list[dict]) -> str:
    lines = [
        f"# {project_name} — Agent Skill Entry",
        "",
        f"Formal docs live under `.claude/skills/`. Read `.claude/skills/{skill_name}/SKILL.md` first — default to `primary: true` skill; only switch when task clearly matches another.",
        "",
        "## Quick Routing (survives context truncation)",
        "",
        "| Task | Required reads | Workflow |",
        "|------|---------------|----------|",
    ]
    for t in tasks:
        lines.append(f"| {t['task']} | {t['reads']} | {t['workflow']} |")
    lines += [
        "| Other / unlisted | `rules/project-rules.md` | Check `workflows/` for closest match |",
        "",
        "## Auto-Triggers",
        "",
        f"- **New task in same session** → re-read `skills/{skill_name}/SKILL.md`, re-match Common Tasks route, re-read all required files. \"I already read it\" is not valid — context compresses, routes differ.",
        f"- **Before declaring any non-trivial task complete** → run Closure Extraction (see `skills/{skill_name}/workflows/update-rules.md`)",
        "- Skip only for: formatting-only, comment-only, dependency-version-only, behavior-preserving refactors",
        "",
        "## Red Flags — STOP",
        "",
        '- "Just this once I\'ll skip the AAR" → stop. See `workflows/update-rules.md` § Rationalizations to Reject.',
        '- "This is a small fix, no need to re-read SKILL.md" → stop. Context compression makes "small" fixes dangerous.',
        '- Task declared "done" but no 30-second AAR scan → stop.',
        "",
    ]
    return "\n".join(lines)


def generate_cursor_rules(skill_name: str, project_name: str, tasks: list[dict]) -> str:
    lines = [
        f"# {project_name} — Workflow Rules",
        "",
        "## Quick Routing",
        "",
        "| Task | Required reads | Workflow |",
        "|------|---------------|----------|",
    ]
    for t in tasks:
        lines.append(f"| {t['task']} | {t['reads']} | {t['workflow']} |")
    lines += [
        "| Other | `rules/project-rules.md` | Check `workflows/` for closest match |",
        "",
        "## Mandatory",
        "",
        "1. Re-read `SKILL.md` on every new task — context compresses between tasks.",
        "2. Run Closure Extraction before declaring any non-trivial task complete.",
        "3. If you think \"just this once I'll skip AAR\" — STOP. Do the AAR.",
        "",
    ]
    return "\n".join(lines)


def generate_gemini_md(skill_name: str, project_name: str, tasks: list[dict]) -> str:
    lines = [
        f"# {project_name} — Gemini Entry",
        "",
        f"Read `.claude/skills/{skill_name}/SKILL.md` first. Then follow the routing table below.",
        "",
        "## Quick Routing",
        "",
        "| Task | Required reads | Workflow |",
        "|------|---------------|----------|",
    ]
    for t in tasks:
        lines.append(f"| {t['task']} | {t['reads']} | {t['workflow']} |")
    lines += [
        "| Other / unlisted | `rules/project-rules.md` | Check `workflows/` for closest match |",
        "",
        "## Session Refresh",
        "",
        "Every new task must re-read SKILL.md and rematch the Common Tasks route. Do not rely on memory across tasks.",
        "",
    ]
    return "\n".join(lines)


def generate_codex_instructions(skill_name: str, project_name: str, tasks: list[dict]) -> str:
    lines = [
        f"# {project_name} — Codex Instructions",
        "",
        f"Agent context lives in `.claude/skills/{skill_name}/`. Start by reading `SKILL.md`.",
        "",
        "## Quick Routing",
        "",
        "| Task | Required reads | Workflow |",
        "|------|---------------|----------|",
    ]
    for t in tasks:
        lines.append(f"| {t['task']} | {t['reads']} | {t['workflow']} |")
    lines += [
        "| Other / unlisted | `rules/project-rules.md` | Check `workflows/` for closest match |",
        "",
        "## Mandatory Checks",
        "",
        "- Re-read `SKILL.md` at the start of every new task.",
        "- Run Closure Extraction (AAR) before marking any non-trivial task complete.",
        "",
    ]
    return "\n".join(lines)


SHELL_GENERATORS = {
    ".claude/CLAUDE.md": generate_claude_md,
    ".claude/GEMINI.md": generate_gemini_md,
    ".codex/instructions.md": generate_codex_instructions,
    ".cursor/rules/workflow.mdc": generate_cursor_rules,
}


def main() -> int:
    parser = argparse.ArgumentParser(description="Sync thin shells from gateway.md Common Tasks")
    parser.add_argument("--skill", required=True, help="Skill name (kebab-case)")
    parser.add_argument("--project", default=None, help="Project name (defaults to skill name)")
    parser.add_argument("--check", action="store_true", help="Dry-run: report diffs without writing")
    args = parser.parse_args()

    skill_name = normalize_name(args.skill)
    project_name = args.project or skill_name
    skill_dir = Path(f".claude/skills/{skill_name}")
    gateway_path = skill_dir / "SKILL.md"

    if not gateway_path.exists():
        print(f"ERROR: {gateway_path} not found. Run install.sh first.")
        return 1

    tasks = parse_common_tasks(gateway_path)
    if not tasks:
        print("WARNING: No Common Tasks found in gateway.md. Shells will contain only fallback route.")

    changed = 0
    for rel_path, generator in SHELL_GENERATORS.items():
        target = Path(rel_path)
        new_content = generator(skill_name, project_name, tasks)

        if args.check:
            if target.exists():
                old_content = target.read_text(encoding="utf-8")
                if old_content.strip() != new_content.strip():
                    print(f"[WOULD CHANGE] {rel_path}")
                    changed += 1
                else:
                    print(f"[UNCHANGED] {rel_path}")
            else:
                print(f"[WOULD CREATE] {rel_path}")
                changed += 1
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(new_content, encoding="utf-8")
            print(f"[WRITTEN] {rel_path}")
            changed += 1

    if args.check:
        print(f"\n{'DRY RUN' if changed else 'ALL CLEAN'}: {changed} file(s) would change.")
        return 1 if changed else 0

    print(f"\n✅ Synced {changed} shell file(s) from {gateway_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
