#!/usr/bin/env python3
"""
Token Cost Benchmark — Skill-Based Architecture vs Naive Loading

原理：通过模拟典型开发场景下的上下文加载行为，
对比"一次性全量加载"和"渐进式按需加载"的 token 消耗差异。

运行：python3 scripts/benchmark.py
"""

import json
from dataclasses import dataclass
from typing import List

# 假设 token ≈ 中文字符 × 1.0 ≈ 英文单词 × 1.3
# 基于真实项目规则文件的典型规模估算
TOKEN_PER_CN_CHAR = 1.0
TOKEN_PER_EN_WORD = 1.3


@dataclass
class FileSize:
    name: str
    lines: int
    cn_ratio: float  # 中文内容占比


# 典型 skill 文件规模（基于本模板实际测量）
SKILL_FILES = {
    "SKILL.md": FileSize("SKILL.md", 52, 0.6),
    "project-rules.md": FileSize("project-rules.md", 120, 0.5),
    "coding-standards.md": FileSize("coding-standards.md", 80, 0.4),
    "gotchas.md": FileSize("gotchas.md", 60, 0.6),
    "fix-bug.md": FileSize("fix-bug.md", 45, 0.6),
    "add-feature.md": FileSize("add-feature.md", 50, 0.6),
    "update-rules.md": FileSize("update-rules.md", 40, 0.6),
    "smoke-test.sh": FileSize("smoke-test.sh", 120, 0.1),  # 脚本代码英文为主
    "test-trigger.sh": FileSize("test-trigger.sh", 70, 0.1),
}

# Claude API 定价（每百万 token）
PRICING = {
    "claude-sonnet-4-6": {"input": 3.0, "output": 15.0},  # $/MTok
    "claude-haiku-4-5": {"input": 0.8, "output": 4.0},
}


def estimate_tokens(f: FileSize) -> int:
    """估算文件的 token 数"""
    avg_chars_per_line = 40
    total_chars = f.lines * avg_chars_per_line
    # 混合中英文估算
    cn_chars = int(total_chars * f.cn_ratio)
    en_words = int(total_chars * (1 - f.cn_ratio) / 5)  # 每5个字符约1个英文单词
    return int(cn_chars * TOKEN_PER_CN_CHAR + en_words * TOKEN_PER_EN_WORD)


def naive_load_all() -> int:
    """ naive 方式：每次任务加载所有文件 """
    return sum(estimate_tokens(f) for f in SKILL_FILES.values())


def skill_based_load(task: str) -> int:
    """ skill-based 方式：按任务路由，只加载必需文件 """
    # L1: SKILL.md 始终加载（导航中心）
    total = estimate_tokens(SKILL_FILES["SKILL.md"])

    # L2: 按任务加载对应 workflow + rules
    if task == "fix_bug":
        total += estimate_tokens(SKILL_FILES["fix-bug.md"])
        total += estimate_tokens(SKILL_FILES["project-rules.md"])
        total += estimate_tokens(SKILL_FILES["coding-standards.md"])
        # 可能扫一眼 gotchas
        total += estimate_tokens(SKILL_FILES["gotchas.md"]) // 3
    elif task == "add_feature":
        total += estimate_tokens(SKILL_FILES["add-feature.md"])
        total += estimate_tokens(SKILL_FILES["project-rules.md"])
        total += estimate_tokens(SKILL_FILES["coding-standards.md"])
        total += estimate_tokens(SKILL_FILES["gotchas.md"]) // 2
    elif task == "multi_subtask":
        total += estimate_tokens(SKILL_FILES["update-rules.md"])
        total += estimate_tokens(SKILL_FILES["project-rules.md"])
    elif task == "other":
        total += estimate_tokens(SKILL_FILES["project-rules.md"])
        total += estimate_tokens(SKILL_FILES["coding-standards.md"])
    else:
        # 默认兜底
        total += estimate_tokens(SKILL_FILES["project-rules.md"])

    return total


