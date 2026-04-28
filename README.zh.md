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
- 审计规则系统中的 token 使用与层级分布
- 从 CRP 结构中构建并校验知识图谱
- 追踪 telemetry 日志与 hook 状态
- 校验 injection 是否在 token 预算内

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
bun run src/cli.ts init --project my-app
```

### 5. 运行检查

```bash
bun run src/cli.ts check
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
| `check` | 校验 injection 是否在 token 预算内 |
| `audit` | 展示层级分布与 dead candidate |
| `kg` | 同步或校验 CRP 知识图谱 |
| `doctor` | 诊断环境与 hook 状态 |
| `migrate` | 将旧版 v1 项目迁移至 v3 |
| `telemetry` | 启动、停止、查看或报告遥测 |
| `validate` | 运行仓库级校验 |

如需详细参数，可运行 `bun run src/cli.ts <command> --help`。

## 核心模块

下面这些 TypeScript 模块构成了当前工具集的主要表面：

| 模块 | 职责 |
|---|---|
| `src/cli.ts` | 统一 CLI 入口 |
| `src/commands/crp-init.ts` | v3 项目脚手架（hooks、routes、telemetry） |
| `src/commands/crp-sync.ts` | Telemetry 分析与 routes 重新生成 |
| `src/commands/crp-check.ts` | Injection token 预算校验 |
| `src/commands/crp-audit.ts` | 层级分布与 dead candidate 检测 |
| `src/commands/crp-kg.ts` | 知识图谱查询与索引 |
| `src/commands/crp-doctor.ts` | 环境与 hook 状态诊断 |
| `src/commands/crp-migrate.ts` | 旧版 v1 到 v3 迁移 |
| `src/commands/skill.ts` | Skill 创建、删除与列出 |
| `src/commands/kg.ts` | 知识图谱同步与校验 |
| `src/commands/telemetry.ts` | 遥测生命周期与报告 |
| `src/commands/validate.ts` | crp.yaml 模式校验 |
| `src/lib/manifest/` | Manifest I/O、校验与 frontmatter 提取 |
| `src/lib/crp/` | v3 核心：路由、injection、审计、迁移、hooks |
| `src/lib/kg/` | 知识图谱提取、校验与生成 |
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

`tests/` 目录已经覆盖 CRP 路由、injection、审计、知识图谱同步、遥测钩子、manifest 校验以及集成行为等核心模块。

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
