# Packet P0C: Telemetry Report Fallback

Objective:
Make `runReport()` report `.crp/telemetry/reads.jsonl` when structured `log.jsonl` has no READ events.

Files / sources:
- `src/lib/telemetry/reporter.ts`
- `tests/lib/telemetry.test.ts`

Do:
- Use existing failing telemetry test as RED.
- Add a small helper that normalizes report read events.
- Preserve current structured log behavior when READ events exist.
- Verify telemetry suite.

Do not:
- Rewrite telemetry logger or hook installation.
- Change command output labels beyond what tests require.

Expected output:
- Telemetry tests pass.
