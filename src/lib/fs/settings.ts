import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export function loadSettings(settingsPath: string): Record<string, unknown> {
	if (existsSync(settingsPath)) {
		try {
			return JSON.parse(readFileSync(settingsPath, "utf-8"));
		} catch {
			return {};
		}
	}
	mkdirSync(dirname(settingsPath), { recursive: true });
	return {};
}

export function saveSettings(
	settingsPath: string,
	settings: Record<string, unknown>,
): void {
	writeFileSync(
		settingsPath,
		`${JSON.stringify(settings, null, 2)}\n`,
		"utf-8",
	);
}
