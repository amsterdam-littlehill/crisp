# Workflow: Update Rules — Task Closure Protocol

Execute this closure protocol AFTER primary work completes.

## Completion Criteria

1. Primary work completed and verified
2. **30-second AAR scan** (4 questions — if ALL "no", stop here)
3. If ANY "yes" -> pass 2/3 recording threshold -> record

**Skip conditions**: pure formatting, pure comments, dependency-version-only
changes, no-new-lesson refactoring.

---

## AAR: 4 Questions

| # | Question |
|---|----------|
| 1 | **New pattern?** — Did you use an unrecorded pattern or convention? |
| 2 | **New pitfall?** — Did you hit a problem that would waste significant time without forewarning? |
| 3 | **Missing rule?** — Did the absence of a rule cause a detour? |
| 4 | **Stale rule?** — Did you find an existing rule no longer applies? |

---

## Recording Threshold (2/3 criteria)

| Dimension | Pass threshold |
|-----------|---------------|
| Repeatable? | Will this pitfall recur in the future? |
| High cost? | Without forewarning, would this waste >30 minutes debugging? |
| Invisible in code? | Is the pitfall NOT evident from the code itself? |

**Minimum 2/3 required to record.**

### Recording Locations

| Content type | Target location |
|--------------|----------------|
| Stable constraints / general principles | `rules/` |
| Pitfalls, architecture notes | `references/` + SKILL.md Known Gotchas |
| Ordered steps / checklists | `workflows/` |
| Session history / debug process | **NEVER write into skill** — use git / CHANGELOG |

---

## Current Objective (Zone 7)

<!-- FILL: What task this closure protocol serves -->

**Success criteria**:
- [ ] Primary work verified
- [ ] 30-second AAR scan completed (4 questions)
- [ ] Recording threshold passed (2/3 criteria)
- [ ] Lesson recorded in correct location
