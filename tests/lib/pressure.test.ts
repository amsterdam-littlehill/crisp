import { describe, expect, test } from "bun:test";
import {
	ContextPressure,
	computePressureLevel,
	PressureLevel,
} from "../../src/lib/pressure/monitor";

describe("computePressureLevel", () => {
	test("0.59 -> NORMAL", () => {
		expect(computePressureLevel(0.59)).toBe(PressureLevel.NORMAL);
	});

	test("0.60 -> SOFT", () => {
		expect(computePressureLevel(0.6)).toBe(PressureLevel.SOFT);
	});

	test("0.75 -> HARD", () => {
		expect(computePressureLevel(0.75)).toBe(PressureLevel.HARD);
	});

	test("0.85 -> EMERGENCY", () => {
		expect(computePressureLevel(0.85)).toBe(PressureLevel.EMERGENCY);
	});

	test("1.0 -> EMERGENCY", () => {
		expect(computePressureLevel(1.0)).toBe(PressureLevel.EMERGENCY);
	});

	test("0.0 -> NORMAL", () => {
		expect(computePressureLevel(0)).toBe(PressureLevel.NORMAL);
	});
});

describe("ContextPressure", () => {
	test("initial state is NORMAL", () => {
		const cp = new ContextPressure(10000);
		expect(cp.current_level).toBe(PressureLevel.NORMAL);
		expect(cp.history).toEqual([]);
	});

	test("updateUsage tracks history", () => {
		const cp = new ContextPressure(10000);
		cp.updateUsage(6000); // 60% = SOFT
		expect(cp.current_level).toBe(PressureLevel.SOFT);
		expect(cp.history.length).toBe(1);
		expect(cp.history[0].level).toBe(PressureLevel.SOFT);
	});

	test("getDegradationActions for NORMAL is empty", () => {
		const cp = new ContextPressure(10000);
		expect(cp.getDegradationActions()).toEqual([]);
	});

	test("getDegradationActions for SOFT has 2 actions", () => {
		const cp = new ContextPressure(10000);
		cp.updateUsage(6000);
		expect(cp.getDegradationActions().length).toBe(2);
	});

	test("getDegradationActions for HARD has 5 actions", () => {
		const cp = new ContextPressure(10000);
		cp.updateUsage(7500);
		expect(cp.getDegradationActions().length).toBe(5);
	});

	test("getDegradationActions for EMERGENCY has 9 actions", () => {
		const cp = new ContextPressure(10000);
		cp.updateUsage(8500);
		expect(cp.getDegradationActions().length).toBe(9);
	});

	test("history is capped at 10 entries", () => {
		const cp = new ContextPressure(10000);
		for (let i = 0; i < 15; i++) {
			cp.updateUsage(1000);
		}
		expect(cp.history.length).toBe(10);
	});

	test("toDict returns expected keys", () => {
		const cp = new ContextPressure(10000);
		cp.updateUsage(6000);
		const dict = cp.toDict();
		expect(dict.window_size).toBe(10000);
		expect(dict.current_usage).toBe(6000);
		expect(dict.current_level).toBe(PressureLevel.SOFT);
		expect(Array.isArray(dict.actions)).toBe(true);
		expect(Array.isArray(dict.history)).toBe(true);
	});
});
