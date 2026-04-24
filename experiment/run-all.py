#!/usr/bin/env python3
"""run-all.py -- Orchestrate the full CRP token efficiency experiment.

Usage:
    python experiment/run-all.py \
        --crp-worktree ../crisp-crp \
        --naive-worktree ../crisp-naive \
        --reps 10

Steps:
1. Verify worktrees exist
2. Run setup-naive.py in naive worktree
3. Interleaved execution: 3 scenarios x 2 worktrees x reps
4. Run analysis
5. Generate report
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

EXPERIMENT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = EXPERIMENT_DIR.parent
SCENARIOS = ["feature", "fixbug", "chat"]


def run_setup_naive(naive_worktree: Path) -> None:
    """Run setup-naive.py to flatten CRP rules."""
    cmd = [sys.executable, str(EXPERIMENT_DIR / "setup-naive.py"), str(naive_worktree)]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"setup-naive failed: {result.stderr}")
        sys.exit(1)
    print(f"setup-naive: {result.stdout.strip()}")


def run_session(worktree: Path, scenario: str, rep: int, raw_dir: Path) -> dict:
    """Run a single session via run-session.py."""
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d_%H%M%S")
    output_file = raw_dir / f"{timestamp}_{scenario}_{worktree.name}_r{rep}.jsonl"

    cmd = [
        sys.executable,
        str(EXPERIMENT_DIR / "run-session.py"),
        "--worktree", str(worktree),
        "--scenario", scenario,
        "--rep", str(rep),
        "--output", str(output_file),
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"  WARNING: Session failed for {scenario}/{worktree.name}/r{rep}")
        print(f"  stderr: {result.stderr}")

    return {
        "scenario": scenario,
        "worktree": worktree.name,
        "rep": rep,
        "output": str(output_file),
        "success": result.returncode == 0,
    }


def run_analysis(raw_dir: Path, aggregated_path: Path) -> dict:
    """Run analyze.py on collected data."""
    cmd = [
        sys.executable,
        str(EXPERIMENT_DIR / "analyze.py"),
        "--input", str(raw_dir),
        "--output", str(aggregated_path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"Analysis failed: {result.stderr}")
        sys.exit(1)

    return json.loads(aggregated_path.read_text(encoding="utf-8"))


def run_report(aggregated_path: Path, report_path: Path) -> None:
    """Run generate-report.py."""
    cmd = [
        sys.executable,
        str(EXPERIMENT_DIR / "generate-report.py"),
        "--input", str(aggregated_path),
        "--output", str(report_path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"Report generation failed: {result.stderr}")
        sys.exit(1)
    print(f"Report: {report_path}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run full CRP token experiment")
    parser.add_argument("--crp-worktree", type=Path, required=True)
    parser.add_argument("--naive-worktree", type=Path, required=True)
    parser.add_argument("--reps", type=int, default=10)
    parser.add_argument("--skip-setup", action="store_true", help="Skip naive setup")
    args = parser.parse_args(argv)

    crp_wt = args.crp_worktree.resolve()
    naive_wt = args.naive_worktree.resolve()

    if not crp_wt.exists():
        print(f"ERROR: CRP worktree not found: {crp_wt}")
        return 1
    if not naive_wt.exists():
        print(f"ERROR: Naive worktree not found: {naive_wt}")
        return 1

    raw_dir = EXPERIMENT_DIR / "data" / "raw"
    raw_dir.mkdir(parents=True, exist_ok=True)

    date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    aggregated_path = EXPERIMENT_DIR / "data" / "aggregated" / f"{date_str}_results.json"
    report_path = EXPERIMENT_DIR / "reports" / f"{date_str}_report.md"

    # Step 1: Setup naive worktree
    if not args.skip_setup:
        print("Setting up naive worktree...")
        run_setup_naive(naive_wt)

    # Step 2: Interleaved execution
    total_sessions = len(SCENARIOS) * 2 * args.reps
    print(f"Running {total_sessions} sessions ({len(SCENARIOS)} scenarios x 2 worktrees x {args.reps} reps)")

    session_results: list[dict] = []
    for scenario in SCENARIOS:
        for rep in range(1, args.reps + 1):
            # CRP first, then naive (interleaved per rep)
            print(f"[{scenario}] rep {rep}/{args.reps}")
            session_results.append(run_session(crp_wt, scenario, rep, raw_dir))
            session_results.append(run_session(naive_wt, scenario, rep, raw_dir))

    success_count = sum(1 for r in session_results if r["success"])
    print(f"\nSessions complete: {success_count}/{len(session_results)} successful")

    # Step 3: Analysis
    print("\nRunning analysis...")
    results = run_analysis(raw_dir, aggregated_path)

    # Step 4: Report
    print("\nGenerating report...")
    run_report(aggregated_path, report_path)

    # Terminal summary
    print("\n" + "=" * 50)
    print("EXPERIMENT SUMMARY")
    print("=" * 50)
    print(f"Total sessions: {len(session_results)}")
    print(f"Successful: {success_count}")
    print(f"Overall savings: {results.get('overall_savings', 'N/A')}%")
    for sc, res in results.get("scenarios", {}).items():
        sig = "*" if res.get("significant") else ""
        print(f"  {sc}: {res.get('savings_percent')}% {sig}")
    print(f"\nReport: {report_path}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
