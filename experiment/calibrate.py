#!/usr/bin/env python3
"""calibrate.py -- Detect Claude Code token output format and verify JSON parsing.

Usage:
    python experiment/calibrate.py <worktree-path>

Runs one test turn with `claude -p --output-format json`, captures output,
and reports the detected token format.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path

# Legacy patterns for interactive mode output lines
TOKEN_PATTERNS: list[re.Pattern] = [
    re.compile(r"Tokens:\s+([\d,]+)\s+in\s+/\s+([\d,]+)\s+out"),
    re.compile(r"([\d,]+)\s+tokens\s+in\s+/\s+([\d,]+)\s+out", re.IGNORECASE),
    re.compile(r"in:\s+([\d,]+)\s+out:\s+([\d,]+)", re.IGNORECASE),
]


def parse_tokens(line: str) -> tuple[int, int] | None:
    """Try to parse input/output tokens from a single output line."""
    for pattern in TOKEN_PATTERNS:
        m = pattern.search(line)
        if m:
            inp = int(m.group(1).replace(",", ""))
            out = int(m.group(2).replace(",", ""))
            return inp, out
    return None


def parse_json_tokens(stdout: str) -> tuple[int, int] | None:
    """Parse input/output tokens from `claude -p --output-format json` stdout."""
    try:
        data = json.loads(stdout)
    except json.JSONDecodeError:
        return None
    usage = data.get("usage") or data.get("modelUsage", {}).get("K2.6")
    if not usage:
        return None
    inp = usage.get("input_tokens") or usage.get("inputTokens")
    out = usage.get("output_tokens") or usage.get("outputTokens")
    if inp is not None and out is not None:
        return int(inp), int(out)
    return None


def _find_git_bash() -> str | None:
    """Auto-detect git-bash path for Claude Code on Windows."""
    if os.name == "nt":
        candidates = [
            r"C:\Program Files\Git\bin\bash.exe",
            r"C:\ProgramData\Git\bin\bash.exe",
        ]
        for p in candidates:
            if Path(p).exists():
                return p
    try:
        result = subprocess.run(
            ["bash", "-c", "cygpath -w $(which bash)"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        path = result.stdout.strip()
        if path and Path(path).exists():
            return path
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass
    return None


def _claude_env() -> dict[str, str]:
    """Return environment dict with CLAUDE_CODE_GIT_BASH_PATH set if needed."""
    env = os.environ.copy()
    if "CLAUDE_CODE_GIT_BASH_PATH" not in env:
        git_bash = _find_git_bash()
        if git_bash:
            env["CLAUDE_CODE_GIT_BASH_PATH"] = git_bash
    return env


def calibrate_worktree(worktree: Path) -> dict:
    """Run calibration in a worktree and return detected formats."""
    print(f"Running calibration in {worktree} ...")

    env = _claude_env()
    cmd = [
        "claude",
        "-p",
        "Say hello world",
        "--output-format",
        "json",
        "--permission-mode",
        "auto",
    ]

    result = subprocess.run(
        cmd, cwd=worktree, capture_output=True, text=True, env=env, timeout=60
    )

    print(f"claude exit code: {result.returncode}")

    tokens = parse_json_tokens(result.stdout)
    if tokens:
        print(f"JSON token format detected: {tokens[0]} in / {tokens[1]} out")
    else:
        print("JSON token format NOT detected in stdout.")
        for line in result.stdout.splitlines():
            tokens = parse_tokens(line)
            if tokens:
                print(f"Regex token format detected: {tokens[0]} in / {tokens[1]} out")
                break

    return {
        "worktree": str(worktree),
        "token_patterns_tested": len(TOKEN_PATTERNS),
        "json_tokens_detected": tokens is not None,
        "detected_tokens": tokens,
        "claude_exit_code": result.returncode,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Calibrate token detection")
    parser.add_argument("worktree", type=Path, help="Path to worktree")
    args = parser.parse_args(argv)

    result = calibrate_worktree(args.worktree.resolve())
    print(f"Calibration complete: {result}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
