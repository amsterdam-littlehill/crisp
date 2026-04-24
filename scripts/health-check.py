#!/usr/bin/env python3
"""health-check.py — CRP directory health scanner.

Checks for structural issues that cause documentation rot over time:
  - Oversized files (gateway > 100 lines, shells > 60 lines)
  - Orphaned references (links pointing to non-existent files)
  - Pre-fabricated gotchas (gotchas.md should stay near-empty)
  - Deprecated rules without DEPRECATED markers
  - Placeholder residues ({{NAME}}, <!-- FILL: -->)
  - Drift detection (manifest vs directories, gateway vs generated, proxies vs expected)

Usage:
    python scripts/health-check.py [--skill <name>] [--fix] [--drifts]

    --fix     Auto-fix minor issues (interactive regeneration for drifts).
    --drifts  Check for structural drift between crp.yaml and generated files.
"""

from __future__ import annotations

import argparse
import importlib.util
import re
import sys
from datetime import datetime
from pathlib import Path

from crp_gateway import generate_parent_gateway
from crp_manifest import (
    load_manifest,
    validate_manifest,
    extract_skill_frontmatter,
    DEFAULT_MAX_GATEWAY_LINES,
    DEFAULT_MAX_PROXY_LINES,
)

ISSUES: list[str] = []
WARNINGS: list[str] = []
INFOS: list[str] = []


def emit(level: str, msg: str) -> None:
    """Emit a simple one-line message."""
    if level == "ERROR":
        ISSUES.append(msg)
    elif level == "WARNING":
        WARNINGS.append(msg)
    else:
        INFOS.append(msg)
    print(f"  [{level}] {msg}")


def emit_full(level: str, problem: str, impact: str, fix: str) -> None:
    """Emit a structured message per design spec Section 9.

    Format:
        [SEVERITY] Problem description
                 Impact: ...
                 Fix:    ...
    """
    full_msg = f"{problem}\n         Impact: {impact}\n         Fix:    {fix}"
    if level == "ERROR":
        ISSUES.append(full_msg)
    elif level == "WARNING":
        WARNINGS.append(full_msg)
    else:
        INFOS.append(full_msg)
    print(f"  [{level}] {problem}")
    print(f"         Impact: {impact}")
    print(f"         Fix:    {fix}")


def check_file_sizes(skill_dir: Path, shells: list[Path], max_gateway: int = DEFAULT_MAX_GATEWAY_LINES, max_proxy: int = DEFAULT_MAX_PROXY_LINES) -> None:
    gateway = skill_dir / "SKILL.md"
    if gateway.exists():
        lines = len(gateway.read_text(encoding="utf-8").splitlines())
        if lines > max_gateway:
            emit_full(
                "ERROR",
                f"gateway.md is {lines} lines (> {max_gateway})",
                "Hard to fit in context window; routing table may be truncated",
                "Split into references/ directory",
            )
        elif lines > int(max_gateway * 0.8):
            emit_full(
                "WARN",
                f"gateway.md is {lines} lines (approaching {max_gateway} limit)",
                "Near context limit; future additions may exceed threshold",
                "Plan splitting into references/",
            )

    for shell in shells:
        if shell.exists():
            lines = len(shell.read_text(encoding="utf-8").splitlines())
            if lines > max_proxy:
                emit_full(
                    "ERROR",
                    f"{shell} is {lines} lines (> {max_proxy})",
                    "Shell no longer thin; loses 'survives truncation' property",
                    "Run sync-shells.py to regenerate thin shells",
                )
            elif lines > int(max_proxy * 0.75):
                emit_full(
                    "WARN",
                    f"{shell} is {lines} lines (approaching {max_proxy} limit)",
                    "Near proxy limit; future additions may exceed threshold",
                    "Plan splitting or reduce routing table size",
                )

    for md_file in skill_dir.rglob("*.md"):
        lines = len(md_file.read_text(encoding="utf-8").splitlines())
        if lines > 500:
            rel = md_file.relative_to(skill_dir)
            emit_full(
                "WARN",
                f"{rel} is {lines} lines (> 500)",
                "Hard to navigate; increases context pressure",
                "Consider splitting into smaller files",
            )


