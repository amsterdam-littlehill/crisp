#!/usr/bin/env python3
"""sync-shells.py — Auto-generate thin shell entry files and parent gateway.

In v2.1 multi-skill mode:
  - Generates a parent gateway at .claude/skills/SKILL.md
  - Entry proxies contain skill-level routing tables

In v2.0 single-skill mode (fallback when crp.yaml absent):
  - Entry proxies contain task-level Common Tasks tables

Usage:
    python scripts/sync-shells.py [--skill <name>] [--project <name>] [--check]

    --skill   Skill name (kebab-case). Auto-detected in v2.0 fallback.
    --check   Dry-run: report what would change without writing files.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

from crp_gateway import ParseResult, parse_common_tasks, generate_parent_gateway
from crp_manifest import load_manifest, extract_skill_frontmatter


def normalize_name(name: str) -> str:
    """Convert to kebab-case: lowercase, spaces→hyphens, remove non-alphanumeric."""
    name = name.lower().strip()
    name = re.sub(r"[^\w\s-]", "", name)
    name = re.sub(r"\s+", "-", name)
    if not name:
        raise ValueError("Skill name cannot be empty after normalization")
    return name


def _generate_skill_routing_table(skills: list[dict], project_name: str) -> str:
    """Generate a skill-level routing table for multi-skill entry proxies."""
    lines = [
        f"# {project_name} — Agent Skill Entry",
        "",
        "Formal docs live under `.claude/skills/`. Read `.claude/skills/SKILL.md` first — it routes to the correct child skill.",
        "",
        "## Skill Routing (survives context truncation)",
        "",
        "| Skill | Description | Entry | Default |",
        "|-------|-------------|-------|---------|",
    ]
    for skill in skills:
        name = skill["name"]
        desc = skill.get("description", "")
        entry = f"`.claude/skills/{name}/SKILL.md`"
        lines.append(f"| {name} | {desc} | {entry} |")

    default = next(
        (s["name"] for s in skills if s.get("primary")),
        skills[0]["name"] if skills else "",
    )
    lines += [
        "",
        "## Auto-Route Rule",
        "",
        f"1. **Default skill**: `{default}` — use unless task clearly matches another skill.",
        "2. **Skill switching**: If task matches non-default skill, re-read that skill's SKILL.md for task-level routing.",
        "3. **Unknown tasks**: Use default skill; check if task belongs to another skill.",
        "",
        "## Session Discipline",
        "",
        "- Every new task must re-read `.claude/skills/SKILL.md` and re-match the skill route.",
        "- Then re-read the matched child skill's SKILL.md and follow its Common Tasks route.",
        "- Do not rely on memory across tasks.",
        "",
    ]
    return "\n".join(lines)


def _generate_multi_skill_cursor_rules(skills: list[dict], project_name: str) -> str:
    lines = [
        f"# {project_name} — Workflow Rules",
        "",
        "## Skill Routing",
        "",
        "| Skill | Description |",
        "|-------|-------------|",
    ]
    for skill in skills:
        lines.append(f"| {skill['name']} | {skill.get('description', '')} |")
    lines += [
        "",
        "## Mandatory",
        "",
        "1. Read `.claude/skills/SKILL.md` first for skill-level routing.",
        "2. Then read the matched child skill's SKILL.md for task-level routing.",
        "3. Run Closure Extraction before declaring any non-trivial task complete.",
        "",
    ]
    return "\n".join(lines)


def _generate_multi_skill_gemini_md(skills: list[dict], project_name: str) -> str:
    lines = [
        f"# {project_name} — Gemini Entry",
        "",
        "Read `.claude/skills/SKILL.md` first for skill-level routing. Then follow the child skill's routing.",
        "",
        "## Skill Routing",
        "",
        "| Skill | Description |",
        "|-------|-------------|",
    ]
    for skill in skills:
        lines.append(f"| {skill['name']} | {skill.get('description', '')} |")
    lines += [
        "",
        "## Session Refresh",
        "",
        "Every new task must re-read `.claude/skills/SKILL.md`, rematch skill route, then re-read child skill's SKILL.md.",
        "",
    ]
    return "\n".join(lines)


def _generate_multi_skill_codex_instructions(skills: list[dict], project_name: str) -> str:
    lines = [
        f"# {project_name} — Codex Instructions",
        "",
        "Agent context lives in `.claude/skills/`. Start by reading `.claude/skills/SKILL.md` for skill routing.",
        "",
        "## Skill Routing",
        "",
        "| Skill | Description |",
        "|-------|-------------|",
    ]
    for skill in skills:
        lines.append(f"| {skill['name']} | {skill.get('description', '')} |")
    lines += [
        "",
        "## Mandatory Checks",
        "",
        "- Re-read `.claude/skills/SKILL.md` at the start of every new task.",
        "- Then read the matched child skill's SKILL.md for task-level routing.",
        "- Run Closure Extraction (AAR) before marking any non-trivial task complete.",
        "",
    ]
    return "\n".join(lines)


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
    has_fallback = any("other" in t.get("task", "").lower() for t in tasks)
    for t in tasks:
        lines.append(f"| {t['task']} | {t['reads']} | {t['workflow']} |")
    if not has_fallback:
        lines += [
            "| Other / unlisted | `rules/project-rules.md` | Check `workflows/` for closest match |",
        ]
    lines += [
        "",
        "## Auto-Triggers",
        "",
        f"- **New task in same session** → re-read `.claude/skills/{skill_name}/SKILL.md`, re-match Common Tasks route, re-read all required files. \"I already read it\" is not valid — context compresses, routes differ.",
        f"- **Before declaring any non-trivial task complete** → run Task Closure Protocol (see `.claude/skills/{skill_name}/workflows/update-rules.md`)",
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
    has_fallback = any("other" in t.get("task", "").lower() for t in tasks)
    for t in tasks:
        lines.append(f"| {t['task']} | {t['reads']} | {t['workflow']} |")
    if not has_fallback:
        lines += [
            "| Other / unlisted | `rules/project-rules.md` | Check `workflows/` for closest match |",
        ]
    lines += [
        "",
        "## Mandatory",
        "",
        "1. Re-read `SKILL.md` on every new task — context compresses between tasks.",
        "2. Run Task Closure Protocol before declaring any non-trivial task complete.",
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
    has_fallback = any("other" in t.get("task", "").lower() for t in tasks)
    for t in tasks:
        lines.append(f"| {t['task']} | {t['reads']} | {t['workflow']} |")
    if not has_fallback:
        lines += [
            "| Other / unlisted | `rules/project-rules.md` | Check `workflows/` for closest match |",
        ]
    lines += [
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
    has_fallback = any("other" in t.get("task", "").lower() for t in tasks)
    for t in tasks:
        lines.append(f"| {t['task']} | {t['reads']} | {t['workflow']} |")
    if not has_fallback:
        lines += [
            "| Other / unlisted | `rules/project-rules.md` | Check `workflows/` for closest match |",
        ]
    lines += [
        "",
        "## Mandatory Checks",
        "",
        "- Re-read `SKILL.md` at the start of every new task.",
        "- Run Task Closure Protocol (AAR) before marking any non-trivial task complete.",
        "",
    ]
    return "\n".join(lines)


SHELL_GENERATORS = {
    ".claude/CLAUDE.md": generate_claude_md,
    ".claude/GEMINI.md": generate_gemini_md,
    ".codex/instructions.md": generate_codex_instructions,
    ".cursor/rules/workflow.mdc": generate_cursor_rules,
}

MULTI_SKILL_GENERATORS = {
    ".claude/CLAUDE.md": _generate_skill_routing_table,
    ".claude/GEMINI.md": _generate_multi_skill_gemini_md,
    ".codex/instructions.md": _generate_multi_skill_codex_instructions,
    ".cursor/rules/workflow.mdc": _generate_multi_skill_cursor_rules,
}


def write_parent_gateway(content: str) -> Path:
    """Write parent gateway to .claude/skills/SKILL.md."""
    parent_path = Path(".claude/skills/SKILL.md")
    parent_path.parent.mkdir(parents=True, exist_ok=True)
    parent_path.write_text(content, encoding="utf-8")
    return parent_path


def write_shells(
    generators: dict[str, callable],
    skill_name: str,
    project_name: str,
    tasks: list[dict],
    check: bool = False,
) -> int:
    """Write entry proxies using the provided generators. Returns count of changed files."""
    changed = 0
    for rel_path, generator in generators.items():
        target = Path(rel_path)
        new_content = generator(skill_name, project_name, tasks)

        if check:
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
    return changed


def write_multi_skill_shells(
    skills: list[dict],
    project_name: str,
    check: bool = False,
) -> int:
    """Write multi-skill entry proxies. Returns count of changed files."""
    changed = 0
    for rel_path, generator in MULTI_SKILL_GENERATORS.items():
        target = Path(rel_path)
        new_content = generator(skills, project_name)

        if check:
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
    return changed


def run_sync(skill_name: str | None = None, project_name: str | None = None, check: bool = False) -> int:
    """Core sync logic. Called by main() and by crp-setup.py."""
    manifest = load_manifest(Path("crp.yaml"))
    is_v21 = bool(manifest and manifest.get("version") == "2.1")

    if is_v21:
        skills = manifest.get("skills", [])
        if not skills:
            print("ERROR: No skills defined in crp.yaml")
            return 1

        project_name = project_name or manifest.get("project", {}).get("name", "project")

        # Generate parent gateway
        parent_content = generate_parent_gateway(manifest)
        if check:
            parent_path = Path(".claude/skills/SKILL.md")
            if parent_path.exists():
                old = parent_path.read_text(encoding="utf-8")
                if old.strip() != parent_content.strip():
                    print("[WOULD CHANGE] .claude/skills/SKILL.md (parent gateway)")
                else:
                    print("[UNCHANGED] .claude/skills/SKILL.md")
            else:
                print("[WOULD CREATE] .claude/skills/SKILL.md")
        else:
            parent_path = write_parent_gateway(parent_content)
            print(f"[WRITTEN] {parent_path}")

        # For single-skill projects, use task-level routing directly (v2.0 style).
        # For multi-skill projects, generate skill-level routing entry proxies.
        if len(skills) == 1:
            skill_name = skill_name or skills[0].get("name")
            skill_dir = Path(f".claude/skills/{skill_name}")
            gateway_path = skill_dir / "SKILL.md"
            if not gateway_path.exists():
                print(f"ERROR: {gateway_path} not found. Run install.sh first.")
                return 1
            result = parse_common_tasks(gateway_path)
            tasks = result.tasks
            changed = write_shells(SHELL_GENERATORS, skill_name, project_name, tasks, check)
        else:
            changed = write_multi_skill_shells(skills, project_name, check)
            # Also sync individual skill shells if --skill is provided
            if skill_name:
                skill_dir = Path(f".claude/skills/{skill_name}")
                gateway_path = skill_dir / "SKILL.md"
                if gateway_path.exists():
                    result = parse_common_tasks(gateway_path)
                    tasks = result.tasks
                    skill_changed = write_shells(SHELL_GENERATORS, skill_name, project_name, tasks, check)
                    changed += skill_changed

        if check:
            print(f"\n{'DRY RUN' if changed else 'ALL CLEAN'}: {changed} file(s) would change.")
            return 1 if changed else 0

        mode = "single-skill" if len(skills) == 1 else "multi-skill"
        print(f"\n[OK] Synced {changed} file(s) for {mode} project: {project_name}")
        return 0

    # v2.0 single-skill fallback
    if not skill_name:
        skills_dir = Path(".claude/skills")
        if skills_dir.exists():
            subdirs = [d for d in skills_dir.iterdir() if d.is_dir() and d.name != "shared"]
            if len(subdirs) == 1:
                skill_name = subdirs[0].name

    if not skill_name:
        print("ERROR: Could not auto-detect skill. Use --skill or create crp.yaml.")
        return 1

    skill_name = normalize_name(skill_name)
    project_name = project_name or skill_name
    skill_dir = Path(f".claude/skills/{skill_name}")
    gateway_path = skill_dir / "SKILL.md"

    if not gateway_path.exists():
        print(f"ERROR: {gateway_path} not found. Run install.sh first.")
        return 1

    result = parse_common_tasks(gateway_path)
    if not result.found:
        print(f"WARNING: {result.message}")
    tasks = result.tasks
    if not tasks:
        print("WARNING: No Common Tasks found. Shells will contain only fallback route.")

    changed = write_shells(SHELL_GENERATORS, skill_name, project_name, tasks, check)

    if check:
        print(f"\n{'DRY RUN' if changed else 'ALL CLEAN'}: {changed} file(s) would change.")
        return 1 if changed else 0

    print(f"\n[OK] Synced {changed} shell file(s) from {gateway_path}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Sync thin shells from gateway.md Common Tasks")
    parser.add_argument("--skill", default=None, help="Skill name (kebab-case)")
    parser.add_argument("--project", default=None, help="Project name (defaults to skill name)")
    parser.add_argument("--check", action="store_true", help="Dry-run: report diffs without writing")
    args = parser.parse_args()

    return run_sync(args.skill, args.project, args.check)


if __name__ == "__main__":
    sys.exit(main())
