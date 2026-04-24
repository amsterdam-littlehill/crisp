#!/usr/bin/env python3
"""run-session.py -- Automate one Claude Code session and record token usage.

Usage:
    python experiment/run-session.py \
        --worktree ../crisp-crp \
        --scenario feature \
        --rep 1 \
        --output experiment/data/raw/2026-04-24_120000_feature_crp_r1.jsonl

Runs `claude -p` for each turn in the scenario, parses JSON token usage,
and writes one JSONL record per turn.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

# Import from sibling modules
sys.path.insert(0, str(Path(__file__).resolve().parent))
from calibrate import parse_json_tokens  # noqa: E402

SCENARIOS_PATH = Path(__file__).resolve().parent / "scenarios.json"


def load_scenario(name: str) -> list[str]:
    """Load turn messages for a scenario."""
    data = json.loads(SCENARIOS_PATH.read_text(encoding="utf-8"))
    for sc in data["scenarios"]:
        if sc["name"] == name:
            return sc["turns"]
    raise ValueError(f"Scenario '{name}' not found in {SCENARIOS_PATH}")


def _claude_env() -> dict[str, str]:
    """Return environment dict with CLAUDE_CODE_GIT_BASH_PATH set if needed."""
    env = os.environ.copy()
    if "CLAUDE_CODE_GIT_BASH_PATH" not in env:
        try:
            result = subprocess.run(
                ["bash", "-c", "cygpath -w $(which bash)"],
                capture_output=True,
                text=True,
                timeout=5,
            )
            path = result.stdout.strip()
            if path and Path(path).exists():
                env["CLAUDE_CODE_GIT_BASH_PATH"] = path
        except (subprocess.TimeoutExpired, FileNotFoundError):
            pass
    return env


def run_turn(worktree: Path, message: str, timeout: int) -> dict:
    """Run a single turn via `claude -p` and return token data."""
    env = _claude_env()
    cmd = [
        "claude",
        "-p",
        message,
        "--output-format",
        "json",
        "--permission-mode",
        "auto",
    ]

    input_tokens = None
    output_tokens = None
    error = None
    raw_stdout = None

    try:
        result = subprocess.run(
            cmd,
            cwd=worktree,
            capture_output=True,
            text=True,
            encoding="utf-8",
            timeout=timeout,
            env=env,
        )
        raw_stdout = result.stdout[:2000] if result.stdout else None

        if result.returncode != 0:
            error = f"claude exit code {result.returncode}: {result.stderr[:500]}"
        else:
            tokens = parse_json_tokens(result.stdout)
            if tokens:
                input_tokens, output_tokens = tokens
            else:
                error = "Failed to parse JSON tokens from stdout"

    except subprocess.TimeoutExpired:
        error = f"timeout after {timeout}s"

    return {
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "error": error,
        "raw_stdout": raw_stdout,
    }


def run_session(
    worktree: Path,
    scenario_name: str,
    rep: int,
    output_path: Path,
    timeout: int = 600,
) -> dict:
    """Run one full session and write raw JSONL.

    Returns summary dict with success/failure counts.
    """
    turns = load_scenario(scenario_name)
    records: list[dict] = []
    success_count = 0
    failure_count = 0

    print(f"Starting session: {scenario_name} in {worktree} (rep {rep})")

    for turn_idx, message in enumerate(turns, start=1):
        print(f"  Turn {turn_idx}/{len(turns)} ...")

        start_time = datetime.now(timezone.utc).isoformat()

        turn_result = run_turn(worktree, message, timeout)

        record = {
            "scenario": scenario_name,
            "worktree": worktree.name,
            "rep": rep,
            "turn": turn_idx,
            "input_tokens": turn_result["input_tokens"],
            "output_tokens": turn_result["output_tokens"],
            "timestamp": start_time,
            "error": turn_result["error"],
        }

        if turn_result["error"]:
            failure_count += 1
            print(f"    ERROR: {turn_result['error']}")
        else:
            success_count += 1
            print(
                f"    OK: {turn_result['input_tokens']} in / {turn_result['output_tokens']} out"
            )

        records.append(record)

        # Small delay between turns
        time.sleep(1)

    # Write JSONL
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as f:
        for rec in records:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")

    print(f"  Wrote {len(records)} records to {output_path}")
    print(f"  Success: {success_count}, Failure: {failure_count}")

    return {
        "total_turns": len(turns),
        "success": success_count,
        "failure": failure_count,
        "output_path": str(output_path),
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run one Claude Code session")
    parser.add_argument("--worktree", type=Path, required=True, help="Path to worktree")
    parser.add_argument("--scenario", required=True, help="Scenario name")
    parser.add_argument("--rep", type=int, required=True, help="Repetition number")
    parser.add_argument("--output", type=Path, required=True, help="Output JSONL path")
    parser.add_argument(
        "--timeout", type=int, default=600, help="Per-turn timeout in seconds"
    )
    args = parser.parse_args(argv)

    summary = run_session(
        worktree=args.worktree.resolve(),
        scenario_name=args.scenario,
        rep=args.rep,
        output_path=args.output,
        timeout=args.timeout,
    )

    return 0 if summary["failure"] == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
