// Scoring constants
const DENSITY_SCALE_FACTOR = 10;
const DENSITY_MAX = 1.0;
const INTERFERENCE_PENALTY = 2;
const INTERFERENCE_MAX = 10;
const EXPLICIT_RATIO_MAX = 10;
const ATTENTION_IMPERATIVE_WEIGHT = 0.7;
const ATTENTION_ZONE_WEIGHT = 0.3;
const ATTENTION_MAX = 10;
const ZONE_MARKER_TARGET = 7;
const COMPLETENESS_TARGET = 5;
const COMPLETENESS_MAX = 10;
const FRESHNESS_MAX = 10;
const ENRICHMENT_TARGET = 3;
const ENRICHMENT_MAX = 10;
const CROSS_REF_TARGET = 5;
const CROSS_REF_MAX = 10;

// Overall weight coefficients
const WEIGHT_DENSITY = 0.05;
const WEIGHT_INTERFERENCE = 0.2;
const WEIGHT_EXPLICIT_RATIO = 0.25;
const WEIGHT_ATTENTION_ALIGNMENT = 0.15;
const WEIGHT_COMPLETENESS = 0.15;
const WEIGHT_FRESHNESS = 0.1;
const WEIGHT_ENRICHMENT = 0.05;
const WEIGHT_CROSS_REFERENCES = 0.05;

// Production threshold
const MIN_PRODUCTION_SCORE = 7.0;

// Density output scaling
const DENSITY_OUTPUT_SCALE = 10;

// Attention alignment boost
const ATTENTION_IMPERATIVE_BOOST = 3.0;

// Pre-compiled regex patterns
const BULLET_PATTERN = /^[\s]*[-*][\s]+/m;
const LABEL_PATTERN =
	/\*\*(Decision|Rationale|Status|Impact|File|Alternative|Enforcement)\*\*\s*:/gi;
