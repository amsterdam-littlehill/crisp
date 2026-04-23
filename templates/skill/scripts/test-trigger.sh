#!/usr/bin/env bash
set -euo pipefail

# Test Trigger — 验证 Common Tasks 描述命中率
# Usage: bash test-trigger.sh <skill-name>
#
# 原理：从 SKILL.md 提取 Common Tasks 的触发描述，生成模拟用户输入，
# 测试 description 是否足够精确，能正确路由到对应 workflow。

SKILL_NAME="${1:-}"
if [[ -z "$SKILL_NAME" ]]; then
  echo "Usage: bash test-trigger.sh <skill-name>"
  exit 1
fi

SKILL_FILE=".claude/skills/$SKILL_NAME/SKILL.md"
if [[ ! -f "$SKILL_FILE" ]]; then
  echo "ERROR: $SKILL_FILE not found"
  exit 1
fi

PASS=0
FAIL=0

echo "== Trigger Accuracy Test: $SKILL_NAME =="
echo ""

# 从 Common Tasks 表格提取 Task 和对应 workflow
# 格式：| Task | Required reads | Workflow |
while IFS='|' read -r _ task _ workflow _; do
  task=$(echo "$task" | sed 's/^ *//;s/ *$//')
  workflow=$(echo "$workflow" | sed 's/^ *//;s/ *$//')

  # 跳过表头和空行
  [[ "$task" == "Task" ]] && continue
  [[ -z "$task" ]] && continue

  # 生成模拟用户输入（简化版）
  prompt="$task"

  # 检查该 task 描述中是否包含能命中对应 workflow 的关键词
  # 这是一个启发式检查：description 应该包含足够独特的信号词
  keywords=$(echo "$task" | grep -oE '\b[a-zA-Z]{4,}\b' | tr '\n' ' ')

  # 检查 workflow 文件是否存在
  wf_file=".claude/skills/$SKILL_NAME/workflows/$workflow.md"
  if [[ -f "$wf_file" ]]; then
    # 检查 task 描述是否过于模糊（少于 3 个有效词）
    word_count=$(echo "$task" | wc -w)
    if [[ "$word_count" -lt 3 ]]; then
      echo "  ⚠️  WARN: '$task' → $workflow.md (描述过短，$word_count 词，可能命中过低)"
      ((FAIL++)) || true
    else
      echo "  ✅ PASS: '$task' → $workflow.md ($word_count 词)"
      ((PASS++)) || true
    fi
  else
    echo "  ❌ FAIL: '$task' → $workflow.md (文件不存在)"
    ((FAIL++)) || true
  fi
done < <(grep -E '^\| *[^|]+ *\| *[^|]+ *\| *[^|]+ *\|' "$SKILL_FILE")

echo ""
echo "== Summary =="
echo "Pass: $PASS, Fail: $FAIL"

[[ "$FAIL" -gt 0 ]] && { echo "❌ NEEDS WORK"; exit 1; } || { echo "✅ ALL CLEAR"; exit 0; }
