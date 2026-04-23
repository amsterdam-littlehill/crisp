# CRP Token Efficiency Experiment - Test Report

## 1. Test Overview

**Objective**: Measure real-world token consumption differences between CRP (Context Router Protocol) and naive loading (monolithic rules file) during actual Claude Code sessions.

**Scenario**: `feature` - Add benchmark subcommand to crp-setup.py
**Repetition**: r99 (single validation session)
**Date**: 2026-04-24

---

## 2. Sample Setup

### 2.1 Project Structure

The test uses two identical worktrees derived from `feat/v2.1-unified-cli` branch:

| Worktree | Path | Branch | Loading Mode |
|----------|------|--------|--------------|
| CRP | `../crisp-crp` | `experiment-crp` | Context Router Protocol (shard rules) |
| Naive | `../crisp-naive` | `experiment-naive` | Monolithic CLAUDE.md (flattened rules) |

### 2.2 CRP Configuration (crisp-crp)

- **Entry Proxy**: `CLAUDE.md` (1 line - minimal pointer)
- **Skill Rules**: `.claude/skills/backend/` directory
  - 11 files total
  - 620 lines of rules (`.md` and `.sh`)
  - Organized by: `SKILL.md`, `references/`, `rules/`, `scripts/`, `skills/`, `workflows/`

### 2.3 Naive Configuration (crisp-naive)

- **Monolithic File**: `CLAUDE.md` (673 lines)
- Created by `setup-naive.py` flattening all CRP skill files into a single document
- Original `CLAUDE.md` backed up as `CLAUDE.md.bak`

### 2.4 Scenario Design

The `feature` scenario consists of 8 sequential turns simulating a realistic feature development workflow:

| Turn | Instruction |
|------|-------------|
| 1 | Add a new `benchmark` subcommand to `crp-setup.py` with `--skill-a` and `--skill-b` arguments |
| 2 | Use existing `token-audit.py` logic via import, don't shell out |
| 3 | The table should show: skill name, naive tokens, CRP tokens, savings %, estimated cost |
| 4 | Add a `--output json` option too |
| 5 | Add a test in `tests/test_integration.py` for this new command |
| 6 | The test should use a temporary directory with two minimal skill structures |
| 7 | Run the test to verify it passes |
| 8 | Summarize what you changed |

---

## 3. Environment Setup

### 3.1 Hardware / OS

- **Platform**: Windows 11 Pro (10.0.26200)
- **Shell**: Git Bash (MSYS2)
- **Git Bash Path**: `E:\Git\Git\usr\bin\bash.exe`

### 3.2 Software Versions

| Component | Version |
|-----------|---------|
| Python | 3.13.4 |
| Claude Code CLI | 2.1.116 |
| pytest | 8.4.1 |
| scipy | 1.16.0 |
| matplotlib | 3.10.3 |

### 3.3 Experiment Scripts

| Script | Purpose | Status |
|--------|---------|--------|
| `calibrate.py` | Detect token output format from `claude -p --output-format json` | PASS |
| `run-session.py` | Automate 8-turn sessions, record JSONL per turn | PASS |
| `setup-naive.py` | Flatten CRP rules into monolithic CLAUDE.md | PASS |
| `analyze.py` | Paired t-test statistical analysis | PASS |
| `generate-report.py` | Generate charts and markdown reports | PASS |

### 3.4 Key Technical Decisions

1. **Print Mode (`-p`)**: Used `claude -p <message> --output-format json` instead of interactive subprocess to reliably capture token usage from JSON stdout
2. **UTF-8 Encoding**: Explicitly set `encoding="utf-8"` in subprocess to handle smart quotes and Unicode on Windows
3. **Auto Permissions**: `--permission-mode auto` to avoid blocking prompts during automation
4. **Timeout**: 600 seconds per turn (complex coding tasks can exceed 3 minutes)
5. **Error Resilience**: Session continues even if individual turns timeout

---

## 4. Test Process

### 4.1 Calibration Phase

Before running the full scenario, each worktree was calibrated with a simple prompt:

```bash
claude -p "Say hello world" --output-format json --permission-mode auto
```

| Worktree | Input Tokens | Output Tokens |
|----------|-------------:|--------------:|
| crisp-crp (CRP) | 18,220 | 50 |
| crisp-naive (Naive) | 34,391 | 39 |
| **Difference** | **16,171 (47.0%)** | — |

### 4.2 Session Execution

**CRP Session** (completed at 2026-04-24 11:07 UTC):
```bash
python experiment/run-session.py \
    --worktree ../crisp-crp \
    --scenario feature \
    --rep 99 \
    --output experiment/data/raw/test_crp_r99.jsonl \
    --timeout 600
```

