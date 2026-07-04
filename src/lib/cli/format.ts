import { green, red, yellow } from "./colors";

export function printError(
	message: string,
	impact?: string,
	fix?: string,
): void {
	console.error(`${red("[ERROR]")} ${message}`);
	if (impact) console.error(`        Impact: ${impact}`);
	if (fix) console.error(`        Fix:    ${fix}`);
}

export function printWarn(message: string): void {
	console.warn(`${yellow("[WARN]")} ${message}`);
}

export function printOk(message: string): void {
	console.log(`${green("[OK]")} ${message}`);
}

export function printInfo(message: string): void {
	console.log(`[INFO] ${message}`);
}

/**
 * Emit a value as the `--json` output (machine-readable). Single source for the
 * JSON formatting so the indent/envelope is consistent across every command.
 */
export function emitJson(value: unknown): void {
	console.log(JSON.stringify(value, null, 2));
}
