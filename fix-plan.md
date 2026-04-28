# CRISP 修复计划

**制定日期**: 2026-04-28
**执行方式**: 逐阶段确认后实施
**测试策略**: `bun:test` 为主，核心库保持 Node.js API 兼容（为将来迁移预留）

---

## 阶段总览

| 阶段 | 主题 | 预计工作量 | 前置依赖 |
|------|------|-----------|---------|
| Phase 0 | 项目基线检查 | 0.5h | 无 |
| Phase 1 | 关键 Bug 修复 | 2h | Phase 0 |
| Phase 2 | 测试基线建设 | 4h | Phase 1 |
| Phase 3 | 错误提示与 UX 改进 | 3h | Phase 1 |
| Phase 4 | 配置管理与架构清理 | 3h | Phase 1, Phase 2 |
| Phase 5 | 扩展性与文档 | 2h | Phase 1-4 |

---

## Phase 0: 项目基线检查（0.5h）

> **目标**: 确认当前项目状态，确保后续变更有一个干净的起点。

### Task 0.1: 运行现有脚本验证基线
- **操作**: 执行 `bun install`、`bun run typecheck`、`bun run lint`
- **目的**: 确认 TypeScript 编译和 lint 无既有错误
- **交付标准**: `typecheck` 和 `lint` 全部通过

### Task 0.2: 确认缺失文件清单
- **操作**: 检查 `src/commands/crp-migrate.ts`（README 提到但实际缺失）、测试目录、模板目录是否存在
- **交付标准**: 列出所有 "文档声称存在但实际缺失" 的文件

### Task 0.3: 版本号调整
- **文件**: `package.json`, `src/cli.ts`
- **变更**: 将版本从 `1.0.0` 改为 `0.5.0`
- **理由**: 项目仍处于早期，存在 TODO 和未实现功能，1.0.0 会给用户过高预期
- **交付标准**: `crp --version` 输出 `0.5.0`

---

## Phase 1: 关键 Bug 修复（2h）

> **目标**: 修复会导致功能失效、数据异常或安全问题的高优先级缺陷。
> **原则**: 最小侵入式修复，不改变 API 签名，为 Phase 2 的测试提供稳定的被测对象。

### Task 1.1: 修复 telemetry reporter 路径拼写错误
- **文件**: `src/lib/telemetry/reporter.ts`
- **问题**: `.crisp` 应为 `.crp`
- **变更**:
  ```typescript
  // 修改前
  const kgPath = join(".crisp", "kg", ".crp-kg.json");
  const sessionPath = join(".crisp", "session", "state.json");
  // 修改后
  const kgPath = join(".crp", "kg", ".crp-kg.json");
  const sessionPath = join(".crp", "session", "state.json");
  ```
- **交付标准**: `crp telemetry report` 能在存在 KG 和 session 文件时正确加载它们
- **回归测试**: 在 Phase 2 中补充 reporter 的路径拼接测试

### Task 1.2: 修复 `Math.max(...[])` 空数组 bug
- **文件**: `src/commands/crp-sync.ts`
- **问题**: 当 `frequencies` 为空时，`Math.max(...frequencies.map(f => f.totalSessions))` 返回 `-Infinity`
- **变更**:
  ```typescript
  // 修改前
  totalSessions:
      freqMap.size > 0
          ? Math.max(...frequencies.map((f) => f.totalSessions))
          : 0,
  // 修改后
  totalSessions:
      frequencies.length > 0
          ? Math.max(...frequencies.map((f) => f.totalSessions))
          : 0,
  ```
- **交付标准**: `crp sync --include-user` 在未启用 telemetry 且仅有 user skills 时不产生 `-Infinity`
- **回归测试**: Phase 2 中补充空频率场景的 sync 测试

### Task 1.3: 改进 `loadManifest` 错误处理
- **文件**: `src/lib/manifest/io.ts`
- **问题**: YAML 语法错误被静默吞掉，返回空对象 `{}`
- **变更**:
  1. 引入 `ManifestLoadError` 类
  2. 区分 "文件不存在" 和 "解析错误"
  3. 解析错误时抛出异常，由调用者决定如何处理
  ```typescript
  export class ManifestLoadError extends Error {
      constructor(public reason: 'not-found' | 'parse-error' | 'invalid', message: string) {
          super(message);
      }
  }
  ```
  4. 调用者（`cmdValidate`, `cmdSkillCreate` 等）在捕获到 `parse-error` 时输出明确的 YAML 语法错误提示
