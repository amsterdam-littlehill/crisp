import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	clearMemoryCache,
	countTokens,
	getCachedCount,
	invalidateCache,
	loadCache,
	saveCache,
} from "../../../src/lib/crp/token-cache";

describe("token-cache.ts", () => {
	let tempDir: string;
	let cachePath: string;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "crp-cache-test-"));
		cachePath = join(tempDir, "token-counts.json");
		mkdirSync(tempDir, { recursive: true });
		clearMemoryCache();
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	test("countTokens returns accurate count for a file", () => {
		const filePath = join(tempDir, "test.txt");
		writeFileSync(filePath, "hello world", "utf-8");

		const tokens = countTokens(filePath, undefined, cachePath);
		expect(tokens).toBe(2);
	});

	test("countTokens caches result and getCachedCount returns it", () => {
		const filePath = join(tempDir, "test.txt");
		writeFileSync(filePath, "hello world", "utf-8");

		const first = countTokens(filePath, undefined, cachePath);
		expect(first).toBe(2);

		const cached = getCachedCount(filePath, cachePath);
		expect(cached).toBe(2);
	});

	test("getCachedCount returns null when file not in cache", () => {
		const result = getCachedCount(join(tempDir, "nonexistent.txt"), cachePath);
		expect(result).toBeNull();
	});

	test("getCachedCount returns null when mtime changed", () => {
		const filePath = join(tempDir, "test.txt");
		writeFileSync(filePath, "hello world", "utf-8");

		countTokens(filePath, undefined, cachePath);

		// Modify file
		writeFileSync(filePath, "hello world modified", "utf-8");

		const cached = getCachedCount(filePath, cachePath);
		expect(cached).toBeNull();
	});

	test("saveCache persists to disk and loadCache restores", () => {
		const filePath = join(tempDir, "test.txt");
		writeFileSync(filePath, "hello world", "utf-8");

		countTokens(filePath, undefined, cachePath);
		saveCache(cachePath);

		const content = readFileSync(cachePath, "utf-8");
		const parsed = JSON.parse(content);
		expect(parsed[filePath]).toBeDefined();
		expect(parsed[filePath].tokens).toBe(2);
		expect(typeof parsed[filePath].mtime).toBe("number");
	});

	test("countTokens returns 0 for missing file", () => {
		const tokens = countTokens(
			join(tempDir, "missing.txt"),
			undefined,
			cachePath,
		);
		expect(tokens).toBe(0);
	});

	test("invalidateCache removes entry", () => {
		const filePath = join(tempDir, "test.txt");
		writeFileSync(filePath, "hello world", "utf-8");

		countTokens(filePath, undefined, cachePath);
		expect(getCachedCount(filePath, cachePath)).toBe(2);

		invalidateCache(filePath, cachePath);
		expect(getCachedCount(filePath, cachePath)).toBeNull();
	});
});
