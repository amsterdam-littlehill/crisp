<!-- templates/kg/query-protocol.md -->

## CRP Knowledge Graph Loading Protocol

### Step 1: Read Index

Load `.crp-kg.json` and `.crp-session.json`.

### Step 2: Classify Intent

Match user message keywords against `TaskType.keywords`.

**Matching algorithm:**
- Substring match (case-insensitive), count keyword matches
- If no match, default to "execution"
- Tie-breaker: prefer category="execution"

### Step 3: Graph Traversal

1. **Auto-collect L0/L1 files**: Include all files with `tier = "L0"` or
   `tier = "L1"` by default.
2. **Collect explicit REQUIRES**: For matched TaskType, collect files where
   `mandatory = true` OR `weight > 0.5`.
3. Merge and deduplicate. Sort by `weight` descending.

### Step 4: Temporal Filtering

For each candidate file:
- Check `.crp-session.json` `file_registry`
- If `last_loaded_round >= current_round - 2` AND
  `last_content_hash == current_hash` -> SKIP
- SKIPs are tracked in session state (Step 7); they do NOT become tool calls

### Step 5: Dependency Resolution

For each candidate, follow DEPENDS_ON edges with `strength = "hard"`.
Add dependencies to load list (recurse up to 2 levels).

### Step 6: Ordering and Budget

Load order:
1. L0 gateway files
2. `mandatory: true` files
3. By `weight` descending
4. Dependencies before dependents

Token budget by intent category:
- execution: <= max_tokens_execution (default 1500)
- synthesis: <= max_tokens_synthesis (default 800)
- cross-domain: <= max_tokens_cross_domain (default 1200)

**Hard ceiling**: If `mandatory: true` files exceed budget, load them anyway
and record a warning.

### Step 7: Update Session State

Record decisions to `.crp-session.json`:
- Increment `current_round`
- Update `file_registry` for each loaded file
- Set `loaded_files` and `skipped_files` for this round
