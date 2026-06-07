# Packet P0B: Injection Truncation

Objective:
Resolve the current mismatch between `buildInjection` truncation behavior and the root-level test expectation.

Files / sources:
- `src/lib/crp/injection.ts`
- `tests/injection.test.ts`
- `tests/lib/crp/injection.test.ts`

Do:
- Use existing failing injection test as RED.
- Confirm the desired bucket rule from the improvement plan.
- Implement minimal bucket truncation behavior.
- Verify both injection suites.

Do not:
- Change injection text format unless required by the test.
- Change token estimation.

Expected output:
- Injection tests pass.
