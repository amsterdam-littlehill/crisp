import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import type { KnowledgeGraph } from "../kg/validator";
import { estimateTokens } from "./injection";

export interface KgChunk {
	id: string;
	topics: string[];
	content: string;
	tokens: number;
	source: string;
}

export interface KgIndex {
	version: number;
	generated_at: string;
	chunks: KgChunk[];
}

function findKgFiles(projectDir: string): string[] {
	const skillsDir = join(projectDir, ".claude", "skills");
	if (!existsSync(skillsDir)) return [];

	const files: string[] = [];
	try {
		const entries = readdirSync(skillsDir);
		for (const entry of entries) {
			const kgPath = join(skillsDir, entry, ".crp-kg.json");
			if (existsSync(kgPath)) {
				files.push(kgPath);
			}
		}
	} catch {
		// ignore
	}
	return files;
}

export function buildKgIndex(projectDir: string = process.cwd()): KgIndex {
	const kgFiles = findKgFiles(projectDir);
	const chunks: KgChunk[] = [];
	const seenIds = new Set<string>();

	for (const kgPath of kgFiles) {
		let kg: KnowledgeGraph;
		try {
			kg = JSON.parse(readFileSync(kgPath, "utf-8")) as KnowledgeGraph;
		} catch {
			continue;
		}

		const skillName = kg.project;

		// Collect topics from tags and task_types
		const topics: string[] = [skillName.toLowerCase()];
		for (const tag of kg.nodes.tags) {
			topics.push(tag.name.toLowerCase());
		}
		for (const task of kg.nodes.task_types) {
			for (const kw of task.keywords) {
				topics.push(kw.toLowerCase());
			}
		}

		// Create chunks from file summaries
		for (const file of kg.nodes.files) {
			if (!file.summary) continue;

			const id = `${skillName}::${file.id}`;
			if (seenIds.has(id)) continue;
			seenIds.add(id);

			const tokens = estimateTokens(file.summary);
			chunks.push({
				id,
				topics,
				content: file.summary,
				tokens,
				source: file.path,
			});
		}
	}

	return {
		version: 1,
		generated_at: new Date().toISOString(),
		chunks,
	};
}

export function saveKgIndex(
	index: KgIndex,
	projectDir: string = process.cwd(),
): void {
	const indexPath = join(projectDir, ".crp", "kg", "index.json");
	mkdirSync(dirname(indexPath), { recursive: true });
	writeFileSync(indexPath, JSON.stringify(index, null, 2) + "\n", "utf-8");
}

export function loadKgIndex(
	projectDir: string = process.cwd(),
): KgIndex | null {
	const indexPath = join(projectDir, ".crp", "kg", "index.json");
	if (!existsSync(indexPath)) return null;
	try {
		return JSON.parse(readFileSync(indexPath, "utf-8")) as KgIndex;
	} catch {
		return null;
	}
}

export function queryKg(
	topic: string,
	maxTokens: number = 200,
	projectDir: string = process.cwd(),
): string {
	const index = loadKgIndex(projectDir);
	if (!index || index.chunks.length === 0) {
		return `No KG index found for topic: ${topic}`;
	}

	const query = topic.toLowerCase();

	// Find chunks matching topic
	const matched = index.chunks.filter((chunk) =>
		chunk.topics.some((t) => t.includes(query) || query.includes(t)),
	);

	if (matched.length === 0) {
		return `No results found for topic: ${topic}`;
	}

	// Collect chunks until maxTokens
	const result: string[] = [];
	let totalTokens = 0;

	for (const chunk of matched) {
		if (totalTokens + chunk.tokens > maxTokens) break;
		result.push(chunk.content);
		totalTokens += chunk.tokens;
	}

	if (result.length === 0) {
		// Even the first chunk is too big, return truncated
		return matched[0].content.slice(0, 300);
	}

	return result.join("\n\n");
}
