import { getEncoding, type Tiktoken } from "js-tiktoken";

let encoder: Tiktoken | null = null;

export function getEncoder(): Tiktoken {
	if (!encoder) {
		encoder = getEncoding("cl100k_base");
	}
	return encoder;
}

export function estimateTokens(text: string): number {
	try {
		const enc = getEncoder();
		return enc.encode(text).length;
	} catch {
		return Math.floor(text.length / 4);
	}
}

export function freeEncoder(): void {
	encoder = null;
}
