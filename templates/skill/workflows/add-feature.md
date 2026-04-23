# Workflow: Add Feature

## Prerequisite Reads (MUST read before starting)

1. `rules/project-rules.md`
2. `rules/coding-standards.md`
3. `references/gotchas.md` (check for relevant pitfalls)

## Execution Steps

## Failure Log (check before starting)

<!-- Scan references/gotchas.md for relevant entries before proceeding -->
- <!-- Auto-populated by health-check -->

### 1. Plan

- Understand user-request boundaries — what is IN scope, what is OUT
- Assess impact: which files change, any interface changes?
- If >=3 independent files/modules involved -> trigger multi-subtask flow
  in `workflows/update-rules.md`

### 2. Implement

- Write per `rules/coding-standards.md` specifications
- Follow `rules/project-rules.md` architecture conventions
- **Precision edits only**: do NOT refactor unrelated code, do NOT add
  unrequested features

### 3. Test

- <!-- FILL: project-specific test command -->
- Confirm new feature works as specified
- Confirm no existing functionality broken

### 4. 30-Second AAR Scan

Task is NOT complete until these 4 questions are answered:

1. **New pattern?** — Did you use an unrecorded pattern or convention?
2. **New pitfall?** — Did you hit a problem that would waste significant time without forewarning?
3. **Missing rule?** — Did the absence of a rule cause a detour?
4. **Stale rule?** — Did you find an existing rule no longer applies?

**Skip conditions** (ONLY these cases may skip): pure formatting, pure comments,
dependency-version-only changes, no-new-lesson refactoring.

If ANY answer is "yes" -> follow `workflows/update-rules.md` recording flow.
