#!/usr/bin/env python3
"""setup-naive.py -- Flatten CRP skill files into monolithic CLAUDE.md.

Usage:
    python experiment/setup-naive.py <project-root>
"""

from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path


def flatten_skill(skill_dir: Path, output_path: Path) -> None:
    """Read all .md and .sh files under skill_dir and write monolithic CLAUDE.md."""
    sections: list[str] = []

    for pattern in ("*.md", "*.sh"):
        for file_path in sorted(skill_dir.rglob(pattern)):
            rel = file_path.relative_to(skill_dir).as_posix()
            text = file_path.read_text(encoding="utf-8")
            sections.append(f"\n{'=' * 60}\n# {rel}\n{'=' * 60}\n\n{text}")

    output_path.write_text("\n".join(sections), encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Flatten CRP into monolithic CLAUDE.md")
    parser.add_argument("project_root", type=Path, help="Path to project root")
    args = parser.parse_args(argv)

    project_root: Path = args.project_root.resolve()
    skill_dir = project_root / ".claude" / "skills" / "backend"
    claude_md = project_root / "CLAUDE.md"
    backup = project_root / "CLAUDE.md.bak"

    if not skill_dir.exists():
        print(f"ERROR: Skill directory not found: {skill_dir}")
        return 1

    if not claude_md.exists():
        print(f"ERROR: CLAUDE.md not found: {claude_md}")
        return 1

    # Preserve original
    shutil.copy2(claude_md, backup)

    flatten_skill(skill_dir, claude_md)

    line_count = len(claude_md.read_text(encoding="utf-8").splitlines())
    print(f"Wrote monolithic CLAUDE.md: {line_count} lines")
    return 0


if __name__ == "__main__":
    sys.exit(main())
