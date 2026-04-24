#!/usr/bin/env python3
"""generate-report.py -- Generate charts and markdown report from analysis results.

Usage:
    python experiment/generate-report.py \
        --input experiment/data/aggregated/2026-04-24_results.json \
        --output experiment/reports/2026-04-24_report.md
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def generate_charts(results: dict, report_dir: Path) -> dict[str, Path]:
    """Generate matplotlib charts and return path mapping."""
    try:
        import matplotlib

        matplotlib.use("Agg")  # Non-interactive backend
        import matplotlib.pyplot as plt
    except ImportError:
        print("WARNING: matplotlib not installed, skipping charts")
        return {}

    chart_paths = {}
    scenarios = list(results["scenarios"].keys())

    # Chart 1: Savings percentage bar chart
    fig, ax = plt.subplots(figsize=(8, 5))
    savings = [results["scenarios"][s].get("savings_percent", 0) for s in scenarios]
    colors = ["#2ecc71" if s > 0 else "#e74c3c" for s in savings]
    ax.bar(scenarios, savings, color=colors)
    ax.set_ylabel("Token Savings (%)")
    ax.set_title("CRP vs Naive: Token Savings by Scenario")
    ax.axhline(y=0, color="black", linestyle="-", linewidth=0.5)
    for i, v in enumerate(savings):
        ax.text(i, v + 1, f"{v:.1f}%", ha="center", va="bottom")
    path = report_dir / "savings_by_scenario.png"
    fig.savefig(path, dpi=150, bbox_inches="tight")
    plt.close(fig)
    chart_paths["savings"] = path

    # Chart 2: Average input tokens comparison
    fig, ax = plt.subplots(figsize=(8, 5))
    crp_avgs = [results["scenarios"][s].get("crp_avg_input", 0) for s in scenarios]
    naive_avgs = [results["scenarios"][s].get("naive_avg_input", 0) for s in scenarios]
    x = range(len(scenarios))
    width = 0.35
    ax.bar([i - width / 2 for i in x], crp_avgs, width, label="CRP", color="#3498db")
    ax.bar([i + width / 2 for i in x], naive_avgs, width, label="Naive", color="#e74c3c")
    ax.set_ylabel("Average Input Tokens")
    ax.set_title("Average Input Tokens: CRP vs Naive")
    ax.set_xticks(x)
    ax.set_xticklabels(scenarios)
    ax.legend()
    path = report_dir / "avg_tokens_comparison.png"
    fig.savefig(path, dpi=150, bbox_inches="tight")
    plt.close(fig)
    chart_paths["avg_tokens"] = path

    return chart_paths


def generate_markdown(results: dict, chart_paths: dict[str, Path]) -> str:
    """Generate markdown report content."""
    lines: list[str] = [
        "# CRP Token Efficiency Experiment Report",
        "",
        f"**Total Records**: {results['total_records']}",
        f"**Overall Savings**: {results.get('overall_savings', 'N/A')}%",
        "",
        "## Scenario Results",
        "",
        "| Scenario | CRP Avg | Naive Avg | Savings % | p-value | Significant? |",
        "|----------|---------|-----------|-----------|---------|--------------|",
    ]

    for sc_name, sc_res in results["scenarios"].items():
        sig = "Yes" if sc_res.get("significant") else "No"
        p_val = f"{sc_res.get('p_value', 'N/A'):.4f}" if sc_res.get("p_value") is not None else "N/A"
        lines.append(
            f"| {sc_name} | {sc_res.get('crp_avg_input', 'N/A')} | "
            f"{sc_res.get('naive_avg_input', 'N/A')} | "
            f"{sc_res.get('savings_percent', 'N/A')}% | "
            f"{p_val} | {sig} |"
        )

    lines.extend([
        "",
        "## Charts",
        "",
    ])

    for name, path in chart_paths.items():
        rel = path.name
        lines.append(f"### {name.replace('_', ' ').title()}")
        lines.append(f"![{name}]({rel})")
        lines.append("")

    lines.extend([
        "## Statistical Details",
        "",
        "```json",
        json.dumps(results, indent=2, ensure_ascii=False),
        "```",
        "",
        "## Comparison with Static Estimate",
        "",
        "The static analysis from `scripts/token-audit.py` predicted ~77% savings.",
        "The live experiment results are shown above.",
        "",
        "## Limitations",
        "",
        "- Token parsing relies on Claude Code output format (may change)",
        "- 10 repetitions per scenario provides moderate statistical power",
        "- Per-turn spawning may not capture full session context effects",
        "",
    ])

    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Generate experiment report")
    parser.add_argument("--input", type=Path, required=True, help="Aggregated JSON path")
    parser.add_argument("--output", type=Path, required=True, help="Output markdown path")
    args = parser.parse_args(argv)

    results = json.loads(args.input.read_text(encoding="utf-8"))
    report_dir = args.output.parent
    report_dir.mkdir(parents=True, exist_ok=True)

    chart_paths = generate_charts(results, report_dir)
    markdown = generate_markdown(results, chart_paths)

    args.output.write_text(markdown, encoding="utf-8")
    print(f"Report written to {args.output}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
