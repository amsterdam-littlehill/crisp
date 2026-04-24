#!/usr/bin/env python3
"""token-audit.py — Estimate and compare token costs for CRP vs naive loading.

Scans all markdown files in the project and estimates token consumption
under two regimes:
    1. Naive: load every .md file on every task
    2. CRP: load only L0 (Always Read) + L1 (task-specific) files

Token estimation uses tiktoken when available and configured.
Install `tiktoken` for more accurate counts: pip install tiktoken

Usage:
    python scripts/token-audit.py [--skill <name>] [--report]

    --skill   Skill directory to audit (default: auto-detect)
    --report  Write JSON report to benchmark-report.json
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

from crp_manifest import load_manifest

DEFAULT_COST_PER_1M_TOKENS = 3.0


def estimate_tokens(text: str, use_tiktoken: bool = True) -> tuple[int, str]:
    """Estimate token count. Returns (count, method_label).

    method_label is '[exact]' for tiktoken, '[estimated]' for heuristic.
    """
    if use_tiktoken:
        try:
            import tiktoken

            enc = tiktoken.get_encoding("cl100k_base")
            return len(enc.encode(text)), "[exact]"
        except ImportError:
            pass
    return len(text) // 4, "[estimated]"


def scan_files(skill_dir: Path) -> dict[str, int]:
    """Return mapping of relative path → token count for all .md and .sh files."""
    results = {}
    for pattern in ("*.md", "*.sh"):
        for f in sorted(skill_dir.rglob(pattern)):
            rel = f.relative_to(skill_dir).as_posix()
            text = f.read_text(encoding="utf-8")
            results[rel], _ = estimate_tokens(text)
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
    for line in lines[2:]:
        cells = [c.strip() for c in line.split("|")]
        cells = [c for c in cells if c]
        if len(cells) >= 3 and cells[0].lower() not in ("task", "<!-- fill:"):
            raw_name = cells[0]
            task_name = re.sub(r"[^\w\s]", "", raw_name).strip().lower().replace(" ", "_")
            reads = cells[1]
            refs = re.findall(r"`([^`]+\.(?:md|mdc|sh|py))`", reads)
            tasks[task_name] = refs
    return tasks


def audit_skill(skill_dir: Path, skill_name: str, use_tiktoken: bool = True) -> dict:
    gateway = skill_dir / "SKILL.md"
    if not gateway.exists():
        print(f"ERROR: {gateway} not found")
        sys.exit(1)

    file_tokens = scan_files(skill_dir)
    naive_total = sum(file_tokens.values())

    l0_files = parse_always_read(gateway)
    l0_tokens = sum(file_tokens.get(f, 0) for f in l0_files)

    gateway_tokens, method_label = estimate_tokens(gateway.read_text(encoding="utf-8"), use_tiktoken)

    tasks = parse_common_tasks(gateway)
    per_task = {}
    for task_name, refs in tasks.items():
        task_specific = sum(file_tokens.get(f, 0) for f in refs)
        per_task[task_name] = l0_tokens + gateway_tokens + task_specific

    per_task["other_unlisted"] = l0_tokens + gateway_tokens

    round_tasks = ["fix_bug", "add_feature", "other_unlisted", "fix_bug", "add_feature"]
    session_naive = naive_total * 5
    session_crp = sum(per_task.get(t, per_task["other_unlisted"]) for t in round_tasks)

    cost_naive = (session_naive / 1_000_000) * DEFAULT_COST_PER_1M_TOKENS
    cost_crp = (session_crp / 1_000_000) * DEFAULT_COST_PER_1M_TOKENS

    return {
        "skill_name": skill_name,
        "method": method_label,
        "single_file_tokens": file_tokens,
        "naive_all_tokens": naive_total,
        "l0_tokens": l0_tokens,
        "gateway_tokens": gateway_tokens,
        "per_task_tokens": per_task,
        "session_5rounds": {
            "naive_total_tokens": session_naive,
            "crp_total_tokens": session_crp,
            "savings_percent": round((1 - session_crp / session_naive) * 100, 1) if session_naive else 0,
        },
        "cost_per_1m_tokens": DEFAULT_COST_PER_1M_TOKENS,
        "cost_usd": {
            "naive": round(cost_naive, 4),
            "crp": round(cost_crp, 4),
            "savings": round(cost_naive - cost_crp, 4),
        },
    }


def get_skills_to_audit(skill_name: str | None = None) -> list[tuple[str, Path]]:
    """Determine which skills to audit. Returns list of (skill_name, skill_dir)."""
    manifest = load_manifest(Path("crp.yaml"))
    is_v21 = bool(manifest and manifest.get("version") == "2.1")

    if skill_name:
        if any(c in skill_name for c in "./\\"):
            print(f"ERROR: Invalid skill name: {skill_name!r}")
            sys.exit(1)
        skill_dir = Path(f".claude/skills/{skill_name}")
        if not skill_dir.exists():
            skill_dir = Path(f"templates/{skill_name}")
        return [(skill_name, skill_dir)]

    if is_v21:
        skills = manifest.get("skills", [])
        result = []
        for skill in skills:
            name = skill["name"]
            skill_dir = Path(f".claude/skills/{name}")
            if skill_dir.exists():
                result.append((name, skill_dir))
        return result

    # v2.0 fallback: auto-detect single skill
    skills_dir = Path(".claude/skills")
    if skills_dir.exists():
        subdirs = [d for d in skills_dir.iterdir() if d.is_dir() and d.name != "shared"]
        if len(subdirs) == 1:
            return [(subdirs[0].name, subdirs[0])]
        elif len(subdirs) > 1:
            print("Multiple skills found. Use --skill to specify one:")
            for d in subdirs:
                print(f"  --skill {d.name}")
            sys.exit(1)

    template_skill = Path("templates/skill")
    if template_skill.exists():
        return [("skill", template_skill)]

    print("ERROR: Could not auto-detect skill. Use --skill.")
    sys.exit(1)


def run_audit(skill_name: str | None = None, report: bool = False) -> int:
    """Core audit logic. Called by main() and by crp-setup.py."""
    manifest = load_manifest(Path("crp.yaml"))
    use_tiktoken = True
    if manifest and manifest.get("audit", {}).get("use_tiktoken") is False:
        use_tiktoken = False

    skills = get_skills_to_audit(skill_name)

    if len(skills) == 1:
        # Single skill audit (v2.0 style output)
        name, skill_dir = skills[0]
        if not skill_dir.exists():
            print(f"ERROR: Skill directory not found: {skill_dir}")
            return 1

        result = audit_skill(skill_dir, name, use_tiktoken)

        print(f"\n== Token Audit: {name} ==\n")
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
        cost_label = DEFAULT_COST_PER_1M_TOKENS
        print(f"\nEstimated input cost (Claude Sonnet 4.6, ${cost_label}/1M tokens):")
        print(f"  Naive: ${c['naive']:.4f}")
        print(f"  CRP:   ${c['crp']:.4f}")
        print(f"  Saved: ${c['savings']:.4f}")

        if report:
            out_path = Path("benchmark-report.json")
            out_path.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
            print(f"\nReport written to {out_path}")

        return 0

    # Multi-skill combined audit
    all_results = {}
    total_naive = 0
    total_crp = 0

    for name, skill_dir in skills:
        if not skill_dir.exists():
            print(f"WARNING: Skill directory not found: {skill_dir}")
            continue
        result = audit_skill(skill_dir, name, use_tiktoken)
        all_results[name] = result
        sr = result["session_5rounds"]
        total_naive += sr["naive_total_tokens"]
        total_crp += sr["crp_total_tokens"]

    combined_savings = round((1 - total_crp / total_naive) * 100, 1) if total_naive else 0
    combined = {
        "total_skills": len(all_results),
        "naive_total_tokens": total_naive,
        "crp_total_tokens": total_crp,
        "savings_percent": combined_savings,
        "cost_usd": {
            "naive": round((total_naive / 1_000_000) * DEFAULT_COST_PER_1M_TOKENS, 4),
            "crp": round((total_crp / 1_000_000) * DEFAULT_COST_PER_1M_TOKENS, 4),
            "savings": round(((total_naive - total_crp) / 1_000_000) * DEFAULT_COST_PER_1M_TOKENS, 4),
        },
    }

    print(f"\n== Multi-Skill Token Audit ({len(all_results)} skills) ==\n")
    print(f"Estimation method: {list(all_results.values())[0]['method'] if all_results else '[estimated]'}")
    print(f"Naive total:    {total_naive:,} tokens")
    print(f"CRP total:      {total_crp:,} tokens")
    print(f"Combined savings: {combined_savings}%")

    c = combined["cost_usd"]
    print(f"\nEstimated input cost (Claude Sonnet 4.6, ${DEFAULT_COST_PER_1M_TOKENS}/1M tokens):")
    print(f"  Naive: ${c['naive']:.4f}")
    print(f"  CRP:   ${c['crp']:.4f}")
    print(f"  Saved: ${c['savings']:.4f}")

    print("\nPer-skill breakdown:")
    for name, result in all_results.items():
        sr = result["session_5rounds"]
        print(f"  {name:15s} {sr['crp_total_tokens']:>8,} tokens ({sr['savings_percent']}% savings)")

    if report:
        out_path = Path("benchmark-report.json")
        report_data = {
            "combined_analysis": combined,
            "individual_skills": all_results,
            "method": list(all_results.values())[0]["method"] if all_results else "[estimated]",
        }
        out_path.write_text(json.dumps(report_data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"\nReport written to {out_path}")

    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Token audit for CRP vs naive loading")
    parser.add_argument("--skill", default=None, help="Skill name (auto-detect if omitted)")
    parser.add_argument("--report", action="store_true", help="Write JSON to benchmark-report.json")
    args = parser.parse_args()

    return run_audit(args.skill, args.report)


if __name__ == "__main__":
    sys.exit(main())
