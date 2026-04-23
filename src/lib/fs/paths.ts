import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

const SCRIPT_DIR = resolve(import.meta.dirname, "..", "..");
const PROJECT_ROOT = resolve(".");
export const TEMPLATES_DIR = join(SCRIPT_DIR, "..", "templates");
export const SKILLS_DIR = join(PROJECT_ROOT, ".claude", "skills");

export function projectPath(...segments: string[]): string {
	return resolve(PROJECT_ROOT, ...segments);
}

export function templatePath(...segments: string[]): string {
	return join(TEMPLATES_DIR, ...segments);
}

export function skillDirPath(skillName: string): string {
	return join(SKILLS_DIR, skillName);
}

export function fileExists(path: string): boolean {
	return existsSync(path);
}

export function dirExists(path: string): boolean {
	return existsSync(path);
}
