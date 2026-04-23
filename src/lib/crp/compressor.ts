import { readFileSync } from "node:fs";
import { estimateTokens } from "./injection";

export interface SkillSummary {
	summary: string;
	tokens: number;
}

function extractBulletPoints(content: string): string[] {
	const lines = content.split("\n");
	const bullets: string[] = [];

	for (const line of lines) {
		const trimmed = line.trim();
		if (/^[-*]\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed)) {
			const text = trimmed.replace(/^[-*]\s+/, "").replace(/^\d+\.\s+/, "");
			if (text) bullets.push(text);
		}
	}

	return bullets;
}

function isTriggerPhrase(text: string): boolean {
	const lower = text.toLowerCase();
	return (
		lower.startsWith("when ") ||
		lower.startsWith("if ") ||
		lower.startsWith("for ")
	);
}

export function compressSkill(skillPath: string): SkillSummary {
	let content: string;
	try {
		content = readFileSync(skillPath, "utf-8");
	} catch {
		return { summary: "", tokens: 0 };
	}

	const bullets = extractBulletPoints(content);

	// Prioritize trigger phrases
	const triggers = bullets.filter(isTriggerPhrase);
	const others = bullets.filter((b) => !isTriggerPhrase(b));

	let selected = triggers.slice(0, 3);
	if (selected.length < 3) {
		selected = selected.concat(others.slice(0, 3 - selected.length));
	}

	if (selected.length === 0) {
		const fallback = content
			.split("\n")
			.map((l) => l.trim())
			.filter(
				(l) =>
					l &&
					!l.startsWith("#") &&
					!l.startsWith("<!--") &&
					!l.startsWith("|") &&
					l.length > 10,
			)
			.slice(0, 3);
		selected = fallback;
	}

	// Build summary, limiting total tokens
	let summary = selected.join("; ");
	let tokens = estimateTokens(summary);

	while (tokens > 80 && selected.length > 1) {
		selected.pop();
		summary = selected.join("; ");
		tokens = estimateTokens(summary);
	}

	if (tokens > 80 && selected.length === 1) {
		summary = summary.slice(0, 300);
		tokens = estimateTokens(summary);
	}

	return { summary, tokens };
}
