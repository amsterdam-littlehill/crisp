const isTTY = typeof process !== "undefined" && process.stdout?.isTTY;
const noColor = typeof process !== "undefined" && process.env?.NO_COLOR;
const enabled = isTTY && !noColor;

function color(code: number, text: string): string {
	return enabled ? `\x1b[${code}m${text}\x1b[0m` : text;
}

export const red = (text: string) => color(31, text);
export const green = (text: string) => color(32, text);
export const yellow = (text: string) => color(33, text);
export const bold = (text: string) => color(1, text);
export const dim = (text: string) => color(2, text);