def session_with_compaction(rounds: int, task_pattern: List[str]) -> dict:
    """模拟一个多轮会话，包含上下文压缩 """
    naive_total = 0
    skill_total = 0

    # 薄壳常驻（被压缩后存活）
    thin_shell = 80  # ~60 行薄壳的 token 数

    for i, task in enumerate(task_pattern):
        # naive：每轮重新加载全部（因为没有导航，只能全塞进去）
        naive_total += naive_load_all()

        # skill-based：
        # - 第 1 轮：加载 SKILL.md + 任务相关文件
        # - 第 N 轮：压缩后薄壳存活，Agent 根据信号重读 SKILL.md + 路由
        if i == 0:
            skill_total += skill_based_load(task)
        else:
            # 压缩后只剩薄壳，SessionStart hook 发信号重读
            skill_total += thin_shell + skill_based_load(task)

    return {
        "naive_total_tokens": naive_total,
        "skill_total_tokens": skill_total,
        "rounds": rounds,
    }


def main():
    print("=" * 60)
    print("Skill-Based Architecture — Token Cost Benchmark")
    print("=" * 60)
    print()

    # 单文件 token 明细
    print("[1/4] Single File Token Estimates")
    print("-" * 40)
    single_total = 0
    for name, f in SKILL_FILES.items():
        tokens = estimate_tokens(f)
        single_total += tokens
        print(f"  {name:25s} {tokens:4d} tokens")
    print(f"  {'TOTAL':25s} {single_total:4d} tokens")
    print()

    # 单次任务对比
    print("[2/4] Per-Task Token Load (first round)")
    print("-" * 40)
    naive = naive_load_all()
    print(f"  Naive (load all):        {naive:4d} tokens")
    for task in ["fix_bug", "add_feature", "multi_subtask", "other"]:
        skill = skill_based_load(task)
        saving = naive - skill
        pct = saving / naive * 100
        print(f"  Skill-based ({task:12s}): {skill:4d} tokens  ↓ {saving:4d} ({pct:.0f}%)")
    print()

    # 多轮会话对比（含压缩）
    print("[3/4] Multi-Round Session (with context compaction)")
    print("-" * 40)
    tasks = ["fix_bug", "add_feature", "fix_bug", "other", "add_feature"]
    result = session_with_compaction(len(tasks), tasks)
    naive_total = result["naive_total_tokens"]
    skill_total = result["skill_total_tokens"]
    saving = naive_total - skill_total
    pct = saving / naive_total * 100
    print(f"  Scenario: 5 rounds, mixed tasks")
    print(f"  Naive total:  {naive_total:5d} tokens")
    print(f"  Skill total:  {skill_total:5d} tokens")
    print(f"  Saved:        {saving:5d} tokens ({pct:.0f}%)")
    print()

    # 成本估算
    print("[4/4] Cost Estimation (Claude Sonnet 4.6)")
    print("-" * 40)
    price = PRICING["claude-sonnet-4-6"]["input"]
    naive_cost = naive_total / 1_000_000 * price
    skill_cost = skill_total / 1_000_000 * price
    print(f"  Naive input cost:  ${naive_cost:.4f}")
    print(f"  Skill input cost:  ${skill_cost:.4f}")
    print(f"  Cost reduction:    {(naive_cost - skill_cost) / naive_cost * 100:.0f}%")
    print()

    # 输出 JSON 供其他工具使用
    report = {
        "single_file_tokens": {name: estimate_tokens(f) for name, f in SKILL_FILES.items()},
        "per_task": {
            "naive_all": naive,
            "skill_based": {t: skill_based_load(t) for t in ["fix_bug", "add_feature", "multi_subtask", "other"]},
        },
        "session_5rounds": result,
        "cost_usd": {
            "naive": round(naive_cost, 6),
            "skill": round(skill_cost, 6),
        },
    }

    print("=" * 60)
    print("JSON report written to benchmark-report.json")
    with open("benchmark-report.json", "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)


if __name__ == "__main__":
    main()