- **交付标准**:
  - 当 `crp.yaml` 包含 YAML 语法错误（如缩进错误）时，`crp validate` 能报告具体错误
  - 文件不存在时行为不变（返回空对象或抛出 `not-found`）
- **影响面**: `src/commands/*` 中所有调用 `loadManifest` 的位置需要添加 `try/catch`

### Task 1.4: 消除 `process.exit()` 的反模式
- **文件**: `src/cli.ts`（主要）、`src/commands/*`（次要）
- **问题**: CLI action 中直接调用 `process.exit()`，导致异步清理无法执行，且不可测试
- **变更**:
  1. `src/cli.ts`: 移除所有 `process.exit()` 包裹
  2. 命令函数保持返回 `number`（exit code）的签名
  3. 在 `cli.ts` 末尾添加统一的退出处理：
  ```typescript
  program.parseAsync(process.argv).then(() => {
      process.exit(0);
  }).catch((err) => {
      console.error(err);
      process.exit(1);
  });
  ```
  4. 对于返回 `number` 的 action，改为：
  ```typescript
  .action(async (options) => {
      const code = await cmdCrpDoctor();
      if (code !== 0) process.exitCode = code;
  })
  ```
- **交付标准**:
  - 所有命令仍返回正确的 exit code
  - 异步命令（如 `doctor`）能正常完成其内部的所有 `await`
  - 可以通过 `import { cmdCrpCheck } from './commands/crp-check'` 在测试中调用而不杀死进程

### Task 1.5: 修复 `skill delete` 的误导性 exit code
- **文件**: `src/commands/skill.ts`
- **问题**: 不加 `--force` 时返回 0（成功），但操作未执行
- **变更**:
  ```typescript
  if (!options.force) {
      console.log(`Skill at: ${foundDir}`);
      console.log("Use --force to skip confirmation");
      return 2; // 非零 code 表示 "需要确认"
  }
  ```
- **交付标准**: 脚本调用 `crp skill delete my-skill` 后检查 `$?` 为 2 而非 0

---

## Phase 2: 测试基线建设（4h）

> **目标**: 为核心模块建立单元测试，为后续重构提供保护网。
> **策略**: 使用 `bun:test`，测试代码仅使用标准 Node.js API，确保跨运行时兼容。

### Task 2.1: 建立测试目录与辅助工具
- **文件**: `tests/setup.ts`（如有需要）、`tests/fixtures/`
- **变更**:
  1. 创建 `tests/` 目录
  2. 创建 `tests/fixtures/` 存放测试用的 YAML/JSON 文件
  3. 在 `package.json` 中确认 `"test": "bun test"` 已配置
- **交付标准**: `bun test` 能发现并运行 `tests/*.test.ts`

### Task 2.2: `lib/manifest/validate.ts` 测试
- **文件**: `tests/manifest-validate.test.ts`
- **覆盖场景**:
  - 有效 manifest 返回空数组
  - 缺少 `project.name` 报错
  - `skills` 不是数组报错
  - 重复 skill name 报错
  - `default_skill` 不在 skills 列表中报错
  - `checks.max_gateway_lines` 为非正整数报错
  - `crp.tiers.inline_threshold` 超出 [0,1] 范围报错
  - `knowledge_graph.max_tokens_execution` 为非正整数报错
- **交付标准**: 覆盖率 90%+

### Task 2.3: `lib/crp/injection.ts` 测试
- **文件**: `tests/injection.test.ts`
- **覆盖场景**:
  - 空 routes 返回基础注入文本
  - inline/lazy/dead 技能正确分类输出
  - token 预算充足时不截断
  - token 预算不足时按优先级截断（先 dead，再 lazy，再 inline）
  - KG topics 正确拼接
  - `freeEncoder` 释放单例
- **交付标准**: 截断策略的每种路径至少一个测试用例

### Task 2.4: `lib/crp/analyzer.ts` 测试
- **文件**: `tests/analyzer.test.ts`
- **覆盖场景**:
  - 正常 reads.jsonl 解析和频率计算
  - 空文件返回空数组
  - 无效 JSON 行被跳过
  - 窗口过滤（超过 windowDays 的记录被排除）
  - 同一 session 内重复 skill 只计一次
  - 不同路径格式正确提取 skill name
