#!/usr/bin/env python3
"""
health-check.py — CRP directory health scanner.

Checks for structural issues that cause documentation rot over time:
  - Oversized files (gateway > 100 lines, shells > 60 lines)
  - Orphaned references (links pointing to non-existent files)
  - Pre-fabricated gotchas (gotchas.md should stay near-empty)
  - Deprecated rules without DEPRECATED markers
  - Placeholder residues ({{NAME}}, <!-- FILL: -->)

Usage:
    python scripts/health-check.py [--skill <name>] [--fix]

    --fix   Auto-fix minor issues (remove deprecated markers, normalize names).
"""

import argparse
import os
import re
import sys
from datetime import datetime
from pathlib import Path


ISSUES = []
WARNINGS = []


def emit(level: str, msg: str) -> None:
    if level == "ERROR":
        ISSUES.append(msg)
    else:
        WARNINGS.append(msg)
    print(f"  [{level}] {msg}")


def check_file_sizes(skill_dir: Path, shells: list[Path]) -> None:
    gateway = skill_dir / "SKILL.md"
    if gateway.exists():
        lines = len(gateway.read_text(encoding="utf-8").splitlines())
        if lines > 100:
            emit("ERROR", f"gateway.md is {lines} lines (> 100). Split into references/.")
        elif lines > 80:
            emit("WARN", f"gateway.md is {lines} lines (approaching 100 limit)")

    for shell in shells:
        if shell.exists():
            lines = len(shell.read_text(encoding="utf-8").splitlines())
            if lines > 60:
                emit("ERROR", f"{shell} is {lines} lines (> 60). Run sync-shells.py.")
            elif lines > 45:
                emit("WARN", f"{shell} is {lines} lines (approaching 60 limit)")

    for md_file in skill_dir.rglob("*.md"):
        lines = len(md_file.read_text(encoding="utf-8").splitlines())
        if lines > 500:
            rel = md_file.relative_to(skill_dir)
            emit("WARN", f"{rel} is {lines} lines (> 500). Consider splitting.")


def check_link_integrity(skill_dir: Path) -> None:
    """Find all `path/to/file.md` references and verify they exist."""
    for md_file in skill_dir.rglob("*.md"):
        text = md_file.read_text(encoding="utf-8")
        refs = re.findall(r"`([^`]+\.(?:md|mdc|sh|py))`", text)
        for ref in refs:
            # Resolve relative to skill_dir
            target = skill_dir / ref
            if not target.exists():
                rel = md_file.relative_to(skill_dir)
                emit("ERROR", f"Broken link in {rel}: `{ref}` not found")


def check_gotchas_empty(skill_dir: Path) -> None:
    gotchas = skill_dir / "references" / "gotchas.md"
    if not gotchas.exists():
        emit("WARN", "references/gotchas.md missing")
        return

    text = gotchas.read_text(encoding="utf-8")
    content_lines = [
        ln
        for ln in text.splitlines()
        if ln.strip()
        and not ln.strip().startswith("#")
        and not ln.strip().startswith(">")
        and "FILL" not in ln
        and "empty" not in ln.lower()
        and "natural" not in ln.lower()
    ]
    if len(content_lines) > 3:
        emit(
            "WARN",
            f"gotchas.md has {len(content_lines)} content lines — verify they are real pitfalls, not prefabricated examples",
        )


def check_deprecated_rules(skill_dir: Path) -> None:
    for md_file in skill_dir.rglob("*.md"):
        text = md_file.read_text(encoding="utf-8")
        if "<!-- DEPRECATED" in text:
            # Extract dates and check age
            dates = re.findall(r"DEPRECATED:.*?([0-9]{4}-[0-9]{2}-[0-9]{2})", text)
            for d in dates:
                try:
                    dep_date = datetime.strptime(d, "%Y-%m-%d")
                    age_days = (datetime.now() - dep_date).days
                    if age_days > 30:
                        rel = md_file.relative_to(skill_dir)
                        emit(
                            "WARN",
                            f"{rel}: DEPRECATED marker from {d} ({age_days} days old). Consider removal.",
                        )
                except ValueError:
                    pass


def check_placeholders(skill_dir: Path, shells: list[Path]) -> None:
    for root in [skill_dir] + shells:
        if root.is_file():
            files = [root] if root.exists() else []
        else:
            files = list(root.rglob("*")) if root.exists() else []
        for f in files:
            if not f.is_file():
                continue
            try:
                text = f.read_text(encoding="utf-8")
            except (UnicodeDecodeError, OSError):
                continue
            if "{{NAME}}" in text or "{{PROJECT}}" in text:
                rel = f.relative_to(Path("."))
                emit("ERROR", f"Unreplaced placeholder in {rel}: {{NAME}} or {{PROJECT}}")
            if "<!-- FILL:" in text:
                rel = f.relative_to(Path("."))
                count = text.count("<!-- FILL:")
                emit("WARN", f"{rel}: {count} FILL marker(s) remaining")


def main() -> int:
    parser = argparse.ArgumentParser(description="CRP directory health check")
    parser.add_argument("--skill", default=None, help="Skill name (auto-detect if omitted)")
    parser.add_argument("--fix", action="store_true", help="Auto-fix minor issues")
    args = parser.parse_args()

    skill_name = args.skill
    if not skill_name:
        skills_dir = Path(".claude/skills")
        if skills_dir.exists():
            subdirs = [d for d in skills_dir.iterdir() if d.is_dir() and d.name != "shared"]
            if len(subdirs) == 1:
                skill_name = subdirs[0].name

    if not skill_name:
        print("ERROR: Could not auto-detect skill. Use --skill.")
        return 1

    skill_dir = Path(f".claude/skills/{skill_name}")
    if not skill_dir.exists():
        print(f"ERROR: Skill directory not found: {skill_dir}")
        return 1
    try:
        resolved = skill_dir.resolve()
        cwd = Path(".").resolve()
        if not str(resolved).startswith(str(cwd)):
            print("ERROR: Skill path escapes project directory")
            return 1
    except (OSError, ValueError):
        print("ERROR: Invalid skill path")
        return 1

    shells = [
        Path(".claude/CLAUDE.md"),
        Path(".claude/GEMINI.md"),
        Path(".codex/instructions.md"),
        Path(".cursor/rules/workflow.mdc"),
    ]

    print(f"== Health Check: {skill_name} ==\n")

    check_file_sizes(skill_dir, shells)
    check_link_integrity(skill_dir)
    check_gotchas_empty(skill_dir)
    check_deprecated_rules(skill_dir)
    check_placeholders(skill_dir, shells)

    print(f"\n== Summary ==")
    print(f"Errors:   {len(ISSUES)}")
    print(f"Warnings: {len(WARNINGS)}")

    if ISSUES:
        print("\n❌ FAILED — fix errors before continuing")
        return 1
    elif WARNINGS:
        print("\n⚠️  PASSED with warnings")
        return 0
    else:
        print("\n✅ ALL CLEAR")
        return 0


if __name__ == "__main__":
    sys.exit(main())
