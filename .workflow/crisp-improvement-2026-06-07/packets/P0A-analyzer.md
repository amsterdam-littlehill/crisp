# Packet P0A: Analyzer Path Extraction

Objective:
Fix `analyzeReads` so relative skill paths such as `skills/name/SKILL.md` are recognized.

Files / sources:
- `src/lib/crp/analyzer.ts`
- `tests/analyzer.test.ts`
- `tests/lib/crp/analyzer.test.ts`

Do:
- Use the existing failing root-level analyzer tests as RED.
- Compare path matching patterns.
- Make the minimal regex fix.
- Verify both analyzer suites.

Do not:
- Change analyzer frequency semantics beyond path extraction.
- Remove duplicate tests in this packet.

Expected output:
- Analyzer tests pass.
