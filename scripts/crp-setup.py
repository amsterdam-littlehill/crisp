#!/usr/bin/env python3
"""crp-setup.py — Unified CLI for CRP v2.1 operations.

Single entry point for all CRP operations:
    crp init           Create crp.yaml + scaffold
    crp skill create   Create and register a new skill
    crp skill delete   Remove and unregister a skill
    crp skill list     Print skill table
    crp sync           Regenerate parent gateway + entry proxies
    crp check          Run health checks + drift detection
    crp audit          Run token audit

Usage:
    python scripts/crp-setup.py <command> [options]
"""

from __future__ import annotations

import argparse
import importlib.util
import re
import shutil
import sys
from pathlib import Path

from crp_manifest import (
    default_manifest,
    load_manifest,
    save_manifest,
    validate_manifest,
)

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = Path(".").resolve()
TEMPLATES_DIR = SCRIPT_DIR.parent / "templates"


def _load_script_module(name: str):
    """Dynamically load a script module whose filename contains hyphens."""
    path = SCRIPT_DIR / f"{name}.py"
    spec = importlib.util.spec_from_file_location(name.replace("-", "_"), path)
    if spec is None or spec.loader is None:
        raise ImportError(f"Cannot load script: {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name.replace("-", "_")] = module
    spec.loader.exec_module(module)
    return module


def _detect_existing_skill() -> str | None:
    """Auto-detect a single v2.0 skill directory."""
    skills_dir = PROJECT_ROOT / ".claude" / "skills"
    if not skills_dir.exists():
        return None
    subdirs = [d for d in skills_dir.iterdir() if d.is_dir() and d.name != "shared"]
    return subdirs[0].name if len(subdirs) == 1 else None


def _validate_skill_name(name: str) -> str:
    """Normalize skill name and reject path traversal attempts."""
    if not name:
        raise ValueError("Skill name cannot be empty")
    if any(c in name for c in "./\\"):
        raise ValueError(f"Invalid skill name: {name!r}. Names cannot contain path separators.")
    normalized = re.sub(r"[^\w\s-]", "", name.lower().strip())
    normalized = re.sub(r"\s+", "-", normalized)
    if not normalized:
        raise ValueError("Skill name cannot be empty after normalization")
    return normalized


def _copy_skill_template(
    target_dir: Path, name: str, description: str, project: str, shadow: bool = False
) -> None:
    """Copy templates/skill/* to target_dir and replace placeholders."""
    src = TEMPLATES_DIR / "skill"
    if not src.exists():
        print(f"ERROR: Template directory not found: {src}")
        sys.exit(1)

    if shadow and target_dir.exists():
        print(f"  [SHADOW] preserving existing skill directory {target_dir}")
        return

    shutil.copytree(src, target_dir, dirs_exist_ok=True)

    # Replace placeholders in all text files
    for f in target_dir.rglob("*"):
        if not f.is_file():
            continue
        try:
            text = f.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        new_text = text.replace("{{NAME}}", name).replace("{{PROJECT}}", project)
        if new_text != text:
            f.write_text(new_text, encoding="utf-8")


def _copy_shells(project_root: Path, skill_name: str, project_name: str = "", shadow: bool = False, dry_run: bool = False) -> None:
    """Copy entry proxy shells from templates/shells."""
    shells_src = TEMPLATES_DIR / "shells"
    mappings = {
        shells_src / "CLAUDE.md": project_root / ".claude" / "CLAUDE.md",
        shells_src / "GEMINI.md": project_root / ".claude" / "GEMINI.md",
        shells_src / ".codex" / "instructions.md": project_root / ".codex" / "instructions.md",
        shells_src / ".cursor" / "rules" / "workflow.mdc": project_root / ".cursor" / "rules" / "workflow.mdc",
        shells_src / ".cursor" / "skills" / "{{NAME}}" / "SKILL.md": project_root / ".cursor" / "skills" / skill_name / "SKILL.md",
    }

    for src, dst in mappings.items():
        if dry_run:
            print(f"  [DRY RUN] would copy: {src} -> {dst}")
            continue
        if shadow and dst.exists():
            print(f"  [SHADOW] preserving existing {dst.name}")
            continue
        if src.exists():
            dst.parent.mkdir(parents=True, exist_ok=True)
            text = src.read_text(encoding="utf-8")
            text = text.replace("{{NAME}}", skill_name).replace("{{PROJECT}}", project_name or skill_name)
            dst.write_text(text, encoding="utf-8")
            print(f"  [COPIED] {dst}")


def _copy_hooks(project_root: Path, dry_run: bool = False) -> None:
    """Copy SessionStart hooks from templates/hooks."""
    hooks_src = TEMPLATES_DIR / "hooks"
    hooks_dst = project_root / ".claude" / "hooks"
    if dry_run:
        print(f"  [DRY RUN] would copy hooks: {hooks_src} -> {hooks_dst}")
        return
    if hooks_src.exists():
        shutil.copytree(hooks_src, hooks_dst, dirs_exist_ok=True)
        print(f"  [COPIED] hooks to {hooks_dst}")


def cmd_init(args: argparse.Namespace) -> int:
    """Create crp.yaml + scaffold."""
    manifest_path = PROJECT_ROOT / "crp.yaml"

    if manifest_path.exists() and not args.from_existing:
        print(f"ERROR: {manifest_path} already exists. Use --from-existing to migrate.")
        return 1

    project_name = args.project or args.skill or "my-project"
    skill_name = args.skill

    if skill_name:
        try:
            skill_name = _validate_skill_name(skill_name)
        except ValueError as e:
            print(f"ERROR: {e}")
            return 1

    if args.from_existing:
        existing = _detect_existing_skill()
        if not existing:
            print("ERROR: --from-existing requires a v2.0 project with .claude/skills/<name>/")
            return 1
        skill_name = skill_name or existing
        project_name = args.project or skill_name

        manifest = default_manifest(project_name)
        manifest["skills"] = [{"name": skill_name, "description": ""}]
        manifest["default_skill"] = skill_name
    else:
        manifest = default_manifest(project_name)
        if skill_name:
            manifest["skills"] = [{"name": skill_name, "description": ""}]
            manifest["default_skill"] = skill_name

    if args.dry_run:
        print(f"[DRY RUN] would create {manifest_path}")
    else:
        save_manifest(manifest_path, manifest)
        print(f"[CREATED] {manifest_path}")

    if skill_name:
        _copy_shells(PROJECT_ROOT, skill_name, project_name, args.shadow, args.dry_run)
        # Create shared/ directory for cross-skill conventions
        shared_dir = PROJECT_ROOT / ".claude" / "skills" / "shared"
        if not args.dry_run:
            shared_dir.mkdir(parents=True, exist_ok=True)
            (shared_dir / ".gitkeep").touch(exist_ok=True)
        _copy_hooks(PROJECT_ROOT, args.dry_run)

        skill_dir = PROJECT_ROOT / ".claude" / "skills" / skill_name
        if args.dry_run:
            print(f"  [DRY RUN] would copy skill template to {skill_dir}")
        else:
            _copy_skill_template(skill_dir, skill_name, "", project_name, args.shadow)
            print(f"  [CREATED] skill: {skill_dir}")

    print(f"\nInit complete: {project_name}")
    if skill_name:
        print(f"   Skill: {skill_name}")
        print(f"   Edit .claude/skills/{skill_name}/SKILL.md to customize routing.")
    return 0


def cmd_skill_create(args: argparse.Namespace) -> int:
    """Create a new skill and register it in crp.yaml."""
    manifest_path = PROJECT_ROOT / "crp.yaml"
    manifest = load_manifest(manifest_path)
    if not manifest:
        print("ERROR: No crp.yaml found. Run 'crp init' first.")
        return 1

    try:
        name = _validate_skill_name(args.name)
    except ValueError as e:
        print(f"ERROR: {e}")
        return 1
    description = args.description

    if not description:
        description = input(f"Description for skill '{name}' (press Enter to skip): ").strip()

    project_name = manifest.get("project", {}).get("name", name)
    skill_dir = PROJECT_ROOT / ".claude" / "skills" / name

    if skill_dir.exists():
        print(f"ERROR: Skill directory already exists: {skill_dir}")
        return 1

    _copy_skill_template(skill_dir, name, description, project_name)
    print(f"[CREATED] skill directory: {skill_dir}")

    skills = manifest.get("skills", [])
    if any(s.get("name") == name for s in skills):
        print(f"WARNING: Skill '{name}' already in crp.yaml")
    else:
        skills.append({"name": name, "description": description})
        manifest["skills"] = skills
        if len(skills) == 1:
            manifest["default_skill"] = name
        save_manifest(manifest_path, manifest)
        print(f"[REGISTERED] '{name}' in crp.yaml")

    return 0


def cmd_skill_delete(args: argparse.Namespace) -> int:
    """Remove a skill and unregister it."""
    manifest_path = PROJECT_ROOT / "crp.yaml"
    manifest = load_manifest(manifest_path)
    if not manifest:
        print("ERROR: No crp.yaml found.")
        return 1

    try:
        name = _validate_skill_name(args.name)
    except ValueError as e:
        print(f"ERROR: {e}")
        return 1
    skill_dir = PROJECT_ROOT / ".claude" / "skills" / name

    if not skill_dir.exists():
        print(f"ERROR: Skill directory not found: {skill_dir}")
        return 1

    if not args.force:
        confirm = input(f"Delete skill '{name}' at {skill_dir}? This cannot be undone. [y/N]: ")
        if confirm.lower() != "y":
            print("Cancelled.")
            return 0

    shutil.rmtree(skill_dir)
    print(f"[DELETED] {skill_dir}")

    skills = [s for s in manifest.get("skills", []) if s.get("name") != name]
    manifest["skills"] = skills
    if manifest.get("default_skill") == name:
        manifest["default_skill"] = skills[0]["name"] if skills else None
    save_manifest(manifest_path, manifest)
    print(f"[UNREGISTERED] '{name}' from crp.yaml")

    return 0


def cmd_skill_list(_args: argparse.Namespace) -> int:
    """Print skills table from crp.yaml."""
    manifest = load_manifest(PROJECT_ROOT / "crp.yaml")
    if not manifest:
        print("ERROR: No crp.yaml found. Run 'crp init' first.")
        return 1

    skills = manifest.get("skills", [])
    default = manifest.get("default_skill", "")

    if not skills:
        print("No skills defined.")
        return 0

    print(f"\n{'Skill':<20} {'Default':<8} {'Description'}")
    print("-" * 60)
    for skill in skills:
        name = skill.get("name", "")
        desc = skill.get("description", "")
        marker = "*" if name == default else ""
        print(f"{name:<20} {marker:<8} {desc}")
    print()
    return 0


def cmd_sync(args: argparse.Namespace) -> int:
    """Regenerate parent gateway and entry proxies."""
    mod = _load_script_module("sync-shells")
    return mod.run_sync(skill_name=args.skill, check=args.check)


def cmd_check(args: argparse.Namespace) -> int:
    """Run health checks."""
    mod = _load_script_module("health-check")
    return mod.run_check(skill_name=args.skill, fix=args.fix, drifts=args.drifts)


def cmd_audit(args: argparse.Namespace) -> int:
    """Run token audit."""
    mod = _load_script_module("token-audit")
    return mod.run_audit(skill_name=args.skill, report=args.report)


def cmd_validate(_args: argparse.Namespace) -> int:
    """Validate crp.yaml schema."""
    manifest_path = PROJECT_ROOT / "crp.yaml"
    manifest = load_manifest(manifest_path)
    if not manifest:
        print("[ERROR] No crp.yaml found")
        print("         Impact: Cannot validate project structure")
        print("         Fix:    Run 'crp init' to create crp.yaml")
        return 1

    errors = validate_manifest(manifest)
    if errors:
        for err in errors:
            print(f"[ERROR] {err}")
            print("         Impact: CRP tools may behave unexpectedly")
            print("         Fix:    Edit crp.yaml to correct the error")
        return 1

    print("[OK] crp.yaml is valid")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        prog="crp",
        description="Context-Router Protocol (CRP) v2.1 unified CLI",
    )
    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    init_parser = subparsers.add_parser("init", help="Create crp.yaml + scaffold")
    init_parser.add_argument("--from-existing", action="store_true", help="Migrate v2.0 project")
    init_parser.add_argument("--skill", default=None, help="Initial skill name")
    init_parser.add_argument("--project", default=None, help="Project name")
    init_parser.add_argument("--shadow", action="store_true", help="Preserve existing files")
    init_parser.add_argument("--dry-run", action="store_true", help="Preview only")
    init_parser.set_defaults(func=cmd_init)

    skill_parser = subparsers.add_parser("skill", help="Skill management")
    skill_sub = skill_parser.add_subparsers(dest="skill_command", help="Skill operations")

    skill_create = skill_sub.add_parser("create", help="Create a new skill")
    skill_create.add_argument("name", help="Skill name (kebab-case)")
    skill_create.add_argument("--description", default=None, help="Skill description")
    skill_create.add_argument("--primary", action="store_true", help="Mark as default skill")
    skill_create.set_defaults(func=cmd_skill_create)

    skill_delete = skill_sub.add_parser("delete", help="Delete a skill")
    skill_delete.add_argument("name", help="Skill name")
    skill_delete.add_argument("--force", action="store_true", help="Skip confirmation")
    skill_delete.set_defaults(func=cmd_skill_delete)

    skill_list = skill_sub.add_parser("list", help="List skills")
    skill_list.set_defaults(func=cmd_skill_list)

    sync_parser = subparsers.add_parser("sync", help="Regenerate gateway + proxies")
    sync_parser.add_argument("--skill", default=None, help="Target skill (optional)")
    sync_parser.add_argument("--check", action="store_true", help="Dry-run")
    sync_parser.set_defaults(func=cmd_sync)

    check_parser = subparsers.add_parser("check", help="Run health checks")
    check_parser.add_argument("--skill", default=None, help="Target skill (optional)")
    check_parser.add_argument("--fix", action="store_true", help="Auto-fix minor issues")
    check_parser.add_argument("--drifts", action="store_true", help="Check structural drift")
    check_parser.set_defaults(func=cmd_check)

    audit_parser = subparsers.add_parser("audit", help="Run token audit")
    audit_parser.add_argument("--skill", default=None, help="Target skill (optional)")
    audit_parser.add_argument("--report", action="store_true", help="Write JSON report")
    audit_parser.set_defaults(func=cmd_audit)

    validate_parser = subparsers.add_parser("validate", help="Validate crp.yaml schema")
    validate_parser.set_defaults(func=cmd_validate)

    args = parser.parse_args()
    if not args.command:
        parser.print_help()
        return 1

    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
