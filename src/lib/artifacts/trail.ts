export interface ArtifactEntry {
	artifact_id: string;
	round: number;
	timestamp: string;
	artifact_type: string;
	description: string;
	file_path?: string | null;
	metadata: Record<string, unknown>;
}

export class ArtifactTrail {
	artifacts: ArtifactEntry[] = [];
	current_round: number = 0;

	startRound(roundNumber: number): void {
		this.current_round = roundNumber;
	}

	recordArtifact(
		description: string,
		artifactType: string,
		filePath?: string | null,
		metadata?: Record<string, unknown>,
	): ArtifactEntry {
		const entry: ArtifactEntry = {
			artifact_id: `art_${String(this.artifacts.length + 1).padStart(4, "0")}`,
			round: this.current_round,
			timestamp: new Date().toISOString(),
			artifact_type: artifactType,
			description,
			file_path: filePath ?? null,
			metadata: metadata ?? {},
		};
		this.artifacts.push(entry);
		return entry;
	}

	recordDecision(
		description: string,
		category: string = "general",
	): ArtifactEntry {
		return this.recordArtifact(description, "decision", null, { category });
	}

	getArtifactsByRound(roundNumber: number): ArtifactEntry[] {
		return this.artifacts.filter((a) => a.round === roundNumber);
	}

	getArtifactsByType(artifactType: string): ArtifactEntry[] {
		return this.artifacts.filter((a) => a.artifact_type === artifactType);
	}

	getDecisions(): ArtifactEntry[] {
		return this.getArtifactsByType("decision");
	}

	toDict(): Record<string, unknown> {
		return {
			current_round: this.current_round,
			artifact_count: this.artifacts.length,
			artifacts: this.artifacts.map((a) => ({
				artifact_id: a.artifact_id,
				round: a.round,
				timestamp: a.timestamp,
				type: a.artifact_type,
				description: a.description,
				file_path: a.file_path,
				metadata: a.metadata,
			})),
		};
	}
}
