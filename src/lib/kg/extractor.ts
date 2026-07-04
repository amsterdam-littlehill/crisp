// Pure skill-markup extractors: string in → structured data out. No I/O.
// (The hot-cache generators that used to live here wrote files and were only
// called by the dead runKgSync path; both are gone.)

function skipFrontmatter(lines: string[]): number {
	if (!lines.length || lines[0].trim() !== "---") return 0;
	for (let i = 1; i < lines.length; i++) {
		if (lines[i].trim() === "---") return i + 1;
	}
	return 0;
}

export function extractSummary(content: string, maxLines: number = 3): string {
	const match = content.match(/<!--\s*@summary:\s*(.+?)\s*-->/s);
	if (match) return match[1].trim().split("\n")[0].slice(0, 200);

	const lines = content.split("\n");
	const startIdx = skipFrontmatter(lines);
	const paragraphLines: string[] = [];
	for (const line of lines.slice(startIdx)) {
		if (line.trim().startsWith("#")) continue;
		if (line.trim()) {
			paragraphLines.push(line.trim());
			if (paragraphLines.length >= maxLines) break;
		} else if (paragraphLines.length) {
			break;
		}
	}
	return paragraphLines.join(" ").slice(0, 200);
}

export interface DependencyMarker {
	id: string;
	strength: string;
}

export function extractDependencyMarkers(content: string): DependencyMarker[] {
	const deps: DependencyMarker[] = [];
	const pattern = /<!--\s*@depends-on:\s*([^\s]+)(?:\s+(hard|soft))?\s*-->/gi;
	for (const match of content.matchAll(pattern)) {
		deps.push({ id: match[1].trim(), strength: match[2] || "soft" });
	}
	return deps;
}

export interface TagMarker {
	name: string;
	confidence: number;
}

export function extractTagMarkers(content: string): TagMarker[] {
	const tags: TagMarker[] = [];
	const pattern = /<!--\s*@tag:\s*([^\s]+)(?:\s+([\d.]+))?\s*-->/gi;
	for (const match of content.matchAll(pattern)) {
		tags.push({
			name: match[1].trim(),
			confidence: match[2] ? parseFloat(match[2]) : 1.0,
		});
	}
	return tags;
}
