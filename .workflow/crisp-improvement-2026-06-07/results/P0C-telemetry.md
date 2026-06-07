# P0C Telemetry Result

Accepted:
- Added `loadReportReadEvents()` to prefer structured READ events from `loadTelemetryLog()`.
- Added fallback parsing for `.crp/telemetry/reads.jsonl` when no structured READ events exist.
- Changed `runReport()` early exit to check reportable READ events rather than raw telemetry log length.

Evidence:
- RED: `bun test tests/lib/telemetry.test.ts` failed with 12 pass / 1 fail and printed `No telemetry events recorded`.
- GREEN: the same command passed with 13 pass / 0 fail.

Remaining risks:
- Fallback parsing intentionally skips malformed JSON lines silently, matching existing logger/analyzer tolerance.
