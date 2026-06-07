# P0B Injection Result

Accepted:
- Added bucket replacement helpers in `buildInjection`.
- Changed dead and lazy truncation to drop whole lower-priority buckets once the output exceeds budget.
- Kept inline truncation as lowest-frequency one-by-one removal.

Evidence:
- RED: `bun test tests/injection.test.ts tests/lib/crp/injection.test.ts` failed with 12 pass / 1 fail, receiving only `["dead-2"]`.
- GREEN: the same command passed with 13 pass / 0 fail.

Remaining risks:
- This makes root-level test semantics explicit. Documentation should later state the whole-bucket dead/lazy rule.
