import { describe, expect, test } from "bun:test";
import {
	CrpError,
	FileNotFoundError,
	ManifestNotFoundError,
	SkillNotFoundError,
	ValidationError,
} from "../../src/lib/errors";

describe("CrpError", () => {
	test("stores message and default exit code", () => {
		const err = new CrpError("something went wrong");
		expect(err.message).toBe("something went wrong");
		expect(err.exitCode).toBe(1);
		expect(err.name).toBe("CrpError");
	});

	test("accepts custom exit code", () => {
		const err = new CrpError("not found", 2);
		expect(err.exitCode).toBe(2);
	});

	test("is instance of Error", () => {
		const err = new CrpError("test");
		expect(err).toBeInstanceOf(Error);
		expect(err).toBeInstanceOf(CrpError);
	});
});

describe("ValidationError", () => {
	test("extends CrpError with correct message", () => {
		const err = new ValidationError("invalid input");
		expect(err.message).toBe("invalid input");
		expect(err).toBeInstanceOf(CrpError);
		expect(err).toBeInstanceOf(ValidationError);
		expect(err.name).toBe("ValidationError");
		expect(err.exitCode).toBe(1);
	});
});

describe("FileNotFoundError", () => {
	test("formats message with path", () => {
		const err = new FileNotFoundError("/path/to/file.md");
		expect(err.message).toBe("File not found: /path/to/file.md");
		expect(err).toBeInstanceOf(CrpError);
		expect(err.name).toBe("FileNotFoundError");
	});
});

describe("ManifestNotFoundError", () => {
	test("has standard message", () => {
		const err = new ManifestNotFoundError();
		expect(err.message).toBe("No crp.yaml found. Run 'crp init' first.");
		expect(err).toBeInstanceOf(CrpError);
		expect(err.name).toBe("ManifestNotFoundError");
	});
});

describe("SkillNotFoundError", () => {
	test("formats message with skill name", () => {
		const err = new SkillNotFoundError("backend");
		expect(err.message).toBe(
			"Skill directory not found: .claude/skills/backend",
		);
		expect(err).toBeInstanceOf(CrpError);
		expect(err.name).toBe("SkillNotFoundError");
	});
});
