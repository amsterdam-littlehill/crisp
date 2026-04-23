# Workflow: Fix Bug

## Prerequisite Reads (MUST read before starting)

1. `rules/project-rules.md`
2. `rules/coding-standards.md`
3. `references/gotchas.md` (scan for relevant pitfalls)

## Execution Steps

## Failure Log (check before starting)

<!-- Scan references/gotchas.md for relevant entries before proceeding -->
- <!-- Auto-populated by health-check -->

### 1. Locate the Problem

- Read relevant code; understand current behavior
- Reproduce the bug; confirm trigger conditions
- Mark exact files and line numbers needing change

### 2. Precision Edit

**Iron rule**: change ONLY what is necessary; clean up ONLY your own mess.

- Every changed line MUST trace to a user request
- NO docstring additions, NO extra validation, NO unrelated code changes
- If you discover cascade impact, REPORT first; do NOT self-expand scope

### 3. Verify

- Run minimal reproduction test; confirm bug is fixed
- Run existing tests; confirm no regression
- <!-- FILL: project-specific verification command -->

### 4. 30-Second AAR Scan

Task is NOT complete until these 4 questions are answered:

1. **New pattern?** — Did you use an unrecorded pattern or convention?
2. **New pitfall?** — Did you hit a problem that would waste significant time without forewarning?
3. **Missing rule?** — Did the absence of a rule cause a detour?
4. **Stale rule?** — Did you find an existing rule no longer applies?

**Skip conditions** (ONLY these cases may skip): pure formatting, pure comments,
dependency-version-only changes, no-new-lesson refactoring.

If ANY answer is "yes" -> follow `workflows/update-rules.md` recording flow.
