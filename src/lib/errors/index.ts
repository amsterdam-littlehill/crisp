export class CrpError extends Error {
	constructor(
		message: string,
		public readonly exitCode: number = 1,
	) {
		super(message);
		this.name = this.constructor.name;
	}
}

export class ValidationError extends CrpError {
	constructor(message: string) {
		super(message, 1);
	}
}

export class FileNotFoundError extends CrpError {
	constructor(path: string) {
		super(`File not found: ${path}`, 1);
	}
}

export class ManifestNotFoundError extends CrpError {
	constructor() {
		super("No crp.yaml found. Run 'crp init' first.", 1);
	}
}

export class SkillNotFoundError extends CrpError {
	constructor(name: string) {
		super(`Skill directory not found: .claude/skills/${name}`, 1);
	}
}