def check_link_integrity(skill_dir: Path, project_root: Path | None = None) -> None:
    """Find all `path/to/file.md` references and verify they exist."""
    if project_root is None:
        project_root = skill_dir.resolve().parents[1]
    for md_file in skill_dir.rglob("*.md"):
        text = md_file.read_text(encoding="utf-8")
        refs = re.findall(r"`([^`]+\.(?:md|mdc|sh|py))`", text)
        for ref in refs:
            if ref.startswith(("http://", "https://", "#")):
                continue
            target = skill_dir / ref
            resolved = target.resolve()
            try:
                resolved.relative_to(project_root)
            except ValueError:
                rel = md_file.relative_to(skill_dir)
                emit_full(
                    "WARN",
                    f"Suspicious link in {rel}: `{ref}` escapes project directory",
                    "Potential path traversal or information disclosure",
                    "Use a path within the project directory",
                )
                continue
            if not resolved.exists():
                rel = md_file.relative_to(skill_dir)
                emit_full(
                    "ERROR",
                    f"Broken link in {rel}: `{ref}` not found",
                    "Users see dead references; documentation rot",
                    "Fix the link path or create the target file",
                )


def check_proxy_link_integrity(project_root: Path, shells: list[Path]) -> None:
    """Check links in entry proxy files (e.g., .claude/CLAUDE.md).

    Proxy files contain paths relative to the skill directory (e.g.
    `rules/project-rules.md` resolves to `.claude/skills/<name>/rules/project-rules.md`).
    We validate against all registered skill directories.
    """
    skills_dir = project_root / ".claude" / "skills"
    skill_dirs = [
        d for d in skills_dir.iterdir()
        if d.is_dir() and d.name != "shared"
    ] if skills_dir.exists() else []

    for proxy in shells:
        if not proxy.exists():
            continue
        text = proxy.read_text(encoding="utf-8")
        refs = re.findall(r"`([^`]+\.(?:md|mdc|sh|py))`", text)
        for ref in refs:
            if ref.startswith(("http://", "https://", "#")):
                continue

            # Try project-root resolution first
            target = project_root / ref
            resolved = target.resolve()
            found = False
            try:
                resolved.relative_to(project_root)
                if resolved.exists():
                    found = True
            except ValueError:
                pass

            # Fallback: try skill-relative resolution
            if not found:
                for sdir in skill_dirs:
                    skill_target = (sdir / ref).resolve()
                    try:
                        skill_target.relative_to(project_root)
                        if skill_target.exists():
                            found = True
                            break
                    except ValueError:
                        pass

            if not found:
                rel = proxy.resolve().relative_to(project_root)
                emit_full(
                    "ERROR",
                    f"Broken link in {rel}: `{ref}` not found",
                    "Users see dead references; documentation rot",
                    "Fix the link path or create the target file",
                )


def check_gotchas_empty(skill_dir: Path) -> None:
    gotchas = skill_dir / "references" / "gotchas.md"
    if not gotchas.exists():
        emit_full(
            "WARN",
            "references/gotchas.md missing",
            "No gotchas reference for agents to consult",
            "Create an empty gotchas.md or remove reference",
        )
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
        emit_full(
            "WARN",
            f"gotchas.md has {len(content_lines)} content lines — verify they are real pitfalls",
            "Prefabricated examples reduce signal-to-noise",
            "Review and keep only genuine pitfalls; remove templated filler",
        )


