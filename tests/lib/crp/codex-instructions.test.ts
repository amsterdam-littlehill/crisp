import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	CODEX_INSTRUCTIONS_PATH,
	generateCodexInstructionsContent,
	updateCodexInstructions,
} from "../../../src/lib/crp/codex-instructions";
import { defaultManifest } from "../../../src/lib/manifest/io";

describe("codex-instructions.ts", () => {
	test("generates a compact Codex shell with the CRP injection block", () => {
		const content = generateCodexInstructionsContent(
			{
				version: 3,
				skills: [
					{
						name: "backend",
						strategy: "inline",
						freq: 1,
						hint: "Read backend routing only when backend code changes.",
					},
				],
			},
			defaultManifest("sample-app"),
		);

		expect(content).toContain("# sample-app - Codex Instructions");
		expect(content).toContain("<!-- CRP_INJECT_START -->");
		expect(content).toContain("[CRP Router]");
		expect(content).toContain("backend");
		expect(content).toContain("<!-- CRP_INJECT_END -->");
		expect(content).toContain(
			"Use context-mode or sandboxed commands for bulk analysis",
		);
	});

	test("writes .codex/instructions.md and reports created then unchanged", () => {
		const projectDir = mkdtempSync(join(tmpdir(), "codex-instructions-test-"));
		try {
			const routes = { version: 3, skills: [] };
			const manifest = defaultManifest("sample-app");

			const first = updateCodexInstructions(projectDir, routes, manifest);
			expect(first.created).toBe(true);
			expect(first.updated).toBe(false);

			const filePath = join(projectDir, CODEX_INSTRUCTIONS_PATH);
			expect(existsSync(filePath)).toBe(true);
			expect(readFileSync(filePath, "utf-8")).toContain(
				"# sample-app - Codex Instructions",
			);

			const second = updateCodexInstructions(projectDir, routes, manifest);
			expect(second.created).toBe(false);
			expect(second.updated).toBe(false);
		} finally {
			rmSync(projectDir, { recursive: true, force: true });
		}
	});
});
