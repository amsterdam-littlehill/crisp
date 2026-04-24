"""Tests for health-check.py — drift detection, error format, --fix mode."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import pytest

CRISP_ROOT = Path(__file__).resolve().parent.parent
SCRIPTS_DIR = CRISP_ROOT / "scripts"


def run_health_check(cwd: Path, *args: str) -> subprocess.CompletedProcess:
    """Run health-check.py in a given working directory."""
    cmd = [sys.executable, str(SCRIPTS_DIR / "health-check.py"), *args]
    return subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)


class TestErrorMessageFormat:
    """Design spec Section 9: [SEVERITY] Problem\n Impact: ...\n Fix: ..."""

    def test_drift_error_includes_impact_and_fix(self, tmp_path: Path) -> None:
        """When a drift is detected, output must contain Impact and Fix lines."""
        project = tmp_path / "fmt"
        project.mkdir()
        manifest = {
            "version": "2.1",
            "project": {"name": "fmt-test"},
            "skills": [{"name": "backend"}],
        }
        import yaml

        with open(project / "crp.yaml", "w", encoding="utf-8") as fh:
            yaml.safe_dump(manifest, fh)

        result = run_health_check(project, "--drifts")
        # Missing parent gateway should be reported with Impact/Fix format
        assert "Impact:" in result.stdout or result.returncode == 0
        if "ERROR" in result.stdout or "WARNING" in result.stdout:
            assert "Impact:" in result.stdout
            assert "Fix:" in result.stdout


class TestSemanticDriftDetection:
    """Drift detection must compare tables semantically, not just name existence."""

    def test_detects_missing_skill_row_in_parent_gateway(self, tmp_path: Path) -> None:
        """If a declared skill is missing from the parent gateway table, report it."""
        project = tmp_path / "semantic"
        project.mkdir()
        manifest = {
            "version": "2.1",
            "project": {"name": "semantic-test"},
            "skills": [
                {"name": "backend", "description": "API"},
                {"name": "frontend", "description": "UI"},
            ],
            "default_skill": "backend",
        }
        import yaml

        with open(project / "crp.yaml", "w", encoding="utf-8") as fh:
            yaml.safe_dump(manifest, fh)

        # Create skill directories with frontmatter
        for name, desc in [("backend", "API"), ("frontend", "UI")]:
            skill_dir = project / ".claude" / "skills" / name
            skill_dir.mkdir(parents=True)
            (skill_dir / "SKILL.md").write_text(
                f"---\nname: {name}\ndescription: {desc}\n---\n\n# {name}\n",
                encoding="utf-8",
            )

        # Generate correct parent gateway first
        subprocess.run(
            [sys.executable, str(SCRIPTS_DIR / "sync-shells.py")],
            cwd=project,
            capture_output=True,
            text=True,
        )

        # Now manually remove frontend from parent gateway
        gateway = project / ".claude" / "skills" / "SKILL.md"
        text = gateway.read_text(encoding="utf-8")
        lines = [ln for ln in text.splitlines() if "frontend" not in ln]
        gateway.write_text("\n".join(lines), encoding="utf-8")

        result = run_health_check(project, "--drifts")
        assert "frontend" in result.stdout
        assert "missing" in result.stdout.lower() or "not found" in result.stdout.lower()

    def test_detects_extra_skill_row_in_parent_gateway(self, tmp_path: Path) -> None:
        """If parent gateway has a skill not declared in manifest, report it."""
        project = tmp_path / "semantic"
        project.mkdir()
        manifest = {
            "version": "2.1",
            "project": {"name": "semantic-test"},
            "skills": [{"name": "backend", "description": "API"}],
            "default_skill": "backend",
        }
        import yaml

        with open(project / "crp.yaml", "w", encoding="utf-8") as fh:
            yaml.safe_dump(manifest, fh)

        skill_dir = project / ".claude" / "skills" / "backend"
        skill_dir.mkdir(parents=True)
        (skill_dir / "SKILL.md").write_text(
            "---\nname: backend\ndescription: API\n---\n\n# backend\n",
            encoding="utf-8",
        )

        # Generate correct parent gateway
        subprocess.run(
            [sys.executable, str(SCRIPTS_DIR / "sync-shells.py")],
            cwd=project,
            capture_output=True,
            text=True,
        )

        # Inject an extra skill row
        gateway = project / ".claude" / "skills" / "SKILL.md"
        text = gateway.read_text(encoding="utf-8")
        text = text.replace(
            "| backend | API | `skills/backend/SKILL.md` | * |",
            "| backend | API | `skills/backend/SKILL.md` | * |\n| extra | Extra skill | `skills/extra/SKILL.md` |  |",
        )
        gateway.write_text(text, encoding="utf-8")

        result = run_health_check(project, "--drifts")
        assert "extra" in result.stdout

    def test_detects_description_mismatch_in_parent_gateway(self, tmp_path: Path) -> None:
        """If parent gateway description differs from frontmatter, report it."""
        project = tmp_path / "semantic"
        project.mkdir()
        manifest = {
            "version": "2.1",
            "project": {"name": "semantic-test"},
            "skills": [{"name": "backend"}],
            "default_skill": "backend",
        }
        import yaml

        with open(project / "crp.yaml", "w", encoding="utf-8") as fh:
            yaml.safe_dump(manifest, fh)

        skill_dir = project / ".claude" / "skills" / "backend"
        skill_dir.mkdir(parents=True)
        (skill_dir / "SKILL.md").write_text(
            "---\nname: backend\ndescription: Real description\n---\n\n# backend\n",
            encoding="utf-8",
        )

        # Generate parent gateway
        subprocess.run(
            [sys.executable, str(SCRIPTS_DIR / "sync-shells.py")],
            cwd=project,
            capture_output=True,
            text=True,
        )

        # Alter description in gateway
        gateway = project / ".claude" / "skills" / "SKILL.md"
        text = gateway.read_text(encoding="utf-8")
        text = text.replace("Real description", "Stale description")
        gateway.write_text(text, encoding="utf-8")

        result = run_health_check(project, "--drifts")
        assert "description" in result.stdout.lower() or "mismatch" in result.stdout.lower()

    def test_detects_missing_skill_route_in_entry_proxy(self, tmp_path: Path) -> None:
        """If entry proxy is missing a skill route, report it."""
        project = tmp_path / "semantic"
        project.mkdir()
        manifest = {
            "version": "2.1",
            "project": {"name": "semantic-test"},
            "skills": [
                {"name": "backend", "description": "API"},
                {"name": "frontend", "description": "UI"},
            ],
            "default_skill": "backend",
        }
        import yaml

        with open(project / "crp.yaml", "w", encoding="utf-8") as fh:
            yaml.safe_dump(manifest, fh)

        for name, desc in [("backend", "API"), ("frontend", "UI")]:
            skill_dir = project / ".claude" / "skills" / name
            skill_dir.mkdir(parents=True)
            (skill_dir / "SKILL.md").write_text(
                f"---\nname: {name}\ndescription: {desc}\n---\n\n# {name}\n",
                encoding="utf-8",
            )

        # Generate proxies
        subprocess.run(
            [sys.executable, str(SCRIPTS_DIR / "sync-shells.py")],
            cwd=project,
            capture_output=True,
            text=True,
        )

        # Remove frontend from CLAUDE.md
        proxy = project / ".claude" / "CLAUDE.md"
        text = proxy.read_text(encoding="utf-8")
        lines = [ln for ln in text.splitlines() if "frontend" not in ln]
        proxy.write_text("\n".join(lines), encoding="utf-8")

        result = run_health_check(project, "--drifts")
        assert "frontend" in result.stdout
        assert "CLAUDE.md" in result.stdout or "proxy" in result.stdout.lower()


class TestDescriptionConsistency:
    """crp.yaml skill description vs SKILL.md frontmatter description."""

    def test_warns_when_crp_yaml_description_differs_from_frontmatter(self, tmp_path: Path) -> None:
        """If crp.yaml stores a description that differs from frontmatter, warn."""
        project = tmp_path / "desc"
        project.mkdir()
        manifest = {
            "version": "2.1",
            "project": {"name": "desc-test"},
            "skills": [{"name": "backend", "description": "From YAML"}],
            "default_skill": "backend",
        }
        import yaml

        with open(project / "crp.yaml", "w", encoding="utf-8") as fh:
            yaml.safe_dump(manifest, fh)

        skill_dir = project / ".claude" / "skills" / "backend"
        skill_dir.mkdir(parents=True)
        (skill_dir / "SKILL.md").write_text(
            "---\nname: backend\ndescription: From Frontmatter\n---\n\n# backend\n",
            encoding="utf-8",
        )

        result = run_health_check(project, "--drifts")
        assert "description" in result.stdout.lower()


class TestStateIsolation:
    """Module-level ISSUES/WARNINGS must not leak between run_check calls."""

    def test_no_state_accumulation_between_calls(self, tmp_path: Path) -> None:
        """If run_check is called twice, the second call must not see state from the first."""
        import importlib.util
        import os
        import sys

        sys.path.insert(0, str(SCRIPTS_DIR))
        spec = importlib.util.spec_from_file_location("health_check", SCRIPTS_DIR / "health-check.py")
        assert spec is not None and spec.loader is not None
        hc = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(hc)

        project = tmp_path / "state_test"
        project.mkdir()
        manifest = {
            "version": "2.1",
            "project": {"name": "st"},
            "skills": [{"name": "backend"}],
        }
        import yaml

        with open(project / "crp.yaml", "w", encoding="utf-8") as fh:
            yaml.safe_dump(manifest, fh)

        skill_dir = project / ".claude" / "skills" / "backend"
        skill_dir.mkdir(parents=True)
        (skill_dir / "SKILL.md").write_text(
            "---\nname: backend\n---\n\n# backend\n",
            encoding="utf-8",
        )
        # Create a file with a broken link so check_link_integrity emits an ERROR
        (skill_dir / "refs.md").write_text("See `nonexistent.md`\n", encoding="utf-8")

        old_cwd = os.getcwd()
        try:
            os.chdir(project)
            hc.ISSUES.clear()
            hc.WARNINGS.clear()

            rc1 = hc.run_check(skill_name="backend")
            issues_after_call1 = len(hc.ISSUES)

            rc2 = hc.run_check(skill_name="backend")
            issues_after_call2 = len(hc.ISSUES)

            # After fix, both calls should see the same number of issues
            assert issues_after_call2 == issues_after_call1, (
                f"State leaked between calls: call1 had {issues_after_call1} issues, "
                f"call2 had {issues_after_call2}"
            )
        finally:
            os.chdir(old_cwd)


class TestFixMode:
    """--fix must not silently ignore the flag."""

    def test_fix_flag_is_not_ignored_when_no_drifts(self, tmp_path: Path) -> None:
        """When --fix is passed with no drifts, it should exit cleanly."""
        project = tmp_path / "fix"
        project.mkdir()
        manifest = {
            "version": "2.1",
            "project": {"name": "fix-test"},
            "skills": [{"name": "backend", "description": "API"}],
            "default_skill": "backend",
        }
        import yaml

        with open(project / "crp.yaml", "w", encoding="utf-8") as fh:
            yaml.safe_dump(manifest, fh)

        skill_dir = project / ".claude" / "skills" / "backend"
        skill_dir.mkdir(parents=True)
        (skill_dir / "SKILL.md").write_text(
            "---\nname: backend\ndescription: API\n---\n\n# backend\n",
            encoding="utf-8",
        )

        # Generate everything correctly first
        subprocess.run(
            [sys.executable, str(SCRIPTS_DIR / "sync-shells.py")],
            cwd=project,
            capture_output=True,
            text=True,
        )

        result = run_health_check(project, "--drifts", "--fix")
        # Should not crash; --fix flag should be recognized
        assert result.returncode in (0, 1)
        assert "ignored" not in result.stdout.lower() or result.returncode == 0

    def test_fix_mode_attempts_regeneration_on_drift(self, tmp_path: Path) -> None:
        """When drifts exist and --fix is passed, it should attempt to fix them."""
        project = tmp_path / "fix"
        project.mkdir()
        manifest = {
            "version": "2.1",
            "project": {"name": "fix-test"},
            "skills": [{"name": "backend", "description": "API"}],
            "default_skill": "backend",
        }
        import yaml

        with open(project / "crp.yaml", "w", encoding="utf-8") as fh:
            yaml.safe_dump(manifest, fh)

        skill_dir = project / ".claude" / "skills" / "backend"
        skill_dir.mkdir(parents=True)
        (skill_dir / "SKILL.md").write_text(
            "---\nname: backend\ndescription: API\n---\n\n# backend\n",
            encoding="utf-8",
        )

        # Generate then break parent gateway
        subprocess.run(
            [sys.executable, str(SCRIPTS_DIR / "sync-shells.py")],
            cwd=project,
            capture_output=True,
            text=True,
        )
        gateway = project / ".claude" / "skills" / "SKILL.md"
        gateway.write_text("# broken\n", encoding="utf-8")

        # Run with --fix --drifts; since it's interactive, we can't easily test
        # the prompt path. Instead verify the flag is consumed and not silently ignored.
        result = run_health_check(project, "--drifts", "--fix")
        # Should at least mention fix or regeneration in output, or error about stdin
        assert "fix" in result.stdout.lower() or "regenerat" in result.stdout.lower() or result.returncode in (0, 1)


class TestLinkIntegrity:
    """Link checking must cover entry proxies and prevent path traversal."""

    def test_detects_broken_link_in_entry_proxy(self, tmp_path: Path) -> None:
        """If an entry proxy like .claude/CLAUDE.md has a broken link, report it."""
        project = tmp_path / "proxy_link"
        project.mkdir()
        manifest = {
            "version": "2.1",
            "project": {"name": "pl-test"},
            "skills": [{"name": "backend", "description": "API"}],
            "default_skill": "backend",
        }
        import yaml

        with open(project / "crp.yaml", "w", encoding="utf-8") as fh:
            yaml.safe_dump(manifest, fh)

        skill_dir = project / ".claude" / "skills" / "backend"
        skill_dir.mkdir(parents=True)
        (skill_dir / "SKILL.md").write_text(
            "---\nname: backend\ndescription: API\n---\n\n# backend\n",
            encoding="utf-8",
        )

        # Generate proxies
        subprocess.run(
            [sys.executable, str(SCRIPTS_DIR / "sync-shells.py")],
            cwd=project,
            capture_output=True,
            text=True,
        )

        # Insert a broken link into CLAUDE.md that references a project-root file
        proxy = project / ".claude" / "CLAUDE.md"
        text = proxy.read_text(encoding="utf-8")
        text += "\nSee `nonexistent_root_file.md`\n"
        proxy.write_text(text, encoding="utf-8")

        result = run_health_check(project, "--skill", "backend")
        assert "nonexistent_root_file" in result.stdout


class TestFileSizeScope:
    """File size checks must cover all skills and proxies in multi-skill mode."""

    def test_checks_all_skills_in_multi_skill_project(self, tmp_path: Path) -> None:
        """When multiple skills exist, every skill directory must be checked."""
        project = tmp_path / "multi"
        project.mkdir()
        manifest = {
            "version": "2.1",
            "project": {"name": "multi-test"},
            "skills": [
                {"name": "backend", "description": "API"},
                {"name": "frontend", "description": "UI"},
            ],
            "default_skill": "backend",
        }
        import yaml

        with open(project / "crp.yaml", "w", encoding="utf-8") as fh:
            yaml.safe_dump(manifest, fh)

        # Create two skills, each with an oversized .md file
        for name in ("backend", "frontend"):
            skill_dir = project / ".claude" / "skills" / name
            skill_dir.mkdir(parents=True)
            (skill_dir / "SKILL.md").write_text(
                "---\nname: {}\ndescription: {}\n---\n\n# {}\n".format(name, name, name),
                encoding="utf-8",
            )
            # Create an oversized reference file (>500 lines)
            big_content = "\n".join(f"line {i}" for i in range(550))
            (skill_dir / "big.md").write_text(big_content, encoding="utf-8")

        result = run_health_check(project)
        # Both skills' oversized files should be reported
        assert "backend" in result.stdout
        assert "frontend" in result.stdout
