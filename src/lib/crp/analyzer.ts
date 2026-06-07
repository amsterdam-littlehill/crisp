import { readFileSync } from "node:fs";

export interface ReadRecord {
	ts: string;
	session_id: string;
	file: string;
	tokens: number;
}

export interface SkillFrequency {
	name: string;
	freq: number;
	sessions: number;
	totalSessions: number;
	source?: "project" | "user";
}

export function extractSkillName(filePath: string): string | null {
	const m1 = filePath.match(/([^\\/]+)\.skill\.md$/i);
	if (m1) return m1[1];
	const m2 = filePath.match(/(?:^|[\\/])skills[\\/]([^\\/]+)[\\/]SKILL\.md$/i);
	if (m2) return m2[1];
	return null;
}

export function analyzeReads(
	logPath: string,
	windowDays: number = 30,
): SkillFrequency[] {
	const records: ReadRecord[] = [];
	try {
		const content = readFileSync(logPath, "utf-8").trim();
		if (!content) return [];
		for (const line of content.split("\n")) {
			if (!line.trim()) continue;
			try {
				const rec = JSON.parse(line) as ReadRecord;
				records.push(rec);
			} catch {
				// ignore invalid lines
			}
		}
	} catch {
		return [];
	}

	const MS_PER_DAY = 86400000;
	const cutoff = Date.now() - windowDays * MS_PER_DAY;

	const validRecords = records
		.filter((r) => new Date(r.ts).getTime() >= cutoff)
		.map((r) => ({ ...r, skill: extractSkillName(r.file) }))
		.filter((r): r is ReadRecord & { skill: string } => r.skill !== null);

	// Group by session_id -> Set of skill names (dedup within session)
	const sessionSkills = new Map<string, Set<string>>();
	for (const r of validRecords) {
		const set = sessionSkills.get(r.session_id) || new Set<string>();
		set.add(r.skill);
		sessionSkills.set(r.session_id, set);
	}

	const totalSessions = sessionSkills.size;
	if (totalSessions === 0) return [];

	// Count sessions per skill
	const skillCounts = new Map<string, number>();
	for (const skills of sessionSkills.values()) {
		for (const skill of skills) {
			skillCounts.set(skill, (skillCounts.get(skill) || 0) + 1);
		}
	}

	// Build frequency array
	const result: SkillFrequency[] = [];
	for (const [name, sessions] of skillCounts) {
		result.push({
			name,
			freq: sessions / totalSessions,
			sessions,
			totalSessions,
		});
	}

	return result.sort((a, b) => b.freq - a.freq);
}
