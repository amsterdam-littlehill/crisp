// Closed set of KG edge kinds. validateKg rejects an edge whose `type` is
// absent or not in this set — guards against typo'd/malformed edge types in
// hand-built or external .crp-kg.json files. (Per-kind discriminator fields
// like strength/confidence/weight are intentionally NOT enforced: they are
// optional metadata with sensible defaults, not structural requirements.)
export const KG_EDGE_TYPES = new Set(["DEPENDS_ON", "HAS_TAG", "REQUIRES"]);

export interface KnowledgeGraph {
	project: string;
	generated_at: string;
	nodes: {
		files: Array<{
			id: string;
			path: string;
			skill: string;
			tier: string;
			token_count: number;
			content_hash: string;
			summary: string;
		}>;
		task_types: Array<{
			id: string;
			keywords: string[];
			description: string;
			category: string;
		}>;
		tags: Array<{
			id: string;
			name: string;
			category: string;
		}>;
	};
	edges: Array<{
		from: string;
		to: string;
		type: string;
		weight?: number;
		mandatory?: boolean;
		strength?: string;
		confidence?: number;
		source?: string;
		auto?: boolean;
	}>;
}

export function validateKg(kg: unknown): string[] {
	const errors: string[] = [];

	if (typeof kg !== "object" || kg === null || Array.isArray(kg)) {
		errors.push("KG must be a dictionary");
		return errors;
	}

	const graph = kg as Record<string, unknown>;

	if (!("project" in graph)) {
		errors.push("Missing required field: project");
	}

	const nodes = graph.nodes;
	if (typeof nodes !== "object" || nodes === null || Array.isArray(nodes)) {
		errors.push("nodes must be a dictionary");
		return errors;
	}

	const nodesObj = nodes as Record<string, unknown>;
	const allIds = new Set<string>();

	for (const nodeType of ["files", "task_types", "tags"]) {
		const nodeList = nodesObj[nodeType];
		if (!Array.isArray(nodeList)) {
			errors.push(`nodes.${nodeType} must be a list`);
			continue;
		}
		for (const node of nodeList) {
			if (typeof node !== "object" || node === null) {
				errors.push(`Invalid node in ${nodeType}`);
				continue;
			}
			const nodeId = (node as Record<string, unknown>).id;
			if (!nodeId || typeof nodeId !== "string") {
				errors.push(`Node missing id in ${nodeType}`);
				continue;
			}
			allIds.add(nodeId);
		}
	}

	const edges = graph.edges;
	if (!Array.isArray(edges)) {
		errors.push("edges must be a list");
		return errors;
	}

	for (let i = 0; i < edges.length; i++) {
		const edge = edges[i];
		if (typeof edge !== "object" || edge === null) {
			errors.push(`edges[${i}] must be a dictionary`);
			continue;
		}
		const e = edge as Record<string, unknown>;
		const fromId = e.from;
		const toId = e.to;
		const edgeType = e.type;

		if (!fromId || typeof fromId !== "string") {
			errors.push(`edges[${i}] missing 'from'`);
		} else if (!allIds.has(fromId)) {
			errors.push(`edges[${i}] 'from' references nonexistent node: ${fromId}`);
		}

		if (!toId || typeof toId !== "string") {
			errors.push(`edges[${i}] missing 'to'`);
		} else if (!allIds.has(toId)) {
			errors.push(`edges[${i}] 'to' references nonexistent node: ${toId}`);
		}

		if (!edgeType) {
			errors.push(`edges[${i}] missing 'type'`);
		} else if (!KG_EDGE_TYPES.has(String(edgeType))) {
			errors.push(`edges[${i}] unknown edge type: ${String(edgeType)}`);
		}
	}

	return errors;
}
