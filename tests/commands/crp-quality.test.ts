import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cmdCrpQuality } from "../../src/commands/crp-quality";

describe("crp-quality.ts", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "crp-quality-test-"));
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	function writeFile(name: string, content: string): string {
		const filePath = join(tempDir, name);
		writeFileSync(filePath, content, "utf-8");
		return filePath;
	}

	test("returns 0 for a well-structured skill file", () => {
		const path = writeFile("good.md", `
# Skill

## Zone 1: Attention Sink
**Decision**: Use TypeScript.

## Common Tasks
| Task | Must read | Workflow |
|------|-----------|----------|
| Fix | rules | workflows/fix.md |

- [x] Item 1
- [x] Item 2

Read \`rules.md\` and \`workflow.md\`.
Run the test.
Verify output.
    `);
		const exitCode = cmdCrpQuality(path);
		expect(exitCode).toBe(0);
	});

	test("returns 0 for empty file (low score, not production ready)", () => {
		const path = writeFile("empty.md", "");
		const exitCode = cmdCrpQuality(path);
		expect(exitCode).toBe(0);
	});

	test("returns 1 when file does not exist", () => {
		const exitCode = cmdCrpQuality("/nonexistent/file.md");
		expect(exitCode).toBe(1);
	});

	test("outputs JSON with --json flag", () => {
		const path = writeFile("test.md", "# Skill\n**Decision**: Use Bun.");
		process.argv.push("--json");
		const exitCode = cmdCrpQuality(path);
		process.argv.pop();
		expect(exitCode).toBe(0);
	});
});
