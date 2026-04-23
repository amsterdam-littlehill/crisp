<!-- Banner -->
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/amsterdam-littlehill/crisp/master/.github/images/banner_crisp_dark.png">
    <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/amsterdam-littlehill/crisp/master/.github/images/banner_crisp_light.png">
    <img alt="crisp - Context Router Protocol" src="https://raw.githubusercontent.com/amsterdam-littlehill/crisp/master/.github/images/banner_crisp_dark.png" width="800">
  </picture>
</p>

<p align="center">
  <a href="https://github.com/amsterdam-littlehill/crisp/blob/main/LICENSE"><img src="https://img.shields.io/github/license/amsterdam-littlehill/crisp?style=flat-square&color=8b949e"></a>
</p>

<p align="center">
  <b>上下文路由协议</b> —— 一个面向 AI 辅助开发的 Bun + TypeScript 工具集，用于上下文治理、路由、审计与可观测性。<br>
  <sub>单一代码库 · 统一 CLI · 面向首次使用者</sub>
</p>

---

[English](README.md) | [中文](README.zh.md)

## 这是什么

crisp 是 Context Router Protocol（CRP）的单一 Bun + TypeScript 实现。它帮助团队组织 AI 协作规则、同步各类工具入口文件、检查 token 与预算成本，并持续追踪知识图谱、遥测和会话行为。

## 它能做什么

- 通过统一 CLI 为项目初始化 CRP 脚手架
- 创建、列出和管理 skills 及其路由结构
- 同步自动生成的入口文件和 shell 相关产物
- 审计规则系统中的 token 使用与预算维度
- 从 CRP 结构中构建并校验知识图谱
- 追踪会话状态、artifact、reflector 输出和 telemetry 日志
- 运行健康检查、drift 检查和仓库校验

## 仓库结构

```text
.
├── src/                      # TypeScript 源码（lib + commands）
│   ├── cli.ts                # 统一 CLI 入口
│   ├── commands/             # CLI 子命令模块
│   └── lib/                  # 核心库模块
├── tests/                    # Bun test 测试套件
├── templates/                # Skill 与 shell 模板
├── crp.yaml                  # 项目配置与阈值
├── package.json              # Bun 项目元数据
├── tsconfig.json             # TypeScript 配置
├── install.sh                # 一键安装脚本
└── docs/                     # 设计与规划文档
```

## 快速开始

### 1. 安装 Bun

```bash
curl -fsSL https://bun.sh/install | bash
```

### 2. 安装依赖

```bash
bun install
```

### 3. 查看统一 CLI

```bash
bun run src/cli.ts --help
```

### 4. 初始化项目

```bash
bun run src/cli.ts init --skill backend --project my-app
```

### 5. 运行健康检查

```bash
bun run src/cli.ts check --drifts
```

### 6. 运行测试

```bash
bun test
```

## CLI 命令

主入口是 `src/cli.ts`。当前命令组包括：

| 命令 | 用途 |
|---|---|
| `init` | 为项目初始化 CRP 脚手架 |
| `skill` | 创建、删除或列出 skills |
| `sync` | 重新生成同步后的入口与 shell 产物 |
| `check` | 运行健康检查与 drift 检测 |
| `audit` | 审计 token 使用与相关报告 |
| `kg` | 同步或校验 CRP 知识图谱 |
| `budget` | 运行预算分析流程 |
| `telemetry` | 启动、停止、查看或报告遥测 |
| `validate` | 运行仓库级校验 |

如需详细参数，可运行 `bun run src/cli.ts <command> --help`。

## 核心模块

下面这些 TypeScript 模块构成了当前工具集的主要表面：

| 模块 | 职责 |
|---|---|
| `src/cli.ts` | 统一 CLI 入口 |
| `src/commands/init.ts` | 项目脚手架初始化 |
| `src/commands/skill.ts` | Skill 创建、删除与列出 |
| `src/commands/sync.ts` | Shell 与入口文件同步 |
| `src/commands/check.ts` | 健康检查与 drift 检测 |
| `src/commands/audit.ts` | Token 估算与审计报告 |
| `src/commands/kg.ts` | 知识图谱同步与校验 |
| `src/commands/budget.ts` | CRP 多维预算分析 |
| `src/commands/telemetry.ts` | 遥测生命周期与报告 |
| `src/commands/validate.ts` | crp.yaml 模式校验 |
| `src/lib/manifest/` | Manifest I/O、校验与 frontmatter 提取 |
| `src/lib/gateway/` | Gateway 生成与 Common Tasks 解析 |
| `src/lib/health/` | 健康检查、drift 检测与质量评分 |
| `src/lib/audit/` | Token 审计与基准模拟 |
| `src/lib/kg/` | 知识图谱提取、校验与生成 |
| `src/lib/sync/` | Shell 与多技能同步 |
| `src/lib/budget/` | 预算分析计算 |
| `src/lib/telemetry/` | 遥测钩子、日志与报告 |

## 配置

`crp.yaml` 是主配置文件，用于定义项目元数据、skill 配置、阈值与审计设置。

`package.json` 定义 Bun 项目元数据，以及本仓库使用的测试与 lint 工具配置。

## 测试与质量检查

本仓库使用 `bun test` 进行测试，使用 `biome` 进行 lint。

```bash
bun test
bun run lint
```

`tests/` 目录已经覆盖预算分析、知识图谱同步、reflector 逻辑、会话跟踪、健康检查以及集成行为等核心模块。

## 当前状态与兼容性

- 本仓库按当前单一 Bun + TypeScript 实现进行文档说明
- README 内容已对齐当前 CLI 与模块表面
- 历史多版本演进信息不再放在顶层上手路径中
- 设计与规划文档保留在 `docs/superpowers/` 下

## 贡献

如果你想参与贡献，建议先运行本地检查：

```bash
bun test
bun run lint
bun run src/cli.ts validate
```

更多细节见 `CONTRIBUTING.md`。

## 许可证

项目基于 MIT License 发布，详见 `LICENSE`。