def check_deprecated_rules(skill_dir: Path) -> None:
    for md_file in skill_dir.rglob("*.md"):
        text = md_file.read_text(encoding="utf-8")
        if "<!-- DEPRECATED" in text:
            dates = re.findall(r"DEPRECATED:.*?([0-9]{4}-[0-9]{2}-[0-9]{2})", text)
            for d in dates:
                try:
                    dep_date = datetime.strptime(d, "%Y-%m-%d")
                    age_days = (datetime.now() - dep_date).days
                    if age_days > 30:
                        rel = md_file.relative_to(skill_dir)
                        emit_full(
                            "WARN",
                            f"{rel}: DEPRECATED marker from {d} ({age_days} days old)",
                            "Stale markers confuse readers about current conventions",
                            "Remove the deprecated section or update the marker date",
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
                emit_full(
                    "ERROR",
                    f"Unreplaced placeholder in {rel}: {{NAME}} or {{PROJECT}}",
                    "Incomplete setup; template values leaked to production",
                    "Replace placeholders with actual project/skill names",
                )
            if "<!-- FILL:" in text:
                rel = f.relative_to(Path("."))
                count = text.count("<!-- FILL:")
                emit_full(
                    "WARN",
                    f"{rel}: {count} FILL marker(s) remaining",
                    "Incomplete documentation; agents may skip required reads",
                    "Complete all FILL sections or remove resolved markers",
                )


# Drift Detection


def _extract_markdown_table_rows(content: str, required_headers: list[str]) -> list[dict[str, str]]:
    """Extract markdown table rows whose headers match required_headers (case-insensitive)."""
    lines = content.splitlines()
    header_pattern = re.compile(r"^\|.*\|$")

    for i, line in enumerate(lines):
        stripped = line.strip()
        if not header_pattern.match(stripped):
            continue

        cells = [c.strip() for c in stripped.split("|")]
        cells = [c for c in cells if c]

        # Normalize for comparison
        norm_cells = [re.sub(r"[^a-z0-9]", "", c.lower()) for c in cells]
        norm_headers = [re.sub(r"[^a-z0-9]", "", h.lower()) for h in required_headers]

        if norm_cells != norm_headers:
            continue

        # Found matching header, next line should be separator; skip it
        if i + 1 >= len(lines):
            return []

        # Collect data rows
        rows: list[dict[str, str]] = []
        for j in range(i + 2, len(lines)):
            row_line = lines[j].strip()
            if not row_line.startswith("|"):
                break

            raw_cells = row_line.split("|")
            # Remove only the first/last empty strings produced by split("|")
            if raw_cells and raw_cells[0] == "":
                raw_cells = raw_cells[1:]
            if raw_cells and raw_cells[-1] == "":
                raw_cells = raw_cells[:-1]
            row_cells = [c.strip() for c in raw_cells]

            # Skip separator-like rows
            if all(re.match(r"^[\s\-:]+$", c) for c in row_cells):
                continue

            if len(row_cells) >= len(required_headers):
                row: dict[str, str] = {}
                for k, h in enumerate(required_headers):
                    row[h] = row_cells[k]
                rows.append(row)
            else:
                break

        return rows

    return []


def _load_sync_shells() -> tuple:
    """Dynamically load sync-shells module and return key functions."""
    script_dir = Path(__file__).resolve().parent
    spec = importlib.util.spec_from_file_location("sync_shells", script_dir / "sync-shells.py")
    if spec is None or spec.loader is None:
        raise ImportError("Cannot load sync-shells.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return (
        mod.generate_parent_gateway,
        mod._generate_skill_routing_table,
        mod._generate_multi_skill_gemini_md,
        mod._generate_multi_skill_codex_instructions,
        mod._generate_multi_skill_cursor_rules,
        mod.run_sync,
    )


def check_manifest_drift() -> list[str]:
    """Compare crp.yaml skills list vs actual directories under .claude/skills/."""
    manifest = load_manifest(Path("crp.yaml"))
    if not manifest:
        return []

    validation_errors = validate_manifest(manifest)
    for err in validation_errors:
        emit_full(
            "ERROR",
            f"crp.yaml validation: {err}",
            "Malformed manifest causes unpredictable tool behavior",
            "Fix the schema error in crp.yaml",
        )

    declared_skills = {s["name"] for s in manifest.get("skills", []) if isinstance(s, dict)}
    skills_dir = Path(".claude/skills")
    actual_skills: set[str] = set()

    if skills_dir.exists():
        for entry in skills_dir.iterdir():
            if entry.is_dir() and entry.name not in ("shared", "SKILL.md"):
                actual_skills.add(entry.name)

    drifted: list[str] = []
    for name in declared_skills:
        skill_dir = skills_dir / name
        if not skill_dir.exists():
            emit_full(
                "ERROR",
                f"Skill '{name}' declared in crp.yaml but directory not found: {skill_dir}",
                "Sync and check will fail for this skill",
                f"Run `crp skill create {name}` or remove from crp.yaml",
            )
            drifted.append(str(skill_dir))

    for name in actual_skills:
        if name not in declared_skills:
            emit_full(
                "INFO",
                f"Undeclared skill directory found: {skills_dir / name}",
                "Manifest does not reflect actual project structure",
                f"Run `crp skill create {name}` to register, or delete the directory",
            )

    return drifted


def check_parent_gateway_drift(fix: bool = False) -> list[str]:
    """Compare actual parent gateway vs expected from manifest + child frontmatters."""
    manifest = load_manifest(Path("crp.yaml"))
    if not manifest or manifest.get("version") != "2.1":
        return []

    parent_gateway = Path(".claude/skills/SKILL.md")
    if not parent_gateway.exists():
        emit_full(
            "ERROR",
            "Parent gateway missing: .claude/skills/SKILL.md",
            "CRP routing table unavailable to agents",
            "Run `crp sync` to generate the parent gateway",
        )
        return [str(parent_gateway)]

    expected_content = generate_parent_gateway(manifest)
    actual_content = parent_gateway.read_text(encoding="utf-8")

    if "GENERATED BY CRP" not in actual_content:
        emit_full(
            "WARN",
            "Parent gateway may be manually edited (missing GENERATED banner)",
            "Manual edits will be overwritten on next sync",
            "Run `crp sync` to regenerate from manifest",
        )

    # Extract skill navigation tables semantically
    expected_rows = _extract_markdown_table_rows(expected_content, ["Skill", "Description", "Entry", "Default"])
    actual_rows = _extract_markdown_table_rows(actual_content, ["Skill", "Description", "Entry", "Default"])

    expected_by_skill = {r["Skill"]: r for r in expected_rows}
    actual_by_skill = {r["Skill"]: r for r in actual_rows}

    drifted: list[str] = []

    for name in expected_by_skill:
        if name not in actual_by_skill:
            emit_full(
                "WARNING",
                f"Skill '{name}' missing from parent gateway table",
                f"Agents won't see routing for '{name}'",
                "Run `crp sync` to regenerate the parent gateway",
            )
            drifted.append(str(parent_gateway))
        else:
            exp_desc = expected_by_skill[name].get("Description", "")
            act_desc = actual_by_skill[name].get("Description", "")
            if exp_desc != act_desc:
                emit_full(
                    "WARNING",
                    f"Skill '{name}' description mismatch in parent gateway",
                    f"Expected '{exp_desc}', found '{act_desc}'",
                    "Run `crp sync` to regenerate from frontmatter",
                )
                drifted.append(str(parent_gateway))

    for name in actual_by_skill:
        if name not in expected_by_skill:
            emit_full(
                "WARNING",
                f"Extra skill '{name}' in parent gateway not declared in manifest",
                "Manifest and gateway are out of sync",
                "Add to crp.yaml or remove the skill directory",
            )
            drifted.append(str(parent_gateway))

    # Check default skill reference
    default_skill = manifest.get("default_skill")
    if default_skill and f"{default_skill}" not in actual_content:
        emit_full(
            "WARNING",
            f"Default skill '{default_skill}' not referenced in parent gateway",
            "Default routing rule may be missing",
            "Run `crp sync` to regenerate",
        )
        drifted.append(str(parent_gateway))

    return drifted


def check_entry_proxy_drift(fix: bool = False) -> list[str]:
    """Check if entry proxies contain expected skill routes."""
    manifest = load_manifest(Path("crp.yaml"))
    if not manifest or manifest.get("version") != "2.1":
        return []

    skills = manifest.get("skills", [])
    if len(skills) <= 1:
        return []

    proxy_files = [
        Path(".claude/CLAUDE.md"),
        Path(".claude/GEMINI.md"),
        Path(".codex/instructions.md"),
        Path(".cursor/rules/workflow.mdc"),
    ]

    try:
        (
            _,
            _generate_skill_routing_table,
            _generate_multi_skill_gemini_md,
            _generate_multi_skill_codex_instructions,
            _generate_multi_skill_cursor_rules,
            _,
        ) = _load_sync_shells()
    except ImportError:
        emit("ERROR", "Cannot load sync-shells.py for drift comparison")
        return []

    project_name = manifest.get("project", {}).get("name", "project")
    generators = {
        ".claude/CLAUDE.md": _generate_skill_routing_table,
        ".claude/GEMINI.md": _generate_multi_skill_gemini_md,
        ".codex/instructions.md": _generate_multi_skill_codex_instructions,
        ".cursor/rules/workflow.mdc": _generate_multi_skill_cursor_rules,
    }

    declared_names = {s["name"] for s in skills if isinstance(s, dict)}
    drifted: list[str] = []

    for proxy in proxy_files:
        if not proxy.exists():
            emit_full(
                "WARNING",
                f"Entry proxy missing: {proxy}",
                f"{proxy.name} users won't have skill routing",
                "Run `crp sync` to generate entry proxies",
            )
            drifted.append(str(proxy))
            continue

        actual_content = proxy.read_text(encoding="utf-8")
        generator = generators.get(str(proxy).replace("\\", "/"))
        if not generator:
            continue

        expected_content = generator(skills, project_name)

        # Extract skill routing tables semantically
        expected_rows = _extract_markdown_table_rows(expected_content, ["Skill", "Description", "Entry"])
        actual_rows = _extract_markdown_table_rows(actual_content, ["Skill", "Description", "Entry"])

        expected_by_skill = {r["Skill"]: r for r in expected_rows}
        actual_by_skill = {r["Skill"]: r for r in actual_rows}

        for name in declared_names:
            if name not in actual_by_skill:
                emit_full(
                    "WARNING",
                    f"Entry proxy {proxy} missing skill route: {name}",
                    f"{proxy.name} users won't see '{name}' skill",
                    "Run `crp sync` to regenerate entry proxies",
                )
                drifted.append(str(proxy))
            elif name in expected_by_skill:
                exp_desc = expected_by_skill[name].get("Description", "")
                act_desc = actual_by_skill[name].get("Description", "")
                if exp_desc != act_desc:
                    emit_full(
                        "WARNING",
                        f"Entry proxy {proxy} description mismatch for '{name}'",
                        f"Expected '{exp_desc}', found '{act_desc}'",
                        "Run `crp sync` to regenerate from frontmatter",
                    )
                    drifted.append(str(proxy))

        for name in actual_by_skill:
            if name not in expected_by_skill:
                emit_full(
                    "WARNING",
                    f"Entry proxy {proxy} has extra skill route: {name}",
                    "Proxy contains skill not declared in manifest",
                    "Remove from proxy or add to crp.yaml",
                )
                drifted.append(str(proxy))

    return drifted


def check_description_consistency() -> list[str]:
    """Warn if crp.yaml skill descriptions differ from SKILL.md frontmatter."""
    manifest = load_manifest(Path("crp.yaml"))
    if not manifest or manifest.get("version") != "2.1":
        return []

    skills = manifest.get("skills", [])
    drifted: list[str] = []
    for skill in skills:
        if not isinstance(skill, dict):
            continue
        name = skill.get("name")
        yaml_desc = skill.get("description", "")
        if not yaml_desc:
            continue  # No description in yaml, nothing to compare

        skill_dir = Path(f".claude/skills/{name}")
        frontmatter = extract_skill_frontmatter(skill_dir)
        fm_desc = frontmatter.get("description", "")

        if yaml_desc != fm_desc:
            emit_full(
                "INFO",
                f"Skill '{name}' description in crp.yaml differs from SKILL.md frontmatter",
                f"crp.yaml says '{yaml_desc}', frontmatter says '{fm_desc}'",
                "Remove description from crp.yaml (source of truth is frontmatter) or update frontmatter",
            )
            drifted.append(str(skill_dir / "SKILL.md"))

    return drifted


def run_check(skill_name: str | None = None, fix: bool = False, drifts: bool = False) -> int:
    """Core health check logic. Called by main() and by crp-setup.py."""
    ISSUES.clear()
    WARNINGS.clear()
    INFOS.clear()
    manifest = load_manifest(Path("crp.yaml"))
    is_v21 = bool(manifest and manifest.get("version") == "2.1")

    max_gateway = DEFAULT_MAX_GATEWAY_LINES
    max_proxy = DEFAULT_MAX_PROXY_LINES
    if manifest and isinstance(manifest.get("checks"), dict):
        checks = manifest["checks"]
        max_gateway = checks.get("max_gateway_lines", DEFAULT_MAX_GATEWAY_LINES)
        max_proxy = checks.get("max_proxy_lines", DEFAULT_MAX_PROXY_LINES)

    if not skill_name:
        skills_dir = Path(".claude/skills")
        if skills_dir.exists():
            subdirs = [d for d in skills_dir.iterdir() if d.is_dir() and d.name != "shared"]
            if len(subdirs) == 1:
                skill_name = subdirs[0].name
            elif is_v21 and len(subdirs) > 1:
                skill_name = subdirs[0].name if subdirs else None

    if drifts:
        print("== Drift Detection ==\n")
        drifted_files: list[str] = []
        drifted_files.extend(check_manifest_drift())
        drifted_files.extend(check_parent_gateway_drift(fix=fix))
        drifted_files.extend(check_entry_proxy_drift(fix=fix))
        drifted_files.extend(check_description_consistency())
        print()

        if fix and drifted_files:
            unique_files = sorted(set(drifted_files))
            print(f"\n== Fix Mode: {len(unique_files)} drifted file(s) ==")
            for f in unique_files:
                print(f"  - {f}")
            try:
                resp = input("\nRegenerate all drifted files? [y/N]: ")
            except (EOFError, OSError):
                resp = ""
            if resp.lower() == "y":
                try:
                    *_, run_sync = _load_sync_shells()
                    sync_rc = run_sync(skill_name=skill_name, check=False)
                    if sync_rc == 0:
                        print("[OK] Regenerated. Re-run `crp check --drifts` to verify.")
                    else:
                        print("[ERROR] Sync failed. Fix manually.")
                except Exception as e:
                    print(f"[ERROR] Could not regenerate: {e}")
            else:
                print("Skipped. Run `crp sync` to regenerate all files.")

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
        try:
            resolved.relative_to(cwd)
        except ValueError:
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

    project_root = Path(".").resolve()

    # Determine skills to check
    skills_to_check: list[Path] = []
    if is_v21 and manifest:
        for s in manifest.get("skills", []):
            if isinstance(s, dict):
                name = s.get("name")
                if name:
                    sdir = Path(f".claude/skills/{name}")
                    if sdir.exists():
                        skills_to_check.append(sdir)
    else:
        skills_to_check = [skill_dir]

    for sdir in skills_to_check:
        print(f"== Health Check: {sdir.name} ==\n")
        check_file_sizes(sdir, shells, max_gateway, max_proxy)
        check_link_integrity(sdir, project_root)
        check_gotchas_empty(sdir)
        check_deprecated_rules(sdir)
        check_placeholders(sdir, shells)

    check_proxy_link_integrity(project_root, shells)

    print(f"\n== Summary ==")
    print(f"Errors:   {len(ISSUES)}")
    print(f"Warnings: {len(WARNINGS)}")
    if INFOS:
        print(f"Infos:    {len(INFOS)}")

    if ISSUES:
        print("\n[FAIL] FAILED - fix errors before continuing")
        return 1
    elif WARNINGS:
        print("\n[WARN] PASSED with warnings")
        return 0
    else:
        print("\n[OK] ALL CLEAR")
        return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="CRP directory health check")
    parser.add_argument("--skill", default=None, help="Skill name (auto-detect if omitted)")
    parser.add_argument("--fix", action="store_true", help="Auto-fix minor issues (interactive)")
    parser.add_argument("--drifts", action="store_true", help="Check for structural drift")
    args = parser.parse_args()

    return run_check(args.skill, args.fix, args.drifts)


if __name__ == "__main__":
    sys.exit(main())
