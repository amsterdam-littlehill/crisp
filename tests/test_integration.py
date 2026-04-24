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

    def test_rounds_argument_changes_simulation_count(self, tmp_path: Path) -> None:
        """I6: --rounds should override the default 5-round simulation."""
        project = tmp_path / "audit"
        project.mkdir()
        skill_dir = project / ".claude" / "skills" / "test"
        skill_dir.mkdir(parents=True)
        (skill_dir / "SKILL.md").write_text(
            "---\nname: test\n---\n\n## Common Tasks\n"
            "| Task | Must read | Workflow |\n"
            "|------|-----------|----------|\n"
            "| Fix | rules | workflows/fix.md |\n",
            encoding="utf-8",
        )

        result = subprocess.run(
            [sys.executable, str(SCRIPTS_DIR / "token-audit.py"), "--skill", "test", "--rounds", "3"],
            cwd=project,
            capture_output=True,
            text=True,
        )
        assert result.returncode == 0, result.stderr
        assert "3-round" in result.stdout or "3 round" in result.stdout.lower()

    def test_scenario_argument_uses_custom_task_sequence(self, tmp_path: Path) -> None:
        """I6: --scenario should override the default task sequence."""
        project = tmp_path / "audit"
        project.mkdir()
        skill_dir = project / ".claude" / "skills" / "test"
        skill_dir.mkdir(parents=True)
        (skill_dir / "SKILL.md").write_text(
            "---\nname: test\n---\n\n## Common Tasks\n"
            "| Task | Must read | Workflow |\n"
            "|------|-----------|----------|\n"
            "| Fix | rules | workflows/fix.md |\n",
            encoding="utf-8",
        )

        result = subprocess.run(
            [
                sys.executable,
                str(SCRIPTS_DIR / "token-audit.py"),
                "--skill",
                "test",
                "--scenario",
                "fix,fix,fix",
                "--rounds",
                "3",
            ],
            cwd=project,
            capture_output=True,
            text=True,
        )
        assert result.returncode == 0, result.stderr
        # With a custom scenario of 3 fix tasks, output should mention the scenario
        assert "fix" in result.stdout.lower()


class TestFromExistingDecoupling:
    """I2: --from-existing should not suppress template copies."""

    def test_from_existing_copies_missing_shells(self, tmp_path: Path) -> None:
        """When --from-existing is used, entry proxies should still be created."""
        project = tmp_path / "existing"
        project.mkdir()

        # Create a v2.0-style skill directory
        skill_dir = project / ".claude" / "skills" / "backend"
        skill_dir.mkdir(parents=True)
        (skill_dir / "SKILL.md").write_text("# backend\n", encoding="utf-8")

        result = run_crp(project, "init", "--from-existing", "--skill", "backend")
        assert result.returncode == 0, result.stderr
        assert (project / ".claude" / "CLAUDE.md").exists()

    def test_from_existing_with_shadow_preserves_existing(self, tmp_path: Path) -> None:
        """--from-existing --shadow should preserve existing proxy files."""
        project = tmp_path / "existing"
        project.mkdir()

        skill_dir = project / ".claude" / "skills" / "backend"
        skill_dir.mkdir(parents=True)
        (skill_dir / "SKILL.md").write_text("# backend\n", encoding="utf-8")

        # Create an existing proxy with custom content
        proxy = project / ".claude" / "CLAUDE.md"
        proxy.parent.mkdir(parents=True, exist_ok=True)
        proxy.write_text("# Custom proxy\n", encoding="utf-8")

        result = run_crp(project, "init", "--from-existing", "--skill", "backend", "--shadow")
        assert result.returncode == 0, result.stderr
        assert "Custom proxy" in proxy.read_text(encoding="utf-8")


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


class TestPyprojectDependencies:
    """I5: pyproject.toml must declare runtime dependencies."""

    def test_pyproject_toml_exists(self) -> None:
        """Project root must contain pyproject.toml."""
        assert (CRISP_ROOT / "pyproject.toml").exists(), "pyproject.toml missing"

    def test_declares_pyyaml_dependency(self) -> None:
        """pyyaml is a runtime dependency used by crp_manifest.py."""
        text = (CRISP_ROOT / "pyproject.toml").read_text(encoding="utf-8")
        assert "pyyaml" in text.lower(), "pyyaml not declared in pyproject.toml"

    def test_declares_pytest_dependency(self) -> None:
        """pytest is needed to run the test suite."""
        text = (CRISP_ROOT / "pyproject.toml").read_text(encoding="utf-8")
        assert "pytest" in text.lower(), "pytest not declared in pyproject.toml"


class TestCommonTasksParse:
    """I1/I3: parse_common_tasks must return ParseResult with found/empty validation."""

    def test_parse_result_for_valid_tasks(self, tmp_path: Path) -> None:
        """Valid Common Tasks table → found=True, tasks populated."""
        from crp_gateway import parse_common_tasks

        gateway = tmp_path / "SKILL.md"
        gateway.write_text(
            "# Skill\n\n## Common Tasks\n| Task | Must read | Workflow |\n"
            "|------|-----------|----------|\n"
            "| Fix | rules | workflows/fix.md |\n",
            encoding="utf-8",
        )
        result = parse_common_tasks(gateway)
        assert result.found is True
        assert len(result.tasks) == 1
        assert result.tasks[0]["task"] == "Fix"

    def test_parse_result_when_section_missing(self, tmp_path: Path) -> None:
        """Missing Common Tasks section → found=False, empty tasks, message set."""
        from crp_gateway import parse_common_tasks

        gateway = tmp_path / "SKILL.md"
        gateway.write_text("# Skill\n\nNo common tasks here.\n", encoding="utf-8")
        result = parse_common_tasks(gateway)
        assert result.found is False
        assert result.tasks == []
        assert "Common Tasks" in result.message

    def test_parse_result_when_table_empty(self, tmp_path: Path) -> None:
        """Empty Common Tasks table → found=True, empty tasks, no error message."""
        from crp_gateway import parse_common_tasks

        gateway = tmp_path / "SKILL.md"
        gateway.write_text(
            "# Skill\n\n## Common Tasks\n| Task | Must read | Workflow |\n"
            "|------|-----------|----------|\n",
            encoding="utf-8",
        )
        result = parse_common_tasks(gateway)
        assert result.found is True
        assert result.tasks == []
        assert result.message == ""


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
