# Orchestration

1. Capture baseline and protect dirty files.
2. Packet P0A:
   - Reproduce analyzer failures.
   - Fix `extractSkillName`.
   - Verify analyzer suites.
3. Packet P0B:
   - Reproduce injection failure.
   - Decide whether root-level or nested test semantics are canonical.
   - Fix `buildInjection` if product rule requires all dead skills to drop together.
   - Verify injection suites.
4. Packet P0C:
   - Reproduce telemetry report fallback failure.
   - Add a normalized report loader.
   - Verify telemetry suite.
5. Packet P0D:
   - Fix Biome formatting.
   - Verify lint, typecheck, targeted tests, and full test suite.
6. Integration:
   - Inspect diffs.
   - Record accepted changes, rejected ideas, conflicts, and residual risk.

Branching rules:
- If a targeted test fails for a new reason after a fix, stop and re-enter systematic debugging for that packet.
- If full-suite failure occurs in files outside touched scope, record as pre-existing or unrelated only after targeted checks prove the touched behavior.
- If existing user dirty files are required to change, stop and ask before editing them.
