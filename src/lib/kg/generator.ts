import { createHash } from "node:crypto";
import {
	existsSync,
	readdirSync,
	readFileSync,
	type Stats,
	statSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { getEncoding } from "js-tiktoken";
import type { CrpManifest } from "../manifest/types";
import {
	extractDependencyMarkers,
	extractSummary,
	extractTagMarkers,
	generateHotCacheFile,
} from "./extractor";
import type { KnowledgeGraph } from "./validator";
import { validateKg } from "./validator";

let enc: ReturnType<typeof getEncoding> | null = null;
function getEnc() {
	if (!enc) {
		try {
			enc = getEncoding("cl100k_base");
		} catch {
			/* unavailable */
		}
	}
	return enc;
}

function estimateTokens(
	text: string,
	useTiktoken: boolean = true,
): [number, string] {
	if (useTiktoken) {
		const encoder = getEnc();
		if (encoder) {
			try {
				return [encoder.encode(text).length, "[exact]"];
			} catch {
				/* fall through */
			}
		}
	}
	return [Math.floor(text.length / 4), "[estimated]"];
}

function inferTier(filePath: string, skillDir: string): string {
	const name = filePath.toLowerCase().replace(/^.*[\\/]/, "");
	if (name === "_hot-cache.md" || name === "skill.md") return "L0";
	const rel = filePath.startsWith(skillDir)
		? filePath.slice(skillDir.length).replace(/^[\\/]/, "")
		: filePath;
	const parts = rel.split(/[\\/]/);
	if (parts.length > 1) {
		const cat = parts[0].toLowerCase();
		if (cat === "rules") return "L1";
		if (cat === "workflows") return "L2";
		if (cat === "references") return "L3";
	}
	return "L2";
}

function inferFromCommonTasks(
	skillMdPath: string,
): [Array<Record<string, unknown>>, Array<Record<string, unknown>>] {
	let content = "";
	try {
		content = readFileSync(skillMdPath, "utf-8");
	} catch {
		return [[], []];
	}

	const taskTypes: Array<Record<string, unknown>> = [];
	const requiresEdges: Array<Record<string, unknown>> = [];
	const tableMatch = content.match(/##?\s*Common Tasks.*?(\|.*?\|.*)/is);
	if (!tableMatch) return [taskTypes, requiresEdges];

	let tableText = tableMatch[1];
	const doubleNewline = tableText.indexOf("\n\n");
	if (doubleNewline !== -1) tableText = tableText.slice(0, doubleNewline);

	const lines = tableText.split("\n").filter((l) => l.trim().startsWith("|"));
	if (lines.length < 2) return [taskTypes, requiresEdges];

	for (const line of lines.slice(2)) {
		const cols = line
			.split("|")
			.map((c) => c.trim())
			.filter((c) => c);
		if (cols.length < 2) continue;
		const taskName = cols[0].toLowerCase().replace(/\s+/g, "-");
		if (taskName.startsWith("<!--") || taskName === "other-/-unlisted")
			continue;

		const keywords =
			cols.length >= 4
				? cols[cols.length - 1].split(",").map((k) => k.trim())
				: taskName.split("-");

		taskTypes.push({
			id: taskName,
			keywords,
			description: cols[0],
			category: "execution",
		});

		if (cols.length >= 2 && cols[1]) {
			for (const ref of cols[1].split("+").map((f) => f.trim())) {
				const cleaned = ref.replace(/`/g, "").replace(/\.md$/, "");
				if (cleaned?.includes("/") && !cleaned.includes(" ")) {
					requiresEdges.push({
						from: taskName,
						to: cleaned,
						type: "REQUIRES",
						weight: 1.0,
						mandatory: true,
					});
				}
			}
		}
		if (cols.length >= 3 && cols[2]) {
			for (const ref of cols[2].split("+").map((f) => f.trim())) {
				const cleaned = ref.replace(/`/g, "").replace(/\.md$/, "");
				if (cleaned?.includes("/") && !cleaned.includes(" ")) {
					requiresEdges.push({
						from: taskName,
						to: cleaned,
						type: "REQUIRES",
						weight: 0.7,
						mandatory: false,
					});
				}
			}
		}
	}
	return [taskTypes, requiresEdges];
}

function walkMdFiles(dir: string): string[] {
	const results: string[] = [];
	let entries: string[];
	try {
		entries = readdirSync(dir);
	} catch {
		return results;
	}
	for (const entry of entries) {
		const fp = join(dir, entry);
		let st: Stats;
		try {
			st = statSync(fp);
		} catch {
			continue;
		}
		if (st.isDirectory()) {
			results.push(...walkMdFiles(fp));
		} else if (entry.endsWith(".md")) {
			results.push(fp);
		}
	}
	return results;
}

export function generateKnowledgeGraph(
	skillDir: string,
	manifest: CrpManifest,
): KnowledgeGraph {
	const useTiktoken = manifest.audit?.use_tiktoken !== false;

	const kg: KnowledgeGraph = {
		project: manifest.project?.name || "unknown",
		generated_at: new Date().toISOString(),
		nodes: { files: [], task_types: [], tags: [] },
		edges: [],
	};

	const mdFiles = walkMdFiles(skillDir).filter((f) => {
		const name = f.replace(/^.*[\\/]/, "");
		return !name.startsWith(".") && name !== "_hot-cache.md";
	});

	for (const filePath of mdFiles) {
		const rel = filePath
			.slice(skillDir.length)
			.replace(/^[\\/]/, "")
			.replace(/\.md$/, "")
			.replace(/\\/g, "/");
		const content = readFileSync(filePath, "utf-8");
		const [tokenCount] = estimateTokens(content, useTiktoken);
		kg.nodes.files.push({
			id: rel,
			path: filePath.slice(skillDir.length).replace(/^[\\/]/, ""),
			skill: skillDir.replace(/^.*[\\/]/, ""),
			tier: inferTier(filePath, skillDir),
			token_count: tokenCount,
			content_hash: createHash("sha256")
				.update(content)
				.digest("hex")
				.slice(0, 16),
			summary: extractSummary(content),
		});
	}

	for (const fnode of kg.nodes.files) {
		const mdPath = join(skillDir, `${fnode.id}.md`);
		let content: string;
		try {
			content = readFileSync(mdPath, "utf-8");
		} catch {
			continue;
		}
		for (const dep of extractDependencyMarkers(content)) {
			kg.edges.push({
				from: fnode.id,
				to: dep.id,
				type: "DEPENDS_ON",
				strength: dep.strength,
			});
		}
	}

	const skillMd = join(skillDir, "SKILL.md");
	const [taskTypes, requiresEdges] = inferFromCommonTasks(skillMd);
	kg.nodes.task_types = taskTypes as KnowledgeGraph["nodes"]["task_types"];
	kg.edges.push(...(requiresEdges as KnowledgeGraph["edges"]));

	for (const fnode of kg.nodes.files) {
		const mdPath = join(skillDir, `${fnode.id}.md`);
		let content: string;
		try {
			content = readFileSync(mdPath, "utf-8");
		} catch {
			continue;
		}
		for (const tag of extractTagMarkers(content)) {
			const tagId = `tag:${tag.name}`;
			if (!kg.nodes.tags.some((t) => t.id === tagId)) {
				kg.nodes.tags.push({ id: tagId, name: tag.name, category: "domain" });
			}
			kg.edges.push({
				from: fnode.id,
				to: tagId,
				type: "HAS_TAG",
				confidence: tag.confidence,
				source: "manual",
			});
		}
	}

	const l0l1Files = kg.nodes.files.filter(
		(f) => f.tier === "L0" || f.tier === "L1",
	);
	for (const tt of kg.nodes.task_types) {
		for (const fnode of l0l1Files) {
			if (!kg.edges.some((e) => e.from === tt.id && e.to === fnode.id)) {
				kg.edges.push({
					from: tt.id,
					to: fnode.id,
					type: "REQUIRES",
					weight: 0.3,
					mandatory: false,
					auto: true,
				});
			}
		}
	}

	return kg;
}

export function runKgSync(
	skillName: string | null,
	skillsDir: string,
	manifest: CrpManifest,
	outputPath?: string,
): number {
	const skills = manifest.skills || [];
	const skillDirs: Array<[string, string]> = skillName
		? [[skillName, join(skillsDir, skillName)]]
		: skills.map((s) => [s.name, join(skillsDir, s.name)]);

	for (const [name, skillDir] of skillDirs) {
		if (!existsSync(skillDir)) {
			console.log(`WARNING: Skill directory not found: ${skillDir}`);
			continue;
		}
		const kg = generateKnowledgeGraph(skillDir, manifest);
		const errors = validateKg(kg);
		if (errors.length) {
			console.log(`ERROR: Generated KG for '${name}' is invalid:`);
			for (const e of errors) console.log(`  - ${e}`);
			return 1;
		}
		const outPath = outputPath || join(skillDir, ".crp-kg.json");
		writeFileSync(outPath, `${JSON.stringify(kg, null, 2)}\n`, "utf-8");
		console.log(`[GENERATED] ${outPath}`);
		console.log(`  Files: ${kg.nodes.files.length}`);
		console.log(`  TaskTypes: ${kg.nodes.task_types.length}`);
		console.log(`  Edges: ${kg.edges.length}`);
		const hotCachePath = generateHotCacheFile(skillDir);
		console.log(`[GENERATED] ${hotCachePath}`);
	}
	return 0;
}