const CHECKLIST_PATTERN = /-\s*\[\s*[ x]\s*\]/;
const PLACEHOLDER_PATTERN = /\{\{[A-Z_]+\}\}|<!--\s*FILL:/g;
const CROSS_REF_PATTERN = /`[^`]+\.(md|mdc|py|sh)`/g;
const AMBIGUOUS_PRONOUN_PATTERN =
	/\b(it|this|that|them)\b/gim;
const SENTENCE_SPLIT_PATTERN = /[.!?\n]+/;

const QUANTIFIED_PATTERNS: RegExp[] = [
	/\b\d+\s*(lines?|files?|tokens?|turns?|minutes?|seconds?|%)/gi,
	/\b(max|min|ceiling|floor|limit|threshold)\s*:?\s*\d+/gi,
	/\b(true|false)\b/g,
	/\b\d+\/\d+\b/g,
];

const IMPERATIVE_STARTERS = [
	"run",
	"stop",
	"verify",
	"check",
	"read",
	"write",
	"execute",
	"follow",
	"use",
	"add",
	"remove",
	"ensure",
	"confirm",
	"ask",
	"tell",
	"return",
	"raise",
	"assert",
	"install",
	"load",
	"skip",
	"merge",
	"split",
	"trace",
	"re-read",
	"re-walk",
	"default",
	"switch",
	"trigger",
	"pass",
	"fail",
	"never",
];

const ZONE_MARKERS = [
	"Attention Sink",
	"Stable Prefix",
	"Explicit State",
	"Failure Log",
	"Compressed Knowledge",
	"Sacred Recent",
	"Highest Attention",
	"Current Objective",
];

export interface ScoreDimension {
	overall: number;
	density: number;
	interference: number;
	explicit_ratio: number;
	attention_alignment: number;
	completeness: number;
	freshness: number;
	enrichment: number;
	cross_references: number;
}

function countExplicitLabels(text: string): [number, number] {
	const lines = text.split("\n");
	const contentBullets = lines.filter(
		(ln) => BULLET_PATTERN.test(ln) && !CHECKLIST_PATTERN.test(ln),
	);
	const totalBullets = contentBullets.length;
	const labeled = (text.match(LABEL_PATTERN) || []).length;
	return [labeled, totalBullets];
}

function countImperativeSentences(text: string): [number, number] {
	const sentences = text
		.split(SENTENCE_SPLIT_PATTERN)
		.map((s) => s.trim())
		.filter((s) => s.length > 3);

	let imperatives = 0;
	for (const s of sentences) {
		const lower = s.toLowerCase();
		for (const starter of IMPERATIVE_STARTERS) {
			if (lower.startsWith(`${starter} `) || lower.startsWith(`**${starter}`)) {
				imperatives++;
				break;
			}
		}
	}

	return [imperatives, sentences.length];
}

function countQuantifiedConstraints(text: string): number {
	let count = 0;
	for (const pat of QUANTIFIED_PATTERNS) {
		count += (text.match(pat) || []).length;
	}
	return count;
}

function countChecklists(text: string): number {
	return (text.match(CHECKLIST_PATTERN) || []).length;
}

function countZoneMarkers(text: string): number {
	let count = 0;
	const lower = text.toLowerCase();
	for (const zone of ZONE_MARKERS) {
		if (lower.includes(zone.toLowerCase())) {
			count++;
		}
	}
	return count;
}

function countAmbiguousPronouns(text: string): number {
	const matches = text.match(AMBIGUOUS_PRONOUN_PATTERN);
	return matches ? matches.length : 0;
}

export function computeQualityScore(text: string): ScoreDimension {
	const lines = text.split("\n");
	const wordCount = text.split(/\s+/).length;

	// Density
	const nonEmptyLines = lines.filter((ln) => ln.trim());
	const density =
		Math.min(
			wordCount / Math.max(nonEmptyLines.length, 1) / DENSITY_SCALE_FACTOR,
			DENSITY_MAX,
		) *
		DENSITY_MAX *
		DENSITY_OUTPUT_SCALE;

	// Interference
	const ambiguous = countAmbiguousPronouns(text);
	const interference = Math.max(
		INTERFERENCE_MAX - ambiguous * INTERFERENCE_PENALTY,
		0,
	);

	// Explicit ratio
	const [labeled, totalBullets] = countExplicitLabels(text);
	const explicitRatio =
		(labeled / Math.max(totalBullets, 1)) * EXPLICIT_RATIO_MAX;

	// Attention alignment
	const [imperatives, totalSents] = countImperativeSentences(text);
	const imperativeRatio = imperatives / Math.max(totalSents, 1);
	const zoneScore = Math.min(
		countZoneMarkers(text) / ZONE_MARKER_TARGET,
		DENSITY_MAX,
	);
	let attentionAlignment =
		(imperativeRatio * ATTENTION_IMPERATIVE_WEIGHT +
			zoneScore * ATTENTION_ZONE_WEIGHT) *
		ATTENTION_MAX;
	if (imperatives > 0) {
		attentionAlignment = Math.min(
			attentionAlignment + ATTENTION_IMPERATIVE_BOOST,
			ATTENTION_MAX,
		);
	}

	// Completeness
	const quantified = countQuantifiedConstraints(text);
	const checklists = countChecklists(text);
	const completeness =
		Math.min((quantified + checklists) / COMPLETENESS_TARGET, DENSITY_MAX) *
		COMPLETENESS_MAX;

	// Freshness
	const placeholders = (text.match(PLACEHOLDER_PATTERN) || []).length;
	const freshness = Math.max(FRESHNESS_MAX - placeholders, 0);

	// Enrichment
	const crossRefs = (text.match(CROSS_REF_PATTERN) || []).length;
	const enrichment =
		Math.min(crossRefs / ENRICHMENT_TARGET, DENSITY_MAX) * ENRICHMENT_MAX;

	// Cross-references
	const crossReferences =
		Math.min(crossRefs / CROSS_REF_TARGET, DENSITY_MAX) * CROSS_REF_MAX;

	// Overall weighted average
	const overall =
		density * WEIGHT_DENSITY +
		interference * WEIGHT_INTERFERENCE +
		explicitRatio * WEIGHT_EXPLICIT_RATIO +
		attentionAlignment * WEIGHT_ATTENTION_ALIGNMENT +
		completeness * WEIGHT_COMPLETENESS +
		freshness * WEIGHT_FRESHNESS +
		enrichment * WEIGHT_ENRICHMENT +
		crossReferences * WEIGHT_CROSS_REFERENCES;

	return {
		overall: Math.round(overall * 100) / 100,
		density: Math.round(density * 100) / 100,
		interference: Math.round(interference * 100) / 100,
		explicit_ratio: Math.round(explicitRatio * 100) / 100,
		attention_alignment: Math.round(attentionAlignment * 100) / 100,
		completeness: Math.round(completeness * 100) / 100,
		freshness: Math.round(freshness * 100) / 100,
		enrichment: Math.round(enrichment * 100) / 100,
		cross_references: Math.round(crossReferences * 100) / 100,
	};
}

export function isProductionReady(score: ScoreDimension): boolean {
	return score.overall >= MIN_PRODUCTION_SCORE;
}
