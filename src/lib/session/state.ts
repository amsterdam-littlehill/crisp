import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { ArtifactTrail } from "../artifacts/trail";

export interface FileRegistryEntry {
	last_loaded_round: number;
	load_count: number;
	last_content_hash: string;
}

export interface SessionState {
	session_id: string;
	skill: string;
	kg_version: string;
	current_round: number;
	file_registry: Record<string, FileRegistryEntry>;
	loaded_files: string[];
	skipped_files: string[];
	pressure_level: string;
	pressure_history: Array<Record<string, unknown>>;
	artifact_trail: ArtifactTrail;
}

function makeId(): string {
	const d = new Date();
	const p = (n: number) => String(n).padStart(2, "0");
	return `sess_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export function createSession(skill: string): SessionState {
	return {
		session_id: makeId(),
		skill,
		kg_version: "",
		current_round: 0,
		file_registry: {},
		loaded_files: [],
		skipped_files: [],
		pressure_level: "normal",
		pressure_history: [],
		artifact_trail: new ArtifactTrail(),
	};
}

function parseTrail(data: Record<string, unknown>): ArtifactTrail {
	const trail = new ArtifactTrail();
	const td = data.artifact_trail as Record<string, unknown> | undefined;
	if (!td) return trail;
	trail.current_round = (td.current_round as number) || 0;
	const arts = td.artifacts as Array<Record<string, unknown>> | undefined;
	if (arts) {
		for (const a of arts) {
			trail.artifacts.push({
				artifact_id: (a.artifact_id as string) || "",
				round: (a.round as number) || 0,
				timestamp: (a.timestamp as string) || "",
				artifact_type: (a.type as string) || "",
				description: (a.description as string) || "",
				file_path: (a.file_path as string) ?? null,
				metadata: (a.metadata as Record<string, unknown>) ?? {},
			});
		}
	}
	return trail;
}

export function loadSession(path: string, skill: string = ""): SessionState {
	let raw: string;
	try {
		raw = readFileSync(path, "utf-8");
	} catch {
		return createSession(skill);
	}
	try {
		const data = JSON.parse(raw);
		return {
			session_id: data.session_id || "",
			skill: data.skill || skill,
			kg_version: data.kg_version || "",
			current_round: data.current_round || 0,
			file_registry: data.file_registry || {},
			loaded_files: data.loaded_files || [],
			skipped_files: data.skipped_files || [],
			pressure_level: data.pressure_level || "normal",
			pressure_history: data.pressure_history || [],
			artifact_trail: parseTrail(data),
		};
	} catch {
		return createSession(skill);
	}
}

export function saveSession(session: SessionState, path: string): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(
		path,
		`${JSON.stringify(
			{
				session_id: session.session_id,
				skill: session.skill,
				kg_version: session.kg_version,
				current_round: session.current_round,
				file_registry: session.file_registry,
				loaded_files: session.loaded_files,
				skipped_files: session.skipped_files,
				pressure_level: session.pressure_level,
				pressure_history: session.pressure_history,
				artifact_trail: session.artifact_trail.toDict(),
			},
			null,
			2,
		)}\n`,
		"utf-8",
	);
}

export function shouldSkipFile(
	fileId: string,
	kgFile: { content_hash?: string },
	session: SessionState,
	dedupRounds: number = 2,
): boolean {
	const entry = session.file_registry[fileId];
	if (!entry) return false;
	const currentHash = kgFile.content_hash ?? "";
	if (
		session.current_round - entry.last_loaded_round <= dedupRounds &&
		currentHash === entry.last_content_hash
	)
		return true;
	return false;
}

export function updateAfterLoad(
	session: SessionState,
	loadedFiles: string[],
	skippedFiles: string[],
	kgVersion: string,
	kgFiles?: Record<string, { content_hash?: string }>,
): SessionState {
	const newRound = session.current_round + 1;
	const newRegistry: Record<string, FileRegistryEntry> = {};
	for (const [k, v] of Object.entries(session.file_registry)) {
		newRegistry[k] = { ...v };
	}
	for (const fileId of loadedFiles) {
		if (!newRegistry[fileId]) {
			newRegistry[fileId] = {
				last_loaded_round: 0,
				load_count: 0,
				last_content_hash: "",
			};
		}
		newRegistry[fileId] = {
			...newRegistry[fileId],
			last_loaded_round: newRound,
			load_count: (newRegistry[fileId].load_count || 0) + 1,
			last_content_hash:
				kgFiles?.[fileId]?.content_hash ??
				newRegistry[fileId].last_content_hash,
		};
	}
	return {
		...session,
		kg_version: kgVersion,
		current_round: newRound,
		file_registry: newRegistry,
		loaded_files: [...loadedFiles],
		skipped_files: [...skippedFiles],
		pressure_history: [...session.pressure_history],
	};
}
