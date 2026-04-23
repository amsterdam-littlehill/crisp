#!/usr/bin/env python3
"""
token-audit.py — Estimate and compare token costs for CRP vs naive loading.

Scans all markdown files in the project and estimates token consumption
under two regimes:
    1. Naive: load every .md file on every task
    2. CRP: load only L0 (Always Read) + L1 (task-specific) files

Token estimation uses a simple heuristic (chars / 4) by default.
Install `tiktoken` for more accurate counts: pip install tiktoken

Usage:
    python scripts/token-audit.py [--skill <name>] [--report]

    --skill   Skill directory to audit (default: auto-detect)
    --report  Write JSON report to benchmark-report.json
"""

import argparse
import json
import os
import re
import sys
from pathlib import Path


def estimate_tokens(text: str, method: str = "heuristic") -> int:
    """Estimate token count."""
    if method == "tiktoken":
        try:
            import tiktoken

            enc = tiktoken.get_encoding("cl100k_base")
            return len(enc.encode(text))
        except ImportError:
            pass
    # Fallback heuristic: ~4 chars per token for English/Chinese technical text
    return len(text) // 4


def scan_files(skill_dir: Path) -> dict[str, int]:
    """Return mapping of relative path → token count for all .md and .sh files."""
    results = {}
    for pattern in ("*.md", "*.sh"):
        for f in sorted(skill_dir.rglob(pattern)):
            rel = f.relative_to(skill_dir).as_posix()
            text = f.read_text(encoding="utf-8")
            results[rel] = estimate_tokens(text)
    return results


def parse_always_read(gateway_path: Path) -> list[str]:
    """Extract Always Read file list from gateway.md."""
    content = gateway_path.read_text(encoding="utf-8")
    files = []
    in_section = False
    for line in content.splitlines():
        if re.search(r"##\s+Always Read", line, re.IGNORECASE):
            in_section = True
            continue
        if in_section and line.startswith("##"):
            break
        if in_section:
            m = re.search(r"`?rules/([^`\s]+)`?", line)
            if m:
                files.append(f"rules/{m.group(1)}")
    return files


def parse_common_tasks(gateway_path: Path) -> dict[str, list[str]]:
    """Extract per-task file loads from Common Tasks table."""
    content = gateway_path.read_text(encoding="utf-8")
    tasks = {}
    section_match = re.search(
        r"##\s+Common Tasks.*?(\n##\s|\Z)", content, re.DOTALL | re.IGNORECASE
    )
    if not section_match:
        return tasks

    section = section_match.group(0)
    lines = [ln for ln in section.splitlines() if ln.strip().startswith("|")]
    for line in lines[2:]:  # skip header + separator
        cells = [c.strip() for c in line.split("|")]
        cells = [c for c in cells if c]
        if len(cells) >= 3 and cells[0].lower() not in ("task", "<!-- fill:"):
            raw_name = cells[0]
            # Normalize to snake_case for consistent keys
            task_name = re.sub(r"[^\w\s]", "", raw_name).strip().lower().replace(" ", "_")
            reads = cells[1]
            # Extract all `path/to/file.md` references
            refs = re.findall(r"`([^`]+\.(?:md|mdc))`", reads)
            tasks[task_name] = refs
    return tasks


