"""Tests for crp_manifest.py — YAML I/O, validation, and frontmatter extraction."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

from crp_manifest import (
    default_manifest,
    extract_skill_frontmatter,
    load_manifest,
    save_manifest,
    validate_manifest,
)


class TestLoadManifest:
    def test_missing_file_returns_empty_dict(self, tmp_path: Path) -> None:
        result = load_manifest(tmp_path / "nonexistent.yaml")
        assert result == {}

    def test_loads_valid_yaml(self, tmp_path: Path) -> None:
        path = tmp_path / "crp.yaml"
        path.write_text("version: '2.1'\nproject:\n  name: test\n", encoding="utf-8")
        result = load_manifest(path)
        assert result["version"] == "2.1"
        assert result["project"]["name"] == "test"


class TestSaveManifest:
    def test_round_trip_preserves_data(self, tmp_path: Path) -> None:
        path = tmp_path / "crp.yaml"
        data = {
            "version": "2.1",
            "project": {"name": "round-trip", "description": "test"},
            "skills": [{"name": "backend", "description": "API"}],
        }
        save_manifest(path, data)
        loaded = load_manifest(path)
        assert loaded["version"] == "2.1"
        assert loaded["project"]["name"] == "round-trip"
        assert loaded["skills"][0]["name"] == "backend"


class TestValidateManifest:
    def test_valid_manifest_no_errors(self) -> None:
        data = {
            "version": "2.1",
            "project": {"name": "test"},
            "skills": [{"name": "backend"}],
            "default_skill": "backend",
        }
        assert validate_manifest(data) == []

    def test_missing_version(self) -> None:
        errors = validate_manifest({"project": {"name": "test"}, "skills": []})
        assert any("version" in e for e in errors)

    def test_duplicate_skill_names(self) -> None:
        data = {
            "version": "2.1",
            "project": {"name": "test"},
            "skills": [{"name": "backend"}, {"name": "backend"}],
        }
        errors = validate_manifest(data)
        assert any("Duplicate" in e for e in errors)

    def test_default_skill_not_found(self) -> None:
        data = {
            "version": "2.1",
            "project": {"name": "test"},
            "skills": [{"name": "backend"}],
            "default_skill": "frontend",
        }
        errors = validate_manifest(data)
        assert any("default_skill" in e for e in errors)

    def test_invalid_checks_values(self) -> None:
        data = {
            "version": "2.1",
            "project": {"name": "test"},
            "skills": [],
            "checks": {"max_gateway_lines": -10},
        }
        errors = validate_manifest(data)
        assert any("max_gateway_lines" in e for e in errors)

    def test_invalid_audit_use_tiktoken(self) -> None:
        data = {
            "version": "2.1",
            "project": {"name": "test"},
            "skills": [],
            "audit": {"use_tiktoken": "yes"},
        }
        errors = validate_manifest(data)
        assert any("use_tiktoken" in e for e in errors)


class TestExtractSkillFrontmatter:
    def test_extracts_name_and_description(self, tmp_path: Path) -> None:
        skill_dir = tmp_path / "backend"
        skill_dir.mkdir()
        frontmatter = "---\nname: backend\ndescription: API work\nprimary: true\n---\n\n# Content"
        (skill_dir / "SKILL.md").write_text(frontmatter, encoding="utf-8")
        result = extract_skill_frontmatter(skill_dir)
        assert result["name"] == "backend"
        assert result["description"] == "API work"
        assert result["primary"] is True

    def test_missing_file_returns_empty(self, tmp_path: Path) -> None:
        result = extract_skill_frontmatter(tmp_path / "nonexistent")
        assert result == {}

    def test_no_frontmatter_returns_empty(self, tmp_path: Path) -> None:
        skill_dir = tmp_path / "skill"
        skill_dir.mkdir()
        (skill_dir / "SKILL.md").write_text("# No frontmatter\n", encoding="utf-8")
        result = extract_skill_frontmatter(skill_dir)
        assert result == {}


class TestDefaultManifest:
    def test_has_expected_structure(self) -> None:
        manifest = default_manifest("my-project")
        assert manifest["version"] == "2.1"
        assert manifest["project"]["name"] == "my-project"
        assert manifest["skills"] == []
        assert manifest["checks"]["max_gateway_lines"] == 100
        assert manifest["audit"]["use_tiktoken"] is True
