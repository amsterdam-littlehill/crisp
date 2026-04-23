# Anti-Templates — Deliberately Not Prefabricated

> These files **must not** appear in the scaffold template.
> They should emerge naturally as the project evolves. Prefabricating them creates noise.
>
> Core principle of CRP: **structure is reusable, content is forbidden to prefabricate**.

## Forbidden Prefabrication List

| File / Content | Why Not Prefabricate | Correct Approach |
|---------------|---------------------|------------------|
| `references/api-surface.md` | API lists can be generated from code; prefabs go stale | Hand-write when needed, or generate from OpenAPI/Swagger |
| `references/dependencies.md` | package.json / Cargo.toml / go.mod is the source of truth | Auto-generate from lockfile |
| `workflows/deploy.md` | Deployment flows vary enormously per project | Record after first real deployment via Closure Extraction |
| `workflows/oncall.md` | Operational procedures are shaped by real incidents | Record after experiencing the first real incident |
| `rules/performance-budgets.md` | Data without profiling is hallucination | Write only after real profiling data exists |
| `rules/naming-conventions.md` | Naming habits should be extracted from existing code | Scan codebase and统计 existing patterns |
| `gotchas.md` filled content | Pitfalls must be earned through real debugging | **Must start empty** — see gotchas.md comments |
| Complete `project-rules.md` | Project rules require understanding real code structure | Provide skeleton + FILL markers only; fill after installation |
| Test strategy details | Guessing without reading existing tests is speculation | Scan existing test/ directory and inherit patterns |
| CI/CD configuration templates | Platforms differ too much | Keep outside `.crp/`; place in project root |
| **Gotcha examples in template** | Examples in templates become copy-pasted defaults | Move examples to `ANTI-TEMPLATES.md` or `docs/`; template stays empty |

## Structural Principles

### 1. Signal > Noise

Prefabricated content is **noise** in context. The Agent will try to follow every rule, even when it doesn't apply to the current task.

```
BAD:  20 possibly-relevant rules → Agent confused → picks safest mediocre option
GOOD: 5 definitively-relevant rules → Agent decisive → executes precisely
```

### 2. Trust Code Over Comments

If a rule can be inferred from the code, it should not be written explicitly.

- Code already uses async/await everywhere → no need for a rule saying "use async/await"
- Code already uses Zod for validation → no need for a rule saying "validate all inputs"

### 3. Triggers Must Be Verifiable

Every `Common Tasks` description must correspond to a real user request that has actually occurred.

```
BAD:  "optimize performance" — which performance? what metric?
GOOD:  "fix page load performance where LCP > 2.5s" — verifiable, testable
```

## Post-Installation Fill Guide

After installing the scaffold, fill in this order:

1. **Fill immediately** (installation day):
   - `gateway.md` Description (one sentence describing the project)
   - `rules/project-rules.md` architectural conventions (inspect existing code structure)
   - `rules/coding-standards.md` toolchain and formatting rules

2. **Fill after first task** (via Closure Extraction):
   - `workflows/fix-bug.md` test commands
   - `workflows/add-feature.md` test commands
   - `references/gotchas.md` first real pitfall

3. **Fill after first milestone** (1-2 weeks of project runtime):
   - Extract stable rules from `gotchas.md` into `rules/`
   - Add missing high-frequency tasks to `Common Tasks`
   - Remove never-triggered Task entries

4. **Never fill** (keep blank):
   - Any content marked `<!-- FILL: only fill after encountering a real issue -->`
   - Any rule whose trigger condition you cannot verify