- **交付标准**: 频率计算结果与手动计算一致

### Task 2.5: `lib/crp/routes.ts` 测试
- **文件**: `tests/routes.test.ts`
- **覆盖场景**:
  - 高频技能标记为 inline（非 user）
  - 高频 user skill 被降级为 lazy
  - 零频率技能标记为 lazy
  - 低频技能标记为 dead
  - 阈值可通过 options 覆盖
  - KG topics 正确嵌入
- **交付标准**: 路由策略的边界条件（刚好在阈值上）有测试

### Task 2.6: `lib/kg/validator.ts` 测试
- **文件**: `tests/kg-validator.test.ts`
- **覆盖场景**:
  - 有效 KG 返回空数组
  - 非对象输入报错
  - 缺少 `project` 报错
  - `nodes` 非字典报错
  - 节点缺少 `id` 报错
  - 边引用不存在的节点报错
  - 边缺少 `from`/`to`/`type` 报错
- **交付标准**: 所有验证分支至少一个测试

### Task 2.7: `lib/telemetry/reporter.ts` 路径测试
- **文件**: `tests/telemetry-reporter.test.ts`
- **覆盖场景**:
  - `deriveSkipEvents` 正确识别推荐但未加载的文件
  - 路径拼接使用 `.crp/` 而非 `.crisp/`
- **交付标准**: 修复 Task 1.1 后，测试验证路径正确性

---

## Phase 3: 错误提示与 UX 改进（3h）

> **目标**: 统一错误输出格式，提升 CLI 的视觉层级和交互体验。

### Task 3.1: 统一错误输出格式
- **文件**: 新建 `src/lib/cli/format.ts`，修改 `src/commands/*`
- **变更**:
  1. 创建格式化函数：
  ```typescript
  export function printError(message: string, impact?: string, fix?: string): void {
      console.error(`[ERROR] ${message}`);
      if (impact) console.error(`        Impact: ${impact}`);
      if (fix) console.error(`        Fix:    ${fix}`);
  }
  export function printWarn(message: string): void { ... }
  export function printOk(message: string): void { ... }
  ```
  2. 将 `skill.ts`、`crp-check.ts`、`crp-sync.ts` 等文件中的 `console.error("ERROR: ...")` 替换为 `printError`
- **交付标准**: 所有命令的错误输出遵循 "[ERROR] message / Impact: ... / Fix: ..." 格式
- **注意**: 此变更不修改 exit code 逻辑，仅改变输出格式

### Task 3.2: 添加颜色输出
- **文件**: `src/lib/cli/colors.ts`
- **变更**:
  1. 检测 TTY 环境（`process.stdout.isTTY`），非 TTY 时禁用颜色
  2. 使用 ANSI 转义码（不引入额外依赖），提供 `red()`、`green()`、`yellow()`、`bold()` 等
  3. 在 `doctor`、`audit`、`skill list` 等命令中应用颜色：
     - `[✓]` 绿色，`[!]` 黄色，`[✗]` 红色
     - `[ERROR]` 红色，`[WARN]` 黄色，`[OK]` 绿色
- **交付标准**:
  - TTY 环境下有颜色输出
  - 管道重定向（`crp doctor | cat`）时无 ANSI 码

### Task 3.3: 添加 `crp status` 命令
- **文件**: 新建 `src/commands/status.ts`，修改 `src/cli.ts`
- **功能**: 汇总项目当前状态：
  ```
  == CRP Status ==

  Project: my-project
  Manifest: crp.yaml (exists, valid)
  Routes: .crp/routes.json (last sync: 2026-04-28 10:30)
  Telemetry: .crp/telemetry/reads.jsonl (1.2 KB, 14 days)
  Hooks: PostToolUse ✓, SessionStart ✓
  Skills: 3 registered, 2 project-level, 1 user-level
  Token Budget: 180 / 300 tokens (60%)
  ```
- **交付标准**: `crp status` 输出包含上述所有字段（或合理子集）

### Task 3.4: 改进 `skill delete` 交互
- **文件**: `src/commands/skill.ts`
- **变更**:
  1. 在 TTY 环境下，不加 `--force` 时提示交互式确认：
  ```typescript
  if (!options.force && process.stdin.isTTY) {
      // 读取用户输入确认
  }
  ```
  2. 非 TTY 环境下，不加 `--force` 时返回 exit code 2 并打印提示
