from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

CRISP_ROOT = Path(__file__).resolve().parent.parent
EXPERIMENT_DIR = CRISP_ROOT / "experiment"


class TestSetupNaive:
    def test_setup_naive_flattens_files(self, tmp_path: Path) -> None:
        """setup-naive.py should merge skill files into monolithic CLAUDE.md."""
        skill_dir = tmp_path / ".claude" / "skills" / "backend"
        skill_dir.mkdir(parents=True)
        (skill_dir / "SKILL.md").write_text("# Gateway\n\n## Common Tasks\n", encoding="utf-8")
        (skill_dir / "rules").mkdir()
        (skill_dir / "rules" / "style.md").write_text("# Style Rules\nUse black.\n", encoding="utf-8")
        (skill_dir / "workflows").mkdir()
        (skill_dir / "workflows" / "fix.md").write_text("# Fix Workflow\n1. Reproduce.\n", encoding="utf-8")

        claude_md = tmp_path / "CLAUDE.md"
        claude_md.write_text("# Entry Proxy\n", encoding="utf-8")

        cmd = [sys.executable, str(EXPERIMENT_DIR / "setup-naive.py"), str(tmp_path)]
        result = subprocess.run(cmd, capture_output=True, text=True)

        assert result.returncode == 0, result.stderr
        assert (tmp_path / "CLAUDE.md.bak").exists()
        output = claude_md.read_text(encoding="utf-8")
        assert "# Style Rules" in output
        assert "# Fix Workflow" in output
        assert "# Gateway" in output


class TestCalibrate:
    def test_parse_tokens_standard_format(self) -> None:
        """Parse standard Claude Code token output line."""
        from experiment.calibrate import parse_tokens

        line = "Tokens: 1,234 in / 567 out"
        result = parse_tokens(line)
        assert result == (1234, 567)

    def test_parse_tokens_no_commas(self) -> None:
        """Parse token line without comma separators."""
        from experiment.calibrate import parse_tokens

        line = "Tokens: 1234 in / 567 out"
        result = parse_tokens(line)
        assert result == (1234, 567)

    def test_parse_tokens_no_match_returns_none(self) -> None:
        """Non-token lines return None."""
        from experiment.calibrate import parse_tokens

        assert parse_tokens("Some random output") is None

    def test_parse_json_tokens_success(self) -> None:
        """Parse tokens from claude -p JSON output."""
        from experiment.calibrate import parse_json_tokens

        stdout = json.dumps(
            {
                "usage": {"input_tokens": 28618, "output_tokens": 41},
                "total_cost_usd": 0.15,
            }
        )
        result = parse_json_tokens(stdout)
        assert result == (28618, 41)

    def test_parse_json_tokens_model_usage_fallback(self) -> None:
        """Parse tokens from modelUsage fallback."""
        from experiment.calibrate import parse_json_tokens

        stdout = json.dumps(
            {"modelUsage": {"K2.6": {"inputTokens": 100, "outputTokens": 50}}}
        )
        result = parse_json_tokens(stdout)
        assert result == (100, 50)

    def test_parse_json_tokens_invalid_json(self) -> None:
        """Invalid JSON returns None."""
        from experiment.calibrate import parse_json_tokens

        assert parse_json_tokens("not json") is None

    def test_parse_json_tokens_missing_usage(self) -> None:
        """JSON without usage data returns None."""
        from experiment.calibrate import parse_json_tokens

        stdout = json.dumps({"type": "result", "result": "hello"})
        assert parse_json_tokens(stdout) is None


class TestAnalyze:
    def test_paired_ttest_detects_significant_difference(self) -> None:
        """Paired t-test should detect significant difference in token counts."""
        from experiment.analyze import analyze_scenario

        # Create mock data: naive consistently uses more tokens
        raw_data = [
            {"scenario": "feature", "worktree": "crisp-crp", "rep": 1, "turn": 1, "input_tokens": 100, "output_tokens": 50},
            {"scenario": "feature", "worktree": "crisp-crp", "rep": 1, "turn": 2, "input_tokens": 110, "output_tokens": 55},
            {"scenario": "feature", "worktree": "crisp-naive", "rep": 1, "turn": 1, "input_tokens": 500, "output_tokens": 50},
            {"scenario": "feature", "worktree": "crisp-naive", "rep": 1, "turn": 2, "input_tokens": 550, "output_tokens": 55},
        ]

        result = analyze_scenario(raw_data, "feature")
        assert result["crp_avg_input"] < result["naive_avg_input"]
        assert result["savings_percent"] > 0
        assert "p_value" in result
