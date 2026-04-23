# Coding Standards — {{PROJECT}}

> Write ONLY "project-specific" or "Agent-violation-prone" rules.
> General standards (e.g. "do not use var") do NOT belong here.

## <!-- FILL: Language / Framework Specific Rules -->

<!-- FILL: e.g. Python: mandatory type annotations, async/await patterns,
     exception handling conventions -->

## <!-- FILL: File Organization Principles -->

<!-- FILL: e.g. MANY SMALL FILES > FEW LARGE FILES; 200-400 lines typical,
     800 maximum -->

## Error Handling

- ALWAYS handle errors explicitly; NEVER silently swallow
- <!-- FILL: Project-specific error handling patterns -->

## Input Validation

- ALWAYS validate input at system boundaries
- <!-- FILL: Project-specific validation rules or libraries -->

## Naming Conventions

- <!-- FILL: Project-specific naming conventions -->

## Code Behavior Checklist

After generating code, Agent MUST verify each item:

- [ ] Every changed line traces to a user request
- [ ] NO "while I'm at it" unrequested features added
- [ ] NO files outside assignment scope modified
- [ ] Error handling is explicit, not silent

## Decision Log

- **Decision**: <!-- FILL: standard name -->
  - **Rationale**: <!-- FILL: why this standard exists -->
  - **Enforcement**: <!-- FILL: how to verify compliance -->
  - **Impact**: <!-- FILL: files affected -->
  - **Status**: active
