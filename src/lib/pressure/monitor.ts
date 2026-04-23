export enum PressureLevel {
	NORMAL = "normal",
	SOFT = "soft",
	HARD = "hard",
	EMERGENCY = "emergency",
}

const SOFT_THRESHOLD = 0.6;
const HARD_THRESHOLD = 0.75;
const EMERGENCY_THRESHOLD = 0.85;

export function computePressureLevel(ratio: number): PressureLevel {
	if (ratio >= EMERGENCY_THRESHOLD) return PressureLevel.EMERGENCY;
	if (ratio >= HARD_THRESHOLD) return PressureLevel.HARD;
	if (ratio >= SOFT_THRESHOLD) return PressureLevel.SOFT;
	return PressureLevel.NORMAL;
}

export class ContextPressure {
	current_usage: number = 0;
	current_level: PressureLevel = PressureLevel.NORMAL;
	history: Array<{ usage: number; ratio: number; level: string }> = [];

	constructor(public window_size: number) {}

	get usageRatio(): number {
		return this.current_usage / Math.max(this.window_size, 1);
	}

	updateUsage(tokenCount: number): PressureLevel {
		this.current_usage = tokenCount;
		this.current_level = computePressureLevel(this.usageRatio);
		this.history.push({
			usage: tokenCount,
			ratio: Math.round(this.usageRatio * 1000) / 1000,
			level: this.current_level,
		});
		if (this.history.length > 10) this.history = this.history.slice(-10);
		return this.current_level;
	}

	getDegradationActions(): string[] {
		switch (this.current_level) {
			case PressureLevel.NORMAL:
				return [];
			case PressureLevel.SOFT:
				return ["disable_l3_preload", "pause_kg_synthesis"];
			case PressureLevel.HARD:
				return [
					"disable_l3_preload",
					"pause_kg_synthesis",
					"downgrade_l1",
					"fold_nonactive_gateway_routes",
					"keep_last_5_decisions",
				];
			case PressureLevel.EMERGENCY:
				return [
					"disable_l3_preload",
					"pause_kg_synthesis",
					"downgrade_l1",
					"fold_nonactive_gateway_routes",
					"keep_last_5_decisions",
					"entry_proxy_only",
					"current_workflow_only",
					"project_rules_only",
					"references_to_breadcrumbs",
				];
		}
	}

	toDict(): Record<string, unknown> {
		return {
			window_size: this.window_size,
			current_usage: this.current_usage,
			usage_ratio: Math.round(this.usageRatio * 1000) / 1000,
			current_level: this.current_level,
			actions: this.getDegradationActions(),
			history: this.history,
		};
	}
}