**Naive Session** (completed at 2026-04-24 15:55 UTC):
```bash
python experiment/run-session.py \
    --worktree ../crisp-naive \
    --scenario feature \
    --rep 99 \
    --output experiment/data/raw/test_naive_r99.jsonl \
    --timeout 600
```

### 4.3 Data Collection

Each turn produces a JSONL record with the following fields:

```json
{
  "scenario": "feature",
  "worktree": "crisp-crp",
  "rep": 99,
  "turn": 1,
  "input_tokens": 31693,
  "output_tokens": 3356,
  "timestamp": "2026-04-24T10:49:24.158936+00:00",
  "error": null
}
```

---

## 5. Test Data

### 5.1 CRP Session (crisp-crp)

| Turn | Instruction Summary | Input Tokens | Output Tokens | In/Out Ratio |
|------|---------------------|-------------:|--------------:|-------------:|
| 1 | Add benchmark subcommand with args | 31,693 | 3,356 | 9.4x |
| 2 | Use token-audit.py via import | 33,541 | 5,348 | 6.3x |
| 3 | Table format: name, tokens, savings, cost | 70,027 | 798 | 87.8x |
| 4 | Add `--output json` option | 42,400 | 7,754 | 5.5x |
| 5 | Add integration test | 33,049 | 3,676 | 9.0x |
| 6 | Temp directory with skill structures | 34,561 | 5,894 | 5.9x |
| 7 | Run test to verify | 18,676 | 664 | 28.1x |
| 8 | Summarize changes | 63,372 | 1,301 | 48.7x |

**CRP Statistics:**

| Metric | Value |
|--------|-------|
| Total Input Tokens | 327,319 |
| Total Output Tokens | 28,791 |
| Average Input per Turn | 40,915 |
| Average Output per Turn | 3,599 |
| Min Input (Turn 7) | 18,676 |
| Max Input (Turn 3) | 70,027 |
| Standard Deviation (Input) | 17,280 |
| Success Rate | 8/8 (100%) |
| Total Duration | ~18 minutes |

### 5.2 Naive Session (crisp-naive)

| Turn | Instruction Summary | Input Tokens | Output Tokens | In/Out Ratio |
|------|---------------------|-------------:|--------------:|-------------:|
| 1 | Add benchmark subcommand with args | 79,386 | 5,019 | 15.8x |
| 2 | Use token-audit.py via import | 36,342 | 4,585 | 7.9x |
| 3 | Table format: name, tokens, savings, cost | 94,197 | 10,072 | 9.4x |
| 4 | Add `--output json` option | 34,147 | 3,207 | 10.6x |
| 5 | Add integration test | 37,848 | 5,136 | 7.4x |
| 6 | Temp directory with skill structures | 74,781 | 3,622 | 20.6x |
| 7 | Run test to verify | 41,163 | 6,009 | 6.9x |
| 8 | Summarize changes | 27,416 | 1,691 | 16.2x |

**Naive Statistics:**

| Metric | Value |
|--------|-------|
| Total Input Tokens | 425,280 |
| Total Output Tokens | 39,341 |
| Average Input per Turn | 53,160 |
| Average Output per Turn | 4,918 |
| Min Input (Turn 8) | 27,416 |
| Max Input (Turn 3) | 94,197 |
| Standard Deviation (Input) | 25,424 |
| Success Rate | 8/8 (100%) |
| Total Duration | ~21 minutes |

### 5.3 Per-Turn Comparative Analysis

| Turn | CRP Input | Naive Input | Input Savings | CRP Output | Naive Output | Output Savings |
|------|----------:|------------:|--------------:|-----------:|-------------:|---------------:|
| 1 | 31,693 | 79,386 | **+60.1%** | 3,356 | 5,019 | +33.1% |
| 2 | 33,541 | 36,342 | +7.7% | 5,348 | 4,585 | -16.6% |
| 3 | 70,027 | 94,197 | +25.7% | 798 | 10,072 | +92.1% |
| 4 | 42,400 | 34,147 | **-24.2%** | 7,754 | 3,207 | -141.8% |
| 5 | 33,049 | 37,848 | +12.7% | 3,676 | 5,136 | +28.4% |
| 6 | 34,561 | 74,781 | **+53.8%** | 5,894 | 3,622 | -62.7% |
| 7 | 18,676 | 41,163 | **+54.6%** | 664 | 6,009 | +88.9% |
| 8 | 63,372 | 27,416 | **-131.1%** | 1,301 | 1,691 | +23.1% |

### 5.4 Aggregate Comparative Analysis

