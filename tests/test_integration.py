"""Integration tests for CRP v2.1 full pipeline."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import pytest

CRISP_ROOT = Path(__file__).resolve().parent.parent
SCRIPTS_DIR = CRISP_ROOT / "scripts"


def run_crp(cwd: Path, *args: str) -> subprocess.CompletedProcess:
    """Run crp-setup.py in a given working directory."""
    cmd = [sys.executable, str(SCRIPTS_DIR / "crp-setup.py"), *args]
    return subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)


class TestFullPipeline:
    def test_init_sync_check_audit_pipeline(self, tmp_path: Path) -> None:
        """End-to-end: init → skill create → sync → check → audit."""
        project = tmp_path / "project"
        project.mkdir()

        # 1. Init
        result = run_crp(project, "init", "--skill", "backend", "--project", "test")
        assert result.returncode == 0, result.stderr
        assert (project / "crp.yaml").exists()
        assert (project / ".claude" / "skills" / "backend" / "SKILL.md").exists()

        # 2. Create second skill
        result = run_crp(project, "skill", "create", "frontend", "--description", "UI")
        assert result.returncode == 0, result.stderr
        assert (project / ".claude" / "skills" / "frontend" / "SKILL.md").exists()

        # 3. Sync (generate parent gateway + proxies)
        result = run_crp(project, "sync")
        assert result.returncode == 0, result.stderr
        assert (project / ".claude" / "skills" / "SKILL.md").exists()
        gateway = (project / ".claude" / "skills" / "SKILL.md").read_text(encoding="utf-8")
        assert "backend" in gateway
        assert "frontend" in gateway

        # 4. Check with drifts
        result = run_crp(project, "check", "--drifts")
        assert "Drift Detection" in result.stdout

        # 5. Audit (multi-skill)
        result = run_crp(project, "audit")
        assert result.returncode == 0, result.stderr
        assert "Multi-Skill Token Audit" in result.stdout

        # 6. Skill list
        result = run_crp(project, "skill", "list")
        assert result.returncode == 0, result.stderr
        assert "backend" in result.stdout
        assert "frontend" in result.stdout

    def test_dry_run_init_creates_no_files(self, tmp_path: Path) -> None:
        """--dry-run must not create any files."""
        project = tmp_path / "dry"
        project.mkdir()

        result = run_crp(project, "init", "--dry-run", "--skill", "s")
        assert result.returncode == 0, result.stderr
        assert not (project / ".claude").exists()

    def test_v20_fallback_without_manifest(self, tmp_path: Path) -> None:
        """v2.0 projects without crp.yaml still work via auto-detection."""
        project = tmp_path / "v20"
        project.mkdir()
        skill_dir = project / ".claude" / "skills" / "legacy"
        skill_dir.mkdir(parents=True)
        (skill_dir / "SKILL.md").write_text(
            "---\nname: legacy\n---\n\n## Common Tasks\n| Task | Must read | Workflow |\n|------|-----------|----------|\n| Fix bug | rules | workflows/fix.md |\n",
            encoding="utf-8",
        )

        result = subprocess.run(
            [sys.executable, str(SCRIPTS_DIR / "sync-shells.py")],
            cwd=project,
            capture_output=True,
            text=True,
        )
        assert result.returncode == 0, result.stderr
        assert (project / ".claude" / "CLAUDE.md").exists()


class TestTokenAudit:
    def test_tiktoken_exact_when_available(self, tmp_path: Path) -> None:
        """When tiktoken is installed, method label should be [exact]."""
        try:
            import tiktoken  # noqa: F401
        except ImportError:
            pytest.skip("tiktoken not installed")

        project = tmp_path / "audit"
        project.mkdir()
        skill_dir = project / ".claude" / "skills" / "test"
        skill_dir.mkdir(parents=True)
        (skill_dir / "SKILL.md").write_text(
            "---\nname: test\n---\n\n## Always Read\n1. `rules/test.md`\n\n## Common Tasks\n| Task | Must read | Workflow |\n|------|-----------|----------|\n| Fix | rules | workflows/fix.md |\n",
            encoding="utf-8",
        )
        (skill_dir / "rules").mkdir()
        (skill_dir / "rules" / "test.md").write_text("# Test rules\n", encoding="utf-8")

        result = subprocess.run(
            [sys.executable, str(SCRIPTS_DIR / "token-audit.py"), "--skill", "test"],
            cwd=project,
            capture_output=True,
            text=True,
        )
        assert result.returncode == 0, result.stderr
        assert "[exact]" in result.stdout

    def test_respects_use_tiktoken_false(self, tmp_path: Path) -> None:
        """When audit.use_tiktoken is false, use chars/4 fallback."""
        project = tmp_path / "audit"
        project.mkdir()
        manifest = {
            "version": "2.1",
            "project": {"name": "audit-test"},
            "skills": [{"name": "test"}],
            "audit": {"use_tiktoken": False},
        }
        import yaml

        with open(project / "crp.yaml", "w", encoding="utf-8") as fh:
            yaml.safe_dump(manifest, fh)

        skill_dir = project / ".claude" / "skills" / "test"
        skill_dir.mkdir(parents=True)
        (skill_dir / "SKILL.md").write_text(
            "---\nname: test\n---\n\n## Common Tasks\n| Task | Must read | Workflow |\n|------|-----------|----------|\n| Fix | rules | workflows/fix.md |\n",
            encoding="utf-8",
        )

        result = subprocess.run(
            [sys.executable, str(SCRIPTS_DIR / "token-audit.py"), "--skill", "test"],
            cwd=project,
            capture_output=True,
            text=True,
        )
        assert result.returncode == 0, result.stderr
        assert "[estimated]" in result.stdout


class TestDriftDetection:
    def test_detects_missing_parent_gateway(self, tmp_path: Path) -> None:
        """Drift detection should report missing parent gateway."""
        project = tmp_path / "drift"
        project.mkdir()
        manifest = {
            "version": "2.1",
            "project": {"name": "drift-test"},
            "skills": [{"name": "backend"}],
        }
        import yaml

        with open(project / "crp.yaml", "w", encoding="utf-8") as fh:
            yaml.safe_dump(manifest, fh)

        result = subprocess.run(
            [sys.executable, str(SCRIPTS_DIR / "health-check.py"), "--drifts"],
            cwd=project,
            capture_output=True,
            text=True,
        )
        assert "Parent gateway missing" in result.stdout

    def test_detects_undeclared_skill_directory(self, tmp_path: Path) -> None:
        """Drift detection should report skill dirs not in manifest."""
        project = tmp_path / "drift"
        project.mkdir()
        manifest = {
            "version": "2.1",
            "project": {"name": "drift-test"},
            "skills": [],
        }
        import yaml

        with open(project / "crp.yaml", "w", encoding="utf-8") as fh:
            yaml.safe_dump(manifest, fh)

        undeclared = project / ".claude" / "skills" / "orphan"
        undeclared.mkdir(parents=True)

        result = subprocess.run(
            [sys.executable, str(SCRIPTS_DIR / "health-check.py"), "--drifts"],
            cwd=project,
            capture_output=True,
            text=True,
        )
        assert "Undeclared skill directory" in result.stdout


class TestValidateCommand:
    """crp validate subcommand tests."""

    def test_validate_passes_on_valid_manifest(self, tmp_path: Path) -> None:
        """crp validate should exit 0 on a valid manifest."""
        project = tmp_path / "val"
        project.mkdir()

        result = run_crp(project, "init", "--skill", "backend", "--project", "val-test")
        assert result.returncode == 0, result.stderr

        result = run_crp(project, "validate")
        assert result.returncode == 0, result.stderr

    def test_validate_fails_on_invalid_manifest(self, tmp_path: Path) -> None:
        """crp validate should report errors on an invalid manifest."""
        project = tmp_path / "val"
        project.mkdir()

        # Write an invalid manifest directly
        import yaml

        bad_manifest = {"version": "99.9", "project": {}, "skills": []}
        with open(project / "crp.yaml", "w", encoding="utf-8") as fh:
            yaml.safe_dump(bad_manifest, fh)

        result = run_crp(project, "validate")
        assert result.returncode == 1
        assert "version" in result.stdout or "project.name" in result.stdout
