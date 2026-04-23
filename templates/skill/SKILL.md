---
name: {{NAME}}
description: >
  <!-- FILL: 触发条件 —— 这是skill的命根子。必须覆盖用户可能的各种表达方式。
       模型天然倾向undertrigger，所以description要主动、宽泛。
       示例：
       "{{PROJECT}}后端开发助手。当用户提到API、接口、控制器、
       服务层、数据库、bug修复、功能添加、重构时使用。覆盖Python、
       FastAPI、SQLAlchemy相关任务。"
  -->
primary: true
---

# {{NAME}} — Skill Navigation Center

> SKILL.md 不是百科全书，是目录。只写"读什么 / 什么时候读"。

## Always Read（每次任务必读，≤3 个文件）

> ⚠️ **Hard ceiling: never exceed 3 files here.** Every file in this section loads
> on *every* task. Loading 4+ files defeats the purpose of tiered loading.

1. `rules/project-rules.md`
2. `rules/coding-standards.md`

## Common Tasks（按任务类型路由，5–10 条 + 兜底）

| Task | Must read | Workflow |
|------|-----------|----------|
| Fix bug | `rules/project-rules.md` + `rules/coding-standards.md` | `workflows/fix-bug.md` |
| Add feature | `rules/project-rules.md` + `rules/coding-standards.md` + `references/gotchas.md` | `workflows/add-feature.md` |
| Multi-subtask / long run (≥3 independent subtasks) | `rules/project-rules.md` | `workflows/update-rules.md` |
| <!-- FILL: task --> | <!-- FILL: files --> | <!-- FILL: workflow --> |
| **Other / unlisted** | `rules/project-rules.md` + `rules/coding-standards.md` | Check `workflows/` for closest match |

## Known Gotchas（一句话 + 锚点，坑点密度最高）

- <!-- FILL: 一句话坑点 + `references/gotchas.md#anchor` -->
- <!-- FILL: 一句话坑点 + `references/gotchas.md#anchor` -->

## Core Principles

1. **结构服务于内容** — 不要为完整而搭空架子
2. **激活优于存储** — 坑点必须出现在任务路径上，不能只躺在 references/
3. **精准修改** — 只改必须改的，每一行都能追溯到用户请求
4. **Session Discipline** — 同会话新任务必须重读 SKILL.md、重走路由

---

## Session Discipline（检验句）

每个新任务——即使是同一会话的第 N 轮——必须重读 SKILL.md、重新匹配 Common Tasks 路由、重读该路由列出的所有必读文件。

**检验**：问自己"这次任务我读的文件和 Common Tasks 里对应路由列的完全一致吗？"如果有任何差异（少读 / 多读 / 凭记忆），立即回头重走路由。