def audit_skill(skill_dir: Path, skill_name: str) -> dict:
    gateway = skill_dir / "SKILL.md"
    if not gateway.exists():
        print(f"ERROR: {gateway} not found")
        sys.exit(1)

    file_tokens = scan_files(skill_dir)

    # Naive: load everything
    naive_total = sum(file_tokens.values())

    # CRP: L0 + L1 per task
    l0_files = parse_always_read(gateway)
    l0_tokens = sum(file_tokens.get(f, 0) for f in l0_files)

    # Gateway itself is L2
    gateway_tokens = estimate_tokens(gateway.read_text(encoding="utf-8"))

    tasks = parse_common_tasks(gateway)
    per_task = {}
    for task_name, refs in tasks.items():
        task_specific = sum(file_tokens.get(f, 0) for f in refs)
        per_task[task_name] = l0_tokens + gateway_tokens + task_specific

    # Other / unlisted: L0 + gateway only
    per_task["other_unlisted"] = l0_tokens + gateway_tokens

    # Session simulation: 5 rounds, mixed tasks
    round_tasks = ["fix_bug", "add_feature", "other_unlisted", "fix_bug", "add_feature"]
    session_naive = naive_total * 5
    session_crp = sum(per_task.get(t, per_task["other_unlisted"]) for t in round_tasks)

    # Cost estimate: Claude Sonnet 4.6 input pricing ~$3/1M tokens
    cost_naive = (session_naive / 1_000_000) * 3.0
    cost_crp = (session_crp / 1_000_000) * 3.0

    return {
        "skill_name": skill_name,
        "method": "heuristic",
        "single_file_tokens": file_tokens,
        "naive_all_tokens": naive_total,
        "l0_tokens": l0_tokens,
        "gateway_tokens": gateway_tokens,
        "per_task_tokens": per_task,
        "session_5rounds": {
            "naive_total_tokens": session_naive,
            "crp_total_tokens": session_crp,
            "savings_percent": round((1 - session_crp / session_naive) * 100, 1),
        },
        "cost_usd": {
            "naive": round(cost_naive, 4),
            "crp": round(cost_crp, 4),
            "savings": round(cost_naive - cost_crp, 4),
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Token audit for CRP vs naive loading")
    parser.add_argument("--skill", default=None, help="Skill name (auto-detect if omitted)")
    parser.add_argument("--report", action="store_true", help="Write JSON to benchmark-report.json")
    args = parser.parse_args()

    skill_name = args.skill
    skill_dir = None

    if not skill_name:
        # Auto-detect: look for .claude/skills/*/
        skills_dir = Path(".claude/skills")
        if skills_dir.exists():
            subdirs = [d for d in skills_dir.iterdir() if d.is_dir() and d.name != "shared"]
            if len(subdirs) == 1:
                skill_name = subdirs[0].name
                skill_dir = subdirs[0]
            elif len(subdirs) > 1:
                print("Multiple skills found. Use --skill to specify one:")
                for d in subdirs:
                    print(f"  --skill {d.name}")
                return 1

        # Fallback: check templates/skill/
        if skill_dir is None:
            template_skill = Path("templates/skill")
            if template_skill.exists():
                skill_name = "skill"
                skill_dir = template_skill

    if not skill_name:
        print("ERROR: Could not auto-detect skill. Use --skill.")
        return 1

    if skill_dir is None:
        # Try .claude/skills first, then templates/skill
        skill_dir = Path(f".claude/skills/{skill_name}")
        if not skill_dir.exists():
            skill_dir = Path(f"templates/{skill_name}")

    if not skill_dir.exists():
        print(f"ERROR: Skill directory not found: {skill_dir}")
        return 1
    try:
        resolved = skill_dir.resolve()
        cwd = Path(".").resolve()
        if not str(resolved).startswith(str(cwd)):
            print("ERROR: Skill path escapes project directory")
            return 1
    except (OSError, ValueError):
        print("ERROR: Invalid skill path")
        return 1

    result = audit_skill(skill_dir, skill_name)

    # Console output
    print(f"\n== Token Audit: {skill_name} ==\n")
    print(f"Estimation method: {result['method']}")
    print(f"Naive load (all files):     {result['naive_all_tokens']:,} tokens")
    print(f"L0 (Always Read):           {result['l0_tokens']:,} tokens")
    print(f"L2 (Gateway/SKILL.md):      {result['gateway_tokens']:,} tokens")
    print("\nPer-task CRP load:")
    for task, tokens in result["per_task_tokens"].items():
        print(f"  {task:20s} {tokens:>8,} tokens")

    sr = result["session_5rounds"]
    print(f"\n5-round session simulation:")
    print(f"  Naive total:  {sr['naive_total_tokens']:,} tokens")
    print(f"  CRP total:    {sr['crp_total_tokens']:,} tokens")
    print(f"  Savings:      {sr['savings_percent']}%")

    c = result["cost_usd"]
    print(f"\nEstimated input cost (Claude Sonnet 4.6, $3/1M tokens):")
    print(f"  Naive: ${c['naive']:.4f}")
    print(f"  CRP:   ${c['crp']:.4f}")
    print(f"  Saved: ${c['savings']:.4f}")

    if args.report:
        out_path = Path("benchmark-report.json")
        out_path.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"\nReport written to {out_path}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
