# Packet P0D: Formatting And Verification

Objective:
Clear Biome formatting red light and verify the workflow changes.

Files / sources:
- `src/lib/crp/doctor.ts`
- touched packet files

Do:
- Run Biome formatter on the specific lint-failing file.
- Run targeted packet tests.
- Run `bun run lint`, `bun run typecheck`, and full `bun test`.
- Record results.

Do not:
- Apply repo-wide formatting unless a targeted formatting run is insufficient.

Expected output:
- Verification report with pass/fail evidence.
