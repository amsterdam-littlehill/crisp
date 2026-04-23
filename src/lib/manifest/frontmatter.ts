import { readFileSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";

export function extractSkillFrontmatter(
	skillDir: string,
): Record<string, unknown> {
	const skillMd = join(skillDir, "SKILL.md");
	let text: string;
	try {
		text = readFileSync(skillMd, "utf-8");
	} catch {
		return {};
	}

	const match = text.match(/^---\s*\n(.*?)\n---\s*\n/s);
	if (!match) {
		return {};
	}

	const frontmatterText = match[1];
	try {
		const parsed = yaml.load(frontmatterText);
		return parsed && typeof parsed === "object" && !Array.isArray(parsed)
			? (parsed as Record<string, unknown>)
			: {};
	} catch {
		const result: Record<string, unknown> = {};
		for (const line of frontmatterText.split("\n")) {
			const trimmed = line.trim();
			if (trimmed.startsWith("name:")) {
				result.name = trimmed
					.slice(5)
					.trim()
					.replace(/^["']|["']$/g, "");
			} else if (trimmed.startsWith("description:")) {
				result.description = trimmed
					.slice(12)
					.trim()
					.replace(/^["']|["']$/g, "");
			} else if (trimmed.startsWith("primary:")) {
				const val = trimmed.slice(8).trim().toLowerCase();
				result.primary = val === "true" || val === "yes" || val === "1";
			}
		}
		return result;
	}
}