- **交付标准**: 交互式使用时有 y/n 确认，脚本使用时可通过 exit code 判断

### Task 3.5: `init` 后输出 Next Steps
- **文件**: `src/commands/crp-init.ts`
- **变更**: 在初始化成功后输出引导：
  ```
  [CRP] Initialized successfully.
    .crp/ directory created
    Hooks installed to .claude/settings.json

  Next steps:
    1. Create a skill:   crp skill create <name>
    2. Add descriptions: Edit .claude/skills/<name>/SKILL.md
    3. Sync routes:      crp sync
    4. Check budget:     crp check
  ```
- **交付标准**: 新用户执行 `crp init` 后知道下一步该做什么

---

## Phase 4: 配置管理与架构清理（3h）

> **目标**: 消除配置不一致风险，清理硬编码值，提升架构的可维护性。

### Task 4.1: 解决 `crp.yaml` 双写问题
- **文件**: `src/commands/crp-init.ts`, `src/lib/manifest/io.ts`
- **问题**: 根目录 `crp.yaml` 和 `.crp/crp.yaml` 可能 diverge
- **方案**: 以根目录 `crp.yaml` 为唯一真相源，`.crp/` 下不再保存独立副本
  - `.crp/crp.yaml` 改为只读引用（如 symlink，或仅用于 backward compatibility 的 copy）
  - 在 `.crp/` 下添加 `README.md` 说明：
    ```
    # .crp/ directory
    This directory contains generated and runtime artifacts for CRP.
    Do not edit files here directly; they are regenerated by `crp sync`.
    ```
- **变更**:
  1. `crp-init.ts`: 移除 `.crp/crp.yaml` 的创建逻辑
  2. 所有命令统一从根目录 `crp.yaml` 读取 manifest
  3. `.crp/` 下不再存放 crp.yaml
- **交付标准**: 项目目录中只有一份 `crp.yaml`

### Task 4.2: 提取共享 token 估算模块
- **文件**: 新建 `src/lib/tokens.ts`，修改 `src/lib/crp/injection.ts`、`src/lib/kg/generator.ts`
- **变更**:
  1. 创建 `src/lib/tokens.ts`：
  ```typescript
  import { getEncoding, type Tiktoken } from 'js-tiktoken';
  let encoder: Tiktoken | null = null;
  export function getEncoder(): Tiktoken { ... }
  export function estimateTokens(text: string): number { ... }
  export function freeEncoder(): void { ... }
  ```
  2. 替换 `injection.ts` 和 `generator.ts` 中的重复逻辑
- **交付标准**: `grep -r "js-tiktoken" src/lib/` 仅在 `tokens.ts` 中出现

### Task 4.3: 清理硬编码魔法数字
- **文件**: `src/lib/crp/audit.ts`、`src/lib/crp/compressor.ts`、`src/lib/crp/kg-index.ts`
- **变更**:
  1. `audit.ts`: `maxTokens = 300` → 从 `manifest.crp?.session_inject?.max_tokens` 读取
  2. `compressor.ts`: `maxSupplyTokens = 80` → 从 `manifest.crp?.kg?.index_inline_tokens` 读取（或新增配置项）
  3. `kg-index.ts`: `maxTokens = 200` → 从 `manifest.crp?.kg?.max_query_tokens` 读取
  4. 为这些配置项添加默认值到 `defaultManifest`
- **交付标准**: 所有 "看起来是阈值/预算" 的数字都有明确的配置来源

### Task 4.4: 改进 KG 查询匹配算法
- **文件**: `src/lib/crp/kg-index.ts`
- **问题**: 子串匹配导致误匹配（"api" 匹配 "rapid"）
- **变更**:
  1. 引入精确匹配和词边界匹配：
  ```typescript
  function isTopicMatch(query: string, topic: string): boolean {
      const q = query.toLowerCase();
      const t = topic.toLowerCase();
      if (q === t) return true;
      // 词边界匹配: query 是 topic 的完整词
      const regex = new RegExp(`\\b${escapeRegex(q)}\\b`);
      return regex.test(t);
  }
  ```
  2. 回退到编辑距离（可选，低优先级）
