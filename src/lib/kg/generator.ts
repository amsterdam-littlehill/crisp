import { createHash } from "node:crypto";
import { readdirSync, readFileSync, type Stats, statSync } from "node:fs";
import { join } from "node:path";
import type { CrpManifest } from "../manifest/io";
import { parseCommonTasksTable, SKILL_SPEC, tierForPath } from "../skill/spec";
import { estimateTokens as estimateTokensRaw } from "../tokens";
import {
	extractDependencyMarkers,
	extractSummary,
	extractTagMarkers,
} from "./extractor";
import type { KnowledgeGraph } from "./schema";

function estimateTokens(
	text: string,
	useTiktoken: boolean = true,
): [number, string] {
	if (useTiktoken) {
		try {
			return [estimateTokensRaw(text), "[exact]"];
		} catch {
			/* fall through */
		}
	}
	return [Math.floor(text.length / 4), "[estimated]"];
}

function inferTier(filePath: string, skillDir: string): string {
	const rel = filePath.startsWith(skillDir)
		? filePath.slice(skillDir.length).replace(/^[\\/]/, "")
		: filePath;
	return tierForPath(rel);
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

	const ct = SKILL_SPEC.commonTasks;
	const mustReadIdx = ct.mustReadColumn - 1;
	const workflowIdx = ct.workflowColumn - 1;
	const taskTypes: Array<Record<string, unknown>> = [];
	const requiresEdges: Array<Record<string, unknown>> = [];

	for (const cols of parseCommonTasksTable(content)) {
		const taskName = cols[0].toLowerCase().replace(/\s+/g, "-");

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

		if (cols.length > mustReadIdx && cols[mustReadIdx]) {
			for (const ref of cols[mustReadIdx].split("+").map((f) => f.trim())) {
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
		if (cols.length > workflowIdx && cols[workflowIdx]) {
			for (const ref of cols[workflowIdx].split("+").map((f) => f.trim())) {
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

	// Cache each file's content once; passes 2 and 3 read from the cache
	// instead of re-reading the same files off disk.
	const contentById = new Map<string, string>();
	for (const filePath of mdFiles) {
		const rel = filePath
			.slice(skillDir.length)
			.replace(/^[\\/]/, "")
			.replace(/\.md$/, "")
			.replace(/\\/g, "/");
		const content = readFileSync(filePath, "utf-8");
		contentById.set(rel, content);
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
		const content = contentById.get(fnode.id);
		if (!content) continue;
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
		const content = contentById.get(fnode.id);
		if (!content) continue;
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

	// Drop edges whose from/to don't resolve to a created node. REQUIRES edges
	// from Common Tasks and DEPENDS_ON edges from @depends-on markers carry
	// author-typed refs meant to be in-skill files (ADR: `rules/x.md` form); a
	// ref with no matching file is an author bug, not a node — the graph models
	// what exists, so those are filtered here, not shipped as dangling refs
	// validateKg would reject. HAS_TAG and auto-REQUIRES always resolve.
	const validIds = new Set<string>();
	for (const f of kg.nodes.files) validIds.add(f.id);
	for (const t of kg.nodes.task_types) validIds.add(t.id);
	for (const tag of kg.nodes.tags) validIds.add(tag.id);
	kg.edges = kg.edges.filter(
		(e) => validIds.has(String(e.from)) && validIds.has(String(e.to)),
	);

	return kg;
}
