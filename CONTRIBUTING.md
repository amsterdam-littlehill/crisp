# Contributing to CRP

Thank you for your interest in improving the Context Router Protocol. We welcome PRs that improve robustness, documentation, or tooling.

## How to Contribute

### 1. Fork & Branch

```bash
# Fork the repo on GitHub, then clone your fork
git clone https://github.com/YOUR_USERNAME/crisp.git
cd crisp

# Create a feature branch
git checkout -b feat/your-feature-name
```

### 2. Develop

Make your changes, then run the validation suite locally:

```bash
# Initialize a project and create a skill to verify structure
bun run src/cli.ts init --project test
bun run src/cli.ts skill create test-skill
bun run src/cli.ts check
bun run src/cli.ts audit

# Run self-checks
bun run src/cli.ts skill check test-skill

# Run tests
bun test
```

Ensure no template placeholders remain:

```bash
grep -rn '{{NAME}}\|{{PROJECT}}' templates/
```

### 3. Commit

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add interactive setup wizard
fix: correct drift detection for nested skills
docs: clarify entry proxy sizing rules
test: add manifest validation cases
```

### 4. Open a Pull Request

- Push to your fork and open a PR against `master`
- PRs require **1 approving review** before merge
- Ensure CI checks pass

## Code Style

- **Shell scripts:** `set -euo pipefail`, POSIX-compatible where possible
- **TypeScript:** strict types, `node:` built-ins for I/O, `commander` for CLI
- **Markdown:** 100-line soft limit for gateway files, inline routing tables for entry proxies

## Reporting Issues

Open a GitHub Issue with:
- Expected behavior
- Actual behavior
- Steps to reproduce
- Environment (OS, Bun version, tool being used)

## Questions?

Open a Discussion or reach out via GitHub Issues.
