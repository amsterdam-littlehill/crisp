import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Standard ESM __dirname — works in both Bun and Node.js after bundling
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// When bundled to dist/cli.js: __dirname = .../dist, so go up one level to project root
// When running from source: __dirname = .../src/lib/fs, so go up 3 levels
// Detect which structure we're in at runtime by checking for a known template file
const distTemplates = resolve(__dirname, "..", "templates");
const srcTemplates = resolve(__dirname, "..", "..", "..", "templates");
export const TEMPLATES_DIR = existsSync(
	join(distTemplates, "hooks", "post-read.mjs"),
)
	? distTemplates
	: srcTemplates;
