#!/usr/bin/env python3
"""analyze.py -- Statistical analysis of token consumption data.

Usage:
    python experiment/analyze.py \
        --input experiment/data/raw/ \
        --output experiment/data/aggregated/2026-04-24_results.json
"""

from __future__ import annotations

import argparse
import json
import statistics
import sys
from pathlib import Path


def load_raw_data(raw_dir: Path) -> list[dict]:
    """Load all JSONL files from raw directory."""
    records: list[dict] = []
    for path in sorted(raw_dir.glob("*.jsonl")):
        with path.open("r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    records.append(json.loads(line))
    return records


def analyze_scenario(records: list[dict], scenario_name: str) -> dict:
    """Compute metrics and paired t-test for one scenario."""
    crp_turns: list[int] = []
    naive_turns: list[int] = []

    for rec in records:
        if rec["scenario"] != scenario_name:
            continue
        if rec["input_tokens"] is None:
            continue
        if rec["worktree"] == "crisp-crp":
            crp_turns.append(rec["input_tokens"])
        elif rec["worktree"] == "crisp-naive":
            naive_turns.append(rec["input_tokens"])

    if not crp_turns or not naive_turns:
        return {
            "scenario": scenario_name,
            "error": "Insufficient data for comparison",
            "crp_count": len(crp_turns),
            "naive_count": len(naive_turns),
        }

    crp_avg = statistics.mean(crp_turns)
    naive_avg = statistics.mean(naive_turns)
    savings_percent = ((naive_avg - crp_avg) / naive_avg) * 100 if naive_avg > 0 else 0

    # Paired t-test: pair by (rep, turn)
    crp_pairs: dict[tuple, int] = {}
    naive_pairs: dict[tuple, int] = {}
    for rec in records:
        if rec["scenario"] != scenario_name or rec["input_tokens"] is None:
            continue
        key = (rec["rep"], rec["turn"])
        if rec["worktree"] == "crisp-crp":
            crp_pairs[key] = rec["input_tokens"]
        elif rec["worktree"] == "crisp-naive":
            naive_pairs[key] = rec["input_tokens"]

    paired_diffs: list[float] = []
    for key in crp_pairs:
        if key in naive_pairs:
            paired_diffs.append(naive_pairs[key] - crp_pairs[key])

    # T-test using scipy if available, else basic approximation
    p_value = None
    t_statistic = None
    if paired_diffs:
        try:
            from scipy import stats

            t_statistic, p_value = stats.ttest_1samp(paired_diffs, 0)
        except ImportError:
            if len(paired_diffs) > 1:
                mean_diff = statistics.mean(paired_diffs)
                std_diff = statistics.stdev(paired_diffs)
                n = len(paired_diffs)
                t_statistic = mean_diff / (std_diff / (n**0.5)) if std_diff > 0 else 0
                p_value = None

    return {
        "scenario": scenario_name,
        "crp_count": len(crp_turns),
        "naive_count": len(naive_turns),
        "crp_avg_input": round(float(crp_avg), 2),
        "naive_avg_input": round(float(naive_avg), 2),
        "crp_std_input": round(float(statistics.stdev(crp_turns)), 2) if len(crp_turns) > 1 else 0,
        "naive_std_input": round(float(statistics.stdev(naive_turns)), 2) if len(naive_turns) > 1 else 0,
        "savings_percent": round(float(savings_percent), 2),
        "paired_diff_mean": round(float(statistics.mean(paired_diffs)), 2) if paired_diffs else None,
        "paired_diff_std": round(float(statistics.stdev(paired_diffs)), 2) if len(paired_diffs) > 1 else None,
        "paired_n": len(paired_diffs),
        "t_statistic": float(t_statistic) if t_statistic is not None else None,
        "p_value": float(p_value) if p_value is not None else None,
        "significant": bool(p_value is not None and p_value < 0.05),
    }


def analyze_all(raw_dir: Path, output_path: Path) -> dict:
    """Analyze all scenarios and write aggregated results."""
    records = load_raw_data(raw_dir)
    scenarios = sorted({r["scenario"] for r in records})

    results = {}
    for sc in scenarios:
        results[sc] = analyze_scenario(records, sc)

    summary = {
        "total_records": len(records),
        "scenarios": results,
        "overall_savings": round(
            statistics.mean([r["savings_percent"] for r in results.values() if "savings_percent" in r]), 2
        ) if results else None,
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2, ensure_ascii=False)

    return summary


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Analyze token consumption data")
    parser.add_argument("--input", type=Path, required=True, help="Raw JSONL directory")
    parser.add_argument("--output", type=Path, required=True, help="Output JSON path")
    args = parser.parse_args(argv)

    summary = analyze_all(args.input, args.output)
    print(f"Analyzed {summary['total_records']} records")
    for sc, res in summary["scenarios"].items():
        sig = "*" if res.get("significant") else ""
        print(f"  {sc}: {res.get('savings_percent')}% savings {sig}(p={res.get('p_value')})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
