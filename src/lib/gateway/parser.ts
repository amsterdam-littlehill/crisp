import { readFileSync } from "node:fs";

export interface TaskEntry {
	task: string;
	reads: string;
	workflow: string;
}

export interface ParseResult {
	found: boolean;
	tasks: TaskEntry[];
	message: string;
}

export function parseCommonTasks(gatewayPath: string): ParseResult {
	let content: string;
	try {
		content = readFileSync(gatewayPath, "utf-8");
	} catch {
		return {
			found: false,
			tasks: [],
			message: `File not found: ${gatewayPath}`,
		};
	}

	const sectionMatch = content.match(/##\s+Common Tasks.*?(?=\n##\s|$)/is);
	if (!sectionMatch) {
		return {
			found: false,
			tasks: [],
			message: `Could not find 'Common Tasks' section in ${gatewayPath}`,
		};
	}

	const section = sectionMatch[0];
	const lines = section.split("\n").filter((ln) => ln.trim().startsWith("|"));

	const tasks: TaskEntry[] = [];
	for (const line of lines) {
		if (/^\|[\s\-:]+\|/.test(line) && !/[a-zA-Z]/.test(line)) continue;
		const cells = line
			.split("|")
			.map((c) => c.trim())
			.filter(Boolean);
		if (
			cells.length >= 3 &&
			cells[0].toLowerCase() !== "task" &&
			!cells[0].toLowerCase().startsWith("<!-- fill:")
		) {
			tasks.push({ task: cells[0], reads: cells[1], workflow: cells[2] });
		}
	}

	return { found: true, tasks, message: "" };
}
