import { homedir } from "node:os";
import { join } from "node:path";

export type SkillSource = "project" | "user";

export interface SkillDir {
	source: SkillSource;
	path: string;
	label: string;
}

export function getSkillSourceDirs(): SkillDir[] {
	const home = homedir();
	return [
		{
			source: "project",
			path: join(process.cwd(), ".claude", "skills"),
			label: "project",
		},
		{
			source: "user",
			path: join(home, ".claude", "skills"),
			label: "user (~/.claude)",
		},
		{
			source: "user",
			path: join(home, ".omc", "skills"),
			label: "user (~/.omc)",
		},
	];
}
