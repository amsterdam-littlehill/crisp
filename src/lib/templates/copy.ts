import {
	mkdirSync,
	readdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export function copySkillTemplate(
	targetDir: string,
	name: string,
	description: string,
	project: string,
	shadow: boolean = false,
): void {
	const src = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "templates", "skill");

	if (!statSync(src, { throwIfNoEntry: false })?.isDirectory()) {
		console.error(`ERROR: Template directory not found: ${src}`);
		throw new Error(`Template directory not found: ${src}`);
	}

	if (shadow && statSync(targetDir, { throwIfNoEntry: false })?.isDirectory()) {
		console.log(`  [SHADOW] preserving existing skill directory ${targetDir}`);
		return;
	}

	copyRecursive(src, targetDir);
	replacePlaceholders(targetDir, name, project, description);
}

function copyRecursive(src: string, dest: string): void {
	mkdirSync(dest, { recursive: true });
	const entries = readdirSync(src, { withFileTypes: true });
	for (const entry of entries) {
		const srcPath = join(src, entry.name);
		const destPath = join(dest, entry.name);
		if (entry.isDirectory()) {
			copyRecursive(srcPath, destPath);
		} else {
			const content = readFileSync(srcPath);
			writeFileSync(destPath, content);
		}
	}
}

function replacePlaceholders(
	dir: string,
	name: string,
	project: string,
	description: string,
): void {
	const entries = readdirSync(dir, { withFileTypes: true });
	for (const entry of entries) {
		const fullPath = join(dir, entry.name);
		if (entry.isDirectory()) {
			replacePlaceholders(fullPath, name, project, description);
		} else {
			let text: string;
			try {
				text = readFileSync(fullPath, "utf-8");
			} catch {
				continue;
			}
			const newText = text
				.replaceAll("{{NAME}}", name)
				.replaceAll("{{PROJECT}}", project)
				.replaceAll("{{DESCRIPTION}}", description);
			if (newText !== text) {
				writeFileSync(fullPath, newText, "utf-8");
			}
		}
	}
}
