#!/usr/bin/env bash
# SessionStart Hook — 对抗上下文压缩（轻量级信号版）
# 监听 startup | clear | compact 三个事件，提示 Agent 重新读取 SKILL.md
# 设计原则：不注入完整文件内容，只发信号 —— 脚本执行零 token 成本

SKILL_MD=$(find .claude/skills -name "SKILL.md" -path "*/skills/*" | head -1)

if [[ -z "$SKILL_MD" ]]; then
  echo '{"error": "No SKILL.md found under .claude/skills/"}'
  exit 1
fi

SKILL_NAME="$(basename "$(dirname "$SKILL_MD")")"

# 输出轻量级信号，而非完整文件内容
# Agent 收到后会自行读取 SKILL.md，避免每次压缩都重复注入
cat <<EOF
{
  "additional_context": "[SessionStart Hook] Context was cleared/compacted. Re-read SKILL.md from ${SKILL_MD} (skill: ${SKILL_NAME}). Follow Common Tasks routing."
}
EOF
