import {
	existsSync,
	mkdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { getEncoding, type Tiktoken } from "js-tiktoken";

export const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || process.cwd();
export const DEFAULT_CACHE_PATH = join(
	PROJECT_DIR,
	".crp",
	"cache",
	"token-counts.json",
);

export interface CacheEntry {
	tokens: number;
	mtime: number;
}

// Module-level cache state is a singleton — not safe for concurrent use in server contexts.
// Call freeEncoder() to release the cached encoder when done.
let encoder: Tiktoken | null = null;
let memoryCache: Map<string, CacheEntry> | null = null;
let loadedCachePath: string | null = null;

function getEncoder(): Tiktoken {
	if (!encoder) {
		encoder = getEncoding("cl100k_base");
	}
	return encoder;
}

export function clearMemoryCache(): void {
	memoryCache = null;
	loadedCachePath = null;
}

export function loadCache(
	cachePath: string = DEFAULT_CACHE_PATH,
): Map<string, CacheEntry> {
	if (memoryCache && loadedCachePath === cachePath) return memoryCache;

	if (existsSync(cachePath)) {
		try {
			const raw = readFileSync(cachePath, "utf-8");
			const parsed = JSON.parse(raw) as Record<string, CacheEntry>;
			memoryCache = new Map(Object.entries(parsed));
			loadedCachePath = cachePath;
			return memoryCache;
		} catch {
			// corrupted cache, start fresh
		}
	}

	memoryCache = new Map();
	loadedCachePath = cachePath;
	return memoryCache;
}

export function saveCache(cachePath: string = DEFAULT_CACHE_PATH): void {
	if (!memoryCache || loadedCachePath !== cachePath) return;

	try {
		mkdirSync(dirname(cachePath), { recursive: true });
		const obj = Object.fromEntries(memoryCache);
		writeFileSync(cachePath, `${JSON.stringify(obj, null, 2)}\n`, "utf-8");
	} catch {
		// ignore write failures
	}
}

export function getCachedCount(
	filePath: string,
	cachePath: string = DEFAULT_CACHE_PATH,
): number | null {
	const cache = loadCache(cachePath);
	const entry = cache.get(filePath);
	if (!entry) return null;

	try {
		const stats = statSync(filePath);
		if (stats.mtimeMs === entry.mtime) {
			return entry.tokens;
		}
	} catch {
		// file missing or unreadable
	}

	return null;
}

export function countTokens(
	filePath: string,
	_model?: string,
	cachePath: string = DEFAULT_CACHE_PATH,
): number {
	const cached = getCachedCount(filePath, cachePath);
	if (cached !== null) return cached;

	let tokens: number;
	try {
		const text = readFileSync(filePath, "utf-8");
		const enc = getEncoder();
		tokens = enc.encode(text).length;
	} catch {
		return 0;
	}

	try {
		const stats = statSync(filePath);
		const cache = loadCache(cachePath);
		cache.set(filePath, { tokens, mtime: stats.mtimeMs });
	} catch {
		// ignore cache update failure
	}

	return tokens;
}

export function freeEncoder(): void {
	encoder = null;
	memoryCache = null;
	loadedCachePath = null;
}

export function invalidateCache(
	filePath: string,
	cachePath: string = DEFAULT_CACHE_PATH,
): void {
	const cache = loadCache(cachePath);
	cache.delete(filePath);
}
