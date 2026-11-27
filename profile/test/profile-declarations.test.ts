/**
 * What the profile declares for the base to apply: its own settings, a
 * thinking level per model tier, no OpenRouter routing, and the
 * background tools it leaves out. The base refuses a malformed declaration at load; these tests ask
 * its checks directly and pin what the product chose.
 */
import { describe, expect, it } from "vitest";
import { productSettingProblems } from "../../extensions/lib/profile/settings-keys.ts";
import { thinkingDefaultProblems } from "../../extensions/lib/profile/thinking-defaults.ts";
import { profile } from "../index.ts";

describe("the profile's declarations", () => {
	it("declares the two notices' switches as project-wide booleans the base accepts", () => {
		const switchFor = { type: "boolean", project: true, description: expect.any(String) };
		expect(profile.settings).toEqual({ tierNotice: switchFor, reasoningNotice: switchFor });
		expect(productSettingProblems(profile.settings ?? {})).toEqual([]);
	});

	it("turns task_output off: a background task's result arrives as its notification", () => {
		expect(profile.tools.task_output).toEqual({ enabled: false });
		expect(profile.tools.yield).toBeUndefined();
	});

	it("starts a model of every tier at low", () => {
		expect(profile.defaultThinkingLevels).toEqual({ frontier: "low", workhorse: "low", cheap: "low", tiny: "low" });
		expect(thinkingDefaultProblems(profile.defaultThinkingLevels ?? {})).toEqual([]);
	});

	it("leaves the choice of OpenRouter hosts to the user", () => {
		expect(profile.openRouterRouting).toBeUndefined();
	});
});
