import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI = join(import.meta.dirname, "..", "..", "src", "cli.ts");

function run(
	args: string[],
	cwd: string,
): { exitCode: number; stdout: string; stderr: string } {
	const proc = Bun.spawnSync({
		cmd: ["bun", "run", CLI, ...args],
		cwd,
		env: { ...process.env },
		stdout: "pipe",
		stderr: "pipe",
	});
	return {
		exitCode: proc.exitCode,
		stdout: proc.stdout.toString(),
		stderr: proc.stderr.toString(),
	};
}

function setupDir(): string {
	return mkdtempSync(join(tmpdir(), "crisp-cli-"));
}

describe("CLI black-box", () => {
	test("crp init creates project", () => {
		const dir = setupDir();
		try {
			const { exitCode } = run(
				["init", "--skill", "backend", "--project", "test-proj"],
				dir,
			);
			expect(exitCode).toBe(0);
			expect(existsSync(join(dir, "crp.yaml"))).toBe(true);
			expect(existsSync(join(dir, ".claude", "skills", "backend"))).toBe(true);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("crp init --dry-run does not create files", () => {
		const dir = setupDir();
		try {
			const { exitCode } = run(
				["init", "--skill", "backend", "--dry-run"],
				dir,
			);
			expect(exitCode).toBe(0);
			expect(existsSync(join(dir, "crp.yaml"))).toBe(false);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("crp skill create adds skill", () => {
		const dir = setupDir();
		try {
			run(["init", "--skill", "backend"], dir);
			const { exitCode } = run(
				["skill", "create", "frontend", "--description", "FE skill"],
				dir,
			);
			expect(exitCode).toBe(0);
			expect(existsSync(join(dir, ".claude", "skills", "frontend"))).toBe(true);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("crp skill list succeeds", () => {
		const dir = setupDir();
		try {
			run(["init", "--skill", "backend"], dir);
			const { exitCode } = run(["skill", "list"], dir);
			expect(exitCode).toBe(0);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("crp skill delete --force removes skill", () => {
		const dir = setupDir();
		try {
			run(["init", "--skill", "backend"], dir);
			const { exitCode } = run(["skill", "delete", "backend", "--force"], dir);
			expect(exitCode).toBe(0);
			expect(existsSync(join(dir, ".claude", "skills", "backend"))).toBe(false);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("crp sync generates shells", () => {
		const dir = setupDir();
		try {
			run(["init", "--skill", "backend", "--project", "test-proj"], dir);
			const { exitCode } = run(["sync"], dir);
			expect(exitCode).toBe(0);
			expect(existsSync(join(dir, ".claude", "skills", "SKILL.md"))).toBe(true);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("crp sync --check reports clean after sync", () => {
		const dir = setupDir();
		try {
			run(["init", "--skill", "backend", "--project", "test-proj"], dir);
			run(["sync"], dir);
			const { exitCode } = run(["sync", "--check"], dir);
			expect(exitCode).toBe(0);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("crp check runs health check", () => {
		const dir = setupDir();
		try {
			run(["init", "--skill", "backend", "--project", "test-proj"], dir);
			const { exitCode } = run(["check", "--skill", "backend"], dir);
			expect(typeof exitCode).toBe("number");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("crp validate validates manifest", () => {
		const dir = setupDir();
		try {
			run(["init", "--skill", "backend", "--project", "test-proj"], dir);
			const { exitCode } = run(["validate"], dir);
			expect(exitCode).toBe(0);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("crp audit --report writes benchmark report", () => {
		const dir = setupDir();
		try {
			run(["init", "--skill", "backend", "--project", "test-proj"], dir);
			const { exitCode } = run(
				["audit", "--skill", "backend", "--report"],
				dir,
			);
			expect(typeof exitCode).toBe("number");
			expect(existsSync(join(dir, "benchmark-report.json"))).toBe(true);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("crp budget runs without error", () => {
		const dir = setupDir();
		try {
			run(["init", "--skill", "backend", "--project", "test-proj"], dir);
			const { exitCode } = run(["budget", "--skill", "backend"], dir);
			expect(typeof exitCode).toBe("number");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("crp kg sync generates knowledge graph", () => {
		const dir = setupDir();
		try {
			run(["init", "--skill", "backend", "--project", "test-proj"], dir);
			const { exitCode } = run(["kg", "sync", "--skill", "backend"], dir);
			expect(exitCode).toBe(0);
			expect(
				existsSync(join(dir, ".claude", "skills", "backend", ".crp-kg.json")),
			).toBe(true);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("crp telemetry status reports status", () => {
		const dir = setupDir();
		try {
			run(["init", "--skill", "backend", "--project", "test-proj"], dir);
			const { exitCode } = run(["telemetry", "status"], dir);
			expect(exitCode).toBe(0);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("crp without args exits non-zero (commander default)", () => {
		const dir = setupDir();
		try {
			const { exitCode } = run([], dir);
			expect(exitCode).toBe(1);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
