#!/usr/bin/env python3
"""crp_manifest.py — CRP v2.1 manifest I/O and validation.

Handles round-trip YAML editing with ruamel.yaml when available,
gracefully degrading to a minimal fallback parser otherwise.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

try:
    import ruamel.yaml

    HAS_RUAMEL = True
except ImportError:
    HAS_RUAMEL = False

try:
    import yaml as pyyaml

    HAS_PYYAML = True
except ImportError:
    HAS_PYYAML = False

DEFAULT_MAX_GATEWAY_LINES = 100
DEFAULT_MAX_PROXY_LINES = 60


def load_manifest(path: Path) -> dict[str, Any]:
    """Parse crp.yaml. Returns empty defaults if file missing."""
    if not path.exists():
        return {}

    if HAS_RUAMEL:
        return _load_with_ruamel(path)
    if HAS_PYYAML:
        return _load_with_pyyaml(path)
    return _load_fallback(path)


def _load_with_ruamel(path: Path) -> dict[str, Any]:
    y = ruamel.yaml.YAML()
    y.preserve_quotes = True
    with open(path, encoding="utf-8") as fh:
        data = y.load(fh)
    return data if isinstance(data, dict) else {}


def _load_with_pyyaml(path: Path) -> dict[str, Any]:
    with open(path, encoding="utf-8") as fh:
        data = pyyaml.safe_load(fh)
    return data if isinstance(data, dict) else {}


def _load_fallback(path: Path) -> dict[str, Any]:
    """Minimal YAML subset parser for basic CRP manifests.

    Supports: scalars (str/int/bool), nested dicts, and simple lists of dicts.
    """
    text = path.read_text(encoding="utf-8")
    result: dict[str, Any] = {}
    current_list: list[dict[str, Any]] | None = None
    indent_stack: list[tuple[int, dict[str, Any] | list[Any]]] = []

    for raw in text.splitlines():
        line = raw.rstrip("\n\r")
        if not line.strip() or line.strip().startswith("#"):
            continue

        indent = len(line) - len(line.lstrip())
        stripped = line.strip()

        # Pop stack if dedented
        while indent_stack and indent_stack[-1][0] >= indent:
            indent_stack.pop()

        parent = indent_stack[-1][1] if indent_stack else result

        # List item
        if stripped.startswith("- "):
            item_text = stripped[2:].strip()
            if ": " in item_text or ":" in item_text:
                key, val = _split_key_val(item_text)
                if isinstance(parent, dict):
                    if key not in parent:
                        parent[key] = []
                    new_item: dict[str, Any] = {key: _parse_scalar(val)}
                    parent[key].append(new_item)
                    current_list = parent[key]
                    indent_stack.append((indent, current_list))
                else:
                    new_item = {key: _parse_scalar(val)}
                    parent.append(new_item)
                    indent_stack.append((indent, parent))
            else:
                val = _parse_scalar(item_text)
                if isinstance(parent, list):
                    parent.append(val)
                elif isinstance(parent, dict) and current_list is not None:
                    current_list.append(val)
            continue

        # Key-value
        if ":" in stripped:
            key, val = _split_key_val(stripped)
            if val == "":
                # Nested section
                new_section: dict[str, Any] = {}
                if isinstance(parent, dict):
                    parent[key] = new_section
                indent_stack.append((indent, new_section))
            else:
                if isinstance(parent, dict):
                    parent[key] = _parse_scalar(val)
                elif isinstance(parent, list) and parent and isinstance(parent[-1], dict):
                    parent[-1][key] = _parse_scalar(val)

    return result


def _split_key_val(text: str) -> tuple[str, str]:
    idx = text.index(":")
    key = text[:idx].strip()
    val = text[idx + 1 :].strip()
    return key, val


def _parse_scalar(val: str) -> str | int | bool:
    val = val.strip()
    if val.lower() == "true":
        return True
    if val.lower() == "false":
        return False
    if val.startswith('"') and val.endswith('"'):
        return val[1:-1]
    if val.startswith("'") and val.endswith("'"):
        return val[1:-1]
    try:
        return int(val)
    except ValueError:
        pass
    return val


def save_manifest(path: Path, data: dict[str, Any]) -> None:
    """Round-trip write with ruamel.yaml; fallback to basic YAML writer."""
    if HAS_RUAMEL:
        _save_with_ruamel(path, data)
        return
    if HAS_PYYAML:
        _save_with_pyyaml(path, data)
        return
    _save_fallback(path, data)


def _save_with_ruamel(path: Path, data: dict[str, Any]) -> None:
    y = ruamel.yaml.YAML()
    y.indent(mapping=2, sequence=4, offset=2)
    y.preserve_quotes = True
    with open(path, "w", encoding="utf-8") as fh:
        y.dump(data, fh)


def _save_with_pyyaml(path: Path, data: dict[str, Any]) -> None:
    with open(path, "w", encoding="utf-8") as fh:
        pyyaml.safe_dump(data, fh, default_flow_style=False, sort_keys=False)


def _save_fallback(path: Path, data: dict[str, Any]) -> None:
    """Write a minimal YAML representation."""
    lines = _dump_yaml_value(data)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def _dump_yaml_value(value: Any, indent: int = 0) -> list[str]:
    prefix = "  " * indent
    lines: list[str] = []
    if isinstance(value, dict):
        for k, v in value.items():
            if isinstance(v, dict):
                lines.append(f"{prefix}{k}:")
                lines.extend(_dump_yaml_value(v, indent + 1))
            elif isinstance(v, list):
                lines.append(f"{prefix}{k}:")
                for item in v:
                    if isinstance(item, dict):
                        first = True
                        for ik, iv in item.items():
                            if first:
                                lines.append(f"{prefix}  - {ik}: {_fmt_scalar(iv)}")
                                first = False
                            else:
                                lines.append(f"{prefix}    {ik}: {_fmt_scalar(iv)}")
                    else:
                        lines.append(f"{prefix}  - {_fmt_scalar(item)}")
            else:
                lines.append(f"{prefix}{k}: {_fmt_scalar(v)}")
    else:
        lines.append(f"{prefix}{_fmt_scalar(value)}")
    return lines


def _fmt_scalar(v: Any) -> str:
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, int):
        return str(v)
    if isinstance(v, str):
        if not v or any(c in v for c in ":#'{}[]|>&*!?,-"):
            return f'"{v}"'
        return v
    return str(v)


def validate_manifest(data: dict[str, Any]) -> list[str]:
    """Validate manifest schema. Returns list of human-readable errors."""
    errors: list[str] = []

    if not isinstance(data, dict):
        errors.append("Manifest must be a YAML mapping")
        return errors

    version = data.get("version")
    if version is None:
        errors.append("Missing required field: version")
    elif str(version) not in ("2.1", "2.0"):
        errors.append(f"Unsupported version: {version!r} (expected '2.0' or '2.1')")

    project = data.get("project")
    if project is None:
        errors.append("Missing required field: project")
    elif not isinstance(project, dict):
        errors.append("project must be a mapping")
    else:
        if not project.get("name"):
            errors.append("project.name is required")

    skills = data.get("skills")
    if skills is None:
        errors.append("Missing required field: skills")
    elif not isinstance(skills, list):
        errors.append("skills must be a list")
    else:
        names: set[str] = set()
        for i, skill in enumerate(skills):
            if not isinstance(skill, dict):
                errors.append(f"skills[{i}] must be a mapping")
                continue
            name = skill.get("name")
            if not name:
                errors.append(f"skills[{i}] missing 'name'")
            elif not isinstance(name, str):
                errors.append(f"skills[{i}].name must be a string")
            elif name in names:
                errors.append(f"Duplicate skill name: {name!r}")
            else:
                names.add(name)

    default = data.get("default_skill")
    if default is not None and default not in names:
        errors.append(f"default_skill {default!r} not found in skills list")

    checks = data.get("checks", {})
    if isinstance(checks, dict):
        for key in ("max_gateway_lines", "max_proxy_lines"):
            val = checks.get(key)
            if val is not None and (not isinstance(val, int) or val <= 0):
                errors.append(f"checks.{key} must be a positive integer")

    audit = data.get("audit", {})
    if isinstance(audit, dict):
        use_tik = audit.get("use_tiktoken")
        if use_tik is not None and not isinstance(use_tik, bool):
            errors.append("audit.use_tiktoken must be a boolean")

    return errors


def extract_skill_frontmatter(skill_dir: Path) -> dict[str, Any]:
    """Read SKILL.md and extract YAML frontmatter (name, description, primary)."""
    skill_md = skill_dir / "SKILL.md"
    if not skill_md.exists():
        return {}

    text = skill_md.read_text(encoding="utf-8")
    match = re.search(r"^---\s*\n(.*?)\n---\s*\n", text, re.DOTALL)
    if not match:
        return {}

    frontmatter_text = match.group(1)
    if HAS_RUAMEL:
        y = ruamel.yaml.YAML()
        try:
            return y.load(frontmatter_text) or {}
        except Exception:
            return {}
    if HAS_PYYAML:
        try:
            return pyyaml.safe_load(frontmatter_text) or {}
        except Exception:
            return {}
    # Minimal fallback: parse name / description / primary lines
    result: dict[str, Any] = {}
    for line in frontmatter_text.splitlines():
        line = line.strip()
        if line.startswith("name:"):
            result["name"] = line.split(":", 1)[1].strip().strip('"').strip("'")
        elif line.startswith("description:"):
            result["description"] = line.split(":", 1)[1].strip().strip('"').strip("'")
        elif line.startswith("primary:"):
            val = line.split(":", 1)[1].strip().lower()
            result["primary"] = val in ("true", "yes", "1")
    return result


def default_manifest(project_name: str = "", description: str = "") -> dict[str, Any]:
    """Return a fresh v2.1 manifest with sensible defaults."""
    return {
        "version": "2.1",
        "project": {
            "name": project_name or "my-project",
            "description": description or f"{project_name or 'My'} project",
        },
        "skills": [],
        "default_skill": None,
        "checks": {
            "max_gateway_lines": DEFAULT_MAX_GATEWAY_LINES,
            "max_proxy_lines": DEFAULT_MAX_PROXY_LINES,
        },
        "audit": {"use_tiktoken": True},
    }