| Metric | CRP | Naive | Savings |
|--------|-----|-------|---------|
| Calibration Input | 18,220 | 34,391 | **47.0%** |
| Session Total Input | 327,319 | 425,280 | **23.0%** |
| Session Total Output | 28,791 | 39,341 | **26.8%** |
| Avg Input per Turn | 40,915 | 53,160 | **23.0%** |
| Avg Output per Turn | 3,599 | 4,918 | **26.8%** |
| Input Std Dev | 17,280 | 25,424 | CRP more stable |
| Success Rate | 100% | 100% | Equal |

---

## 6. Observations

### 6.1 Overall Savings

| Metric | Savings |
|--------|---------|
| Input Tokens (Session Total) | **23.0%** |
| Output Tokens (Session Total) | **26.8%** |
| Input Tokens (Calibration) | **47.0%** |

The calibration savings (47%) are significantly higher than session savings (23%). This is expected because:
- Calibration measures **pure system prompt** difference (simple "hello world" prompt)
- Full sessions include user instructions, tool outputs, and accumulated context, which dilute the proportional difference

### 6.2 Per-Turn Savings Variability

Savings are **not uniform** across turns. CRP outperforms Naive on some turns but underperforms on others:

**High CRP Savings (>> 50%):**
- **Turn 1** (+60.1%): Initial feature request - CRP loads only relevant gateway/command rules
- **Turn 6** (+53.8%): Test structure setup - CRP loads testing-specific rules efficiently
- **Turn 7** (+54.6%): "Run the test" - minimal context needed, CRP excels

**Moderate CRP Savings (10-30%):**
- **Turn 3** (+25.7%): Table format requirements
- **Turn 5** (+12.7%): Integration test addition

**CRP Underperforms (Negative Savings):**
- **Turn 4** (-24.2%): "Add `--output json` option" - CRP loaded 42,400 tokens vs Naive's 34,147. Likely triggered extensive code structure analysis across multiple rule files.
- **Turn 8** (-131.1%): "Summarize changes" - CRP loaded 63,372 tokens vs Naive's 27,416. The summary instruction may have caused CRP to retrieve all previously loaded rule contexts, while Naive's monolithic file was already fully cached.

### 6.3 Input Token Variability

| Mode | Std Dev | Range |
|------|---------|-------|
| CRP | 17,280 | 18,676 - 70,027 |
| Naive | 25,424 | 27,416 - 94,197 |

CRP shows **lower variability** (std dev 17,280 vs 25,424), suggesting more predictable token usage. Naive mode has higher peaks (Turn 3: 94,197) because the monolithic file always loads entirely, regardless of task relevance.

### 6.4 Output Token Patterns

Output differences are driven by **task complexity and AI behavior**, not loading mode:
- **Turn 3** (table format): Naive output 10,072 vs CRP 798 - Naive generated a full table, CRP gave a brief confirmation
- **Turn 4** (add json option): CRP output 7,754 vs Naive 3,207 - CRP generated more code for the option
- **Turn 7** (run test): Naive output 6,009 vs CRP 664 - Naive produced verbose test output, CRP gave a simple pass/fail

### 6.5 Calibration vs Session Divergence

| Metric | Calibration | Session | Delta |
|--------|-------------|---------|-------|
| CRP Input | 18,220 | 40,915 avg | +2.2x |
| Naive Input | 34,391 | 53,160 avg | +1.5x |
| Savings | 47.0% | 23.0% | -24.0pp |

The 24 percentage point drop from calibration to session suggests that **task execution context** (user prompts, tool results, file contents) becomes a larger proportion of total tokens than the system prompt alone.

### 6.6 Session Reliability

- **CRP session**: 8/8 turns successful, ~18 minutes
- **Naive session**: 8/8 turns successful, ~21 minutes
- No timeout errors with 600s limit
- UTF-8 encoding fix resolved Windows-specific decoding issues
- `--permission-mode auto` had some permission denials but did not block completion

---

## 7. Conclusions

1. **CRP provides measurable token savings** (~23% input, ~27% output) in realistic feature development scenarios
2. **Savings are task-dependent**: CRP excels at execution tasks (run tests, add features) but can underperform on summarization and cross-cutting changes
3. **CRP offers more predictable usage**: Lower standard deviation (17,280 vs 25,424) means fewer surprise cost spikes
4. **Calibration overestimates savings**: Real-world savings (~23%) are roughly half of calibration estimates (~47%) due to task execution overhead

---

## 8. Next Steps

1. **Multi-Rep Validation**: Run 5-10 repetitions of both scenarios to establish statistical significance
2. **Additional Scenarios**: Test `fixbug` and `chat` scenarios for broader coverage
3. **Statistical Analysis**: Run `analyze.py` paired t-test on combined dataset
4. **Visualization**: Generate `generate-report.py` charts for presentation
5. **CRP Optimization**: Investigate Turn 4 and Turn 8 underperformance to improve rule routing

---

*Report generated: 2026-04-24*
*Experiment branch: feat/v2.1-unified-cli*
