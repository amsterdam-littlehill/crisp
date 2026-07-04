# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/), and this project adheres to
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Removed — breaking

- **`crp telemetry report --skill <name>`**: the `--skill` flag and the
  `skipEvents` field in the `--json` report output. The underlying SKIP-events
  feature read `.crp/session/state.json`, which no code path ever wrote, so the
  option was inert; it has been removed rather than kept as dead surface.
  Scripts passing `--skill` or reading `skipEvents` should drop them.

### Security

- Skill names in `crp.yaml` and CLI args are now rejected if they contain path
  separators (`/`, `\`) or the `.` / `..` segments — prevents a hostile
  `crp.yaml` (e.g. a cloned repo) from traversing out of the skills directory.
- `crp kg validate <path>` now returns a clean error (exit 1) on a malformed
  `.crp-kg.json` instead of crashing with a raw stack trace.
- `crp kg sync` no longer aborts the whole run if one skill's `.crp-kg.json` is
  unwritable; it skips that skill and still rebuilds the index.

### Changed — internal, non-breaking

- Architecture consolidation: deeper modules, a reunified knowledge-graph
  subsystem (now grouped by domain under `lib/kg/`), and ~2300 lines of dead
  code removed. The public CLI surface is unchanged except for the `--skill`
  removal above. See the `refactor/architecture-consolidation` commits for
  detail.
