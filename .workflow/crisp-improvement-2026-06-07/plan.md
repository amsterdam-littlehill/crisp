# CRISP Improvement Workflow

Goal:
Restore the current CRISP quality baseline by fixing the active failing tests and lint failure from `docs/superpowers/plans/2026-06-07-crisp-project-improvement.md`.

Success criteria:
- Preserve existing user changes in `src/commands/crp-init.ts`, `src/commands/crp-sync.ts`, `tests/commands/crp-init.test.ts`, and `tests/commands/crp-sync.test.ts`.
- Fix the current `analyzeReads`, injection truncation, telemetry report fallback, and Biome formatting failures.
- Verify touched scope with targeted tests.
- Run the broad baseline checks that are feasible in the current workspace and report any unrelated failures honestly.

Current context:
- Branch: `feat/claude-code-plugin-adaptation`.
- Existing dirty files and untracked project additions were present before this workflow.
- The improvement plan is ignored by `.gitignore` because `docs/` is ignored, but it exists locally.

Constraints:
- Do not revert or overwrite user changes.
- Use TDD for behavior changes; existing failing tests count as RED for the active regression cases.
- Keep edits narrow and aligned with existing module boundaries.

Risks:
- Existing dirty command files may affect full-suite results.
- Root-level duplicate tests may encode legacy behavior that differs from nested canonical tests.
- Workflow files under `.workflow/` are already in an untracked directory.

Approval required:
- No approval required for local non-destructive edits and tests.
- Ask before destructive cleanup, branch reset, publish, install, or broad codemods.

Workflow artifact path:
`.workflow/crisp-improvement-2026-06-07/`

Work packets:
- P0A: Analyzer path extraction regression.
- P0B: Injection truncation semantics.
- P0C: Telemetry report fallback.
- P0D: Biome formatting and verification.

Integration policy:
- Accept only fixes backed by targeted test output.
- Keep implementation changes in production files that correspond to failing tests.
- Do not edit dirty command files unless a later verification proves they are blocking the success criteria.

Verification:
- Targeted test commands per packet.
- `bun run lint`.
- `bun run typecheck`.
- `bun test` if targeted checks are green.

Reusable artifacts:
- `orchestration.md`
- packet notes in `packets/`
- result notes in `results/`
- `final-report.md`
