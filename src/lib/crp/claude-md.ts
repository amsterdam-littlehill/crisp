import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	type CrpManifest,
	DEFAULT_SESSION_INJECT_TOKENS,
} from "../manifest/io";
import type { Routes } from "./injection";
import {
	buildInjection,
	CRP_INJECT_MARKER_END as CLAUDE_MD_MARKER_END,
	CRP_INJECT_MARKER_START as CLAUDE_MD_MARKER_START,
} from "./injection";

// Re-export under the claude-md-specific names (public API used by callers/tests);
// the value is the shared CRP_INJECT_MARKER constant (single source).
export { CLAUDE_MD_MARKER_END, CLAUDE_MD_MARKER_START };
export const CLAUDE_MD_FILENAME = "CLAUDE.md";

export function generateClaudeMdContent(
	routes: Routes,
	manifest: CrpManifest,
): string {
	const maxTokens =
		manifest.crp?.session_inject?.max_tokens ?? DEFAULT_SESSION_INJECT_TOKENS;
	const injection = buildInjection(routes, maxTokens);
	const lines: string[] = [
		CLAUDE_MD_MARKER_START,
		injection.text,
		CLAUDE_MD_MARKER_END,
	];
	return lines.join("\n");
}

export function updateClaudeMd(
	projectDir: string,
	routes: Routes,
	manifest: CrpManifest,
): { created: boolean; updated: boolean } {
	const claudeMdPath = join(projectDir, CLAUDE_MD_FILENAME);
	const newBlock = generateClaudeMdContent(routes, manifest);

	if (!existsSync(claudeMdPath)) {
		writeFileSync(claudeMdPath, `${newBlock}\n`, "utf-8");
		return { created: true, updated: false };
	}

	const existing = readFileSync(claudeMdPath, "utf-8");

	if (hasInjectionBlock(existing)) {
		const startIdx = existing.indexOf(CLAUDE_MD_MARKER_START);
		const endIdx =
			existing.indexOf(CLAUDE_MD_MARKER_END) + CLAUDE_MD_MARKER_END.length;

		const before = existing.slice(0, startIdx);
		const after = existing.slice(endIdx);

		// Preserve surrounding content, replace only the marker block
		const updated = `${before}${newBlock}${after}`;
		if (updated === existing) {
			return { created: false, updated: false };
		}
		writeFileSync(claudeMdPath, updated, "utf-8");
		return { created: false, updated: true };
	}

	// No markers found — append at end
	const separator = existing.endsWith("\n") ? "" : "\n";
	writeFileSync(claudeMdPath, `${existing}${separator}${newBlock}\n`, "utf-8");
	return { created: false, updated: true };
}

export function readClaudeMd(projectDir: string): string | null {
	const claudeMdPath = join(projectDir, CLAUDE_MD_FILENAME);
	if (!existsSync(claudeMdPath)) {
		return null;
	}
	return readFileSync(claudeMdPath, "utf-8");
}

export function hasInjectionBlock(content: string): boolean {
	return (
		content.includes(CLAUDE_MD_MARKER_START) &&
		content.includes(CLAUDE_MD_MARKER_END)
	);
}
