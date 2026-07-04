import { describe, expect, test } from "bun:test";
import {
	computeQualityScore,
	isProductionReady,
	type ScoreDimension,
} from "../../src/lib/quality/scorer";
import { SKILL_SPEC } from "../../src/lib/skill/spec";

describe("computeQualityScore", () => {
	test("scores a well-structured skill.md", () => {
		const text = `
# Skill

## Zone 1: Attention Sink
**Decision**: Use TypeScript.

## Common Tasks
| Task | Must read | Workflow |
|------|-----------|----------|
| Fix | rules | workflows/fix.md |

- [x] Item 1
- [x] Item 2

Read \`rules.md\` and \`workflow.md\`.
Run the test.
Verify output.
    `;
		const score = computeQualityScore(text);
		expect(score.overall).toBeGreaterThanOrEqual(0);
		expect(score.overall).toBeLessThanOrEqual(10);
		expect(score.density).toBeGreaterThanOrEqual(0);
		expect(score.interference).toBeGreaterThanOrEqual(0);
		expect(score.explicit_ratio).toBeGreaterThanOrEqual(0);
		expect(score.attention_alignment).toBeGreaterThanOrEqual(0);
		expect(score.completeness).toBeGreaterThanOrEqual(0);
		expect(score.freshness).toBeGreaterThanOrEqual(0);
		expect(score.enrichment).toBeGreaterThanOrEqual(0);
		expect(score.cross_references).toBeGreaterThanOrEqual(0);
	});

	test("empty text scores low", () => {
		const score = computeQualityScore("");
		expect(score.overall).toBeGreaterThanOrEqual(0);
		expect(score.overall).toBeLessThanOrEqual(5);
	});

	test("placeholder residues reduce freshness", () => {
		const text = "{{NAME}} and {{PROJECT}} remain. <!-- FILL: description -->";
		const score = computeQualityScore(text);
		expect(score.freshness).toBeLessThanOrEqual(7);
	});

	test("cross-references boost enrichment", () => {
		const text = "Read `file1.md` and `script.py`. Also `config.sh`.";
		const score = computeQualityScore(text);
		expect(score.enrichment).toBeGreaterThan(0);
		expect(score.cross_references).toBeGreaterThan(0);
	});
});

describe("isProductionReady", () => {
	test("returns true for high overall score", () => {
		expect(
			isProductionReady({ overall: 8.0 } as unknown as ScoreDimension),
		).toBe(true);
	});

	test("returns false for low overall score", () => {
		expect(
			isProductionReady({ overall: 5.0 } as unknown as ScoreDimension),
		).toBe(false);
	});

	test("boundary at 7.0", () => {
		expect(
			isProductionReady({ overall: 7.0 } as unknown as ScoreDimension),
		).toBe(true);
		expect(
			isProductionReady({ overall: 6.99 } as unknown as ScoreDimension),
		).toBe(false);
	});
});

describe("scorer ↔ SkillSpec anti-drift", () => {
	// Pins that the scorer's placeholder detection stays a superset of the
	// spec: every placeholderResidue + the fillMarkerPattern must reduce
	// freshness. If the spec adds a residue the scorer no longer catches, this
	// fails — closing the silent-drift gap between the two modules.
	test("every spec placeholderResidue reduces freshness", () => {
		for (const residue of SKILL_SPEC.placeholderResidues) {
			const scored = computeQualityScore(`text with ${residue} here`);
			expect(scored.freshness).toBeLessThan(10);
		}
	});

	test("the spec fillMarkerPattern reduces freshness", () => {
		const scored = computeQualityScore(
			`text ${SKILL_SPEC.fillMarkerPattern} describe this -->`,
		);
		expect(scored.freshness).toBeLessThan(10);
	});
});