- **交付标准**: `"api"` 不再匹配 `"rapid"`，但仍能匹配 `"api-design"`（词边界）

### Task 4.5: `loadManifest` 运行时校验
- **文件**: `src/lib/manifest/io.ts`
- **变更**:
  1. 在 `loadManifest` 返回后，可选择性地调用 `validateManifest` 进行运行时校验
  2. 或使用更轻量的方式：通过 `Partial<CrpManifest>` 访问链式可选属性（`manifest.crp?.session_inject?.max_tokens ?? 300`）
  3. 移除命令文件中的 `as CrpManifest` 强制类型断言
- **交付标准**: 全项目中无 `as CrpManifest` 类型断言（除测试外）

---

## Phase 5: 扩展性与文档（2h）

> **目标**: 提升项目的平台兼容性和文档一致性。

### Task 5.1: README 与实现同步
- **文件**: `README.md`
- **变更**:
  1. 移除 `migrate` 命令（源码中不存在）
  2. 添加 `status` 命令（Phase 3 新增）
  3. 更新命令表格，确保与 `src/cli.ts` 完全一致
  4. 添加 "Platform Support" 章节，明确当前仅支持 Claude Desktop + Bun
- **交付标准**: README 中列出的每个命令都能在 `src/cli.ts` 中找到对应实现

### Task 5.2: 添加 `--format json` 支持
- **文件**: `src/cli.ts`（全局 option），`src/commands/crp-audit.ts`、`src/commands/crp-doctor.ts`
- **变更**:
  1. CLI 添加全局 `--json` 选项
  2. 在 `audit` 和 `doctor` 中检测该选项，输出结构化 JSON 而非文本
- **交付标准**: `crp audit --json` 输出可解析的 JSON

### Task 5.3: 抽象 hooks 适配器接口（预留）
- **文件**: 新建 `src/lib/hooks/adapter.ts`
- **变更**:
  1. 定义 `HookAdapter` 接口：
  ```typescript
  export interface HookAdapter {
      name: string;
      settingsPath(projectDir: string): string;
      install(projectDir: string): void;
      remove(projectDir: string): void;
      check(projectDir: string): HookStatus;
  }
  ```
  2. 将现有的 `.claude/settings.json` 逻辑封装为 `ClaudeDesktopAdapter`
  3. `installHooks`、`removeHooks` 等函数改为通过适配器调用
- **交付标准**: 现有功能不变，但 `src/lib/crp/hooks/` 下的代码不再直接引用 `.claude/settings.json`

### Task 5.4: `doctor.ts` 移除动态导入
- **文件**: `src/lib/crp/doctor.ts`
- **变更**: 将 `await import("js-tiktoken")` 改为顶部静态导入
- **交付标准**: `doctor.ts` 无动态导入，`runDoctorChecks` 可改为同步函数

---

## 执行检查清单

每阶段完成后，运行以下检查：

```bash
# 1. TypeScript 编译通过
bun run typecheck

# 2. Lint 通过
bun run lint

# 3. 测试通过
bun test

# 4. CLI 基本功能验证
bun run src/cli.ts --help
bun run src/cli.ts validate
bun run src/cli.ts doctor
bun run src/cli.ts check
```

---

## 风险与回退策略

| 风险 | 影响 | 回退策略 |
|------|------|---------|
| `loadManifest` 改为抛异常后，大量命令需要添加 try/catch | 中 | 改为返回 `{ data, error }` 结果类型，而非抛异常 |
| 颜色输出在某些终端显示异常 | 低 | 检测 `NO_COLOR` 环境变量，用户可随时禁用 |
| 移除 `.crp/crp.yaml` 影响现有用户 | 中 | 保留 `.crp/crp.yaml` 但改为 symlink 到根目录，而非独立文件 |
| 测试依赖文件系统操作，在 CI 中不稳定 | 低 | 使用临时目录（`os.tmpdir()`）并在测试 teardown 中清理 |

---

## 后续迭代建议（不在本次计划内）

- 流式读取大日志文件（`analyzer.ts` 性能优化）
- `--explain` 标志（命令概念解释）
- `crp config get/set` 子命令
- `skill list` 自适应终端宽度表格
- Node.js 运行时兼容验证
- A/B 测试框架（度量不同路由策略的效果）
