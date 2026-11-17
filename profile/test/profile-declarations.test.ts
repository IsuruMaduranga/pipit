/**
 * What the profile declares for the base to apply: its own settings, a
 * thinking level per model tier and an OpenRouter quantization floor per
 * vendor. The base refuses a malformed declaration at load; these tests ask
 * its checks directly and pin what the product chose.
 */
import { describe, expect, it } from "vitest";
import { openRouterRoutingProblems } from "../../extensions/lib/profile/openrouter-routing.ts";
import { productSettingProblems } from "../../extensions/lib/profile/settings-keys.ts";
import { thinkingDefaultProblems } from "../../extensions/lib/profile/thinking-defaults.ts";
import { profile } from "../index.ts";

describe("the profile's declarations", () => {
	it("declares the two notices' switches as project-wide booleans the base accepts", () => {
		const switchFor = { type: "boolean", project: true, description: expect.any(String) };
		expect(profile.settings).toEqual({ tierNotice: switchFor, reasoningNotice: switchFor });
		expect(productSettingProblems(profile.settings ?? {})).toEqual([]);
	});

	it("starts a model of every tier at low", () => {
		expect(profile.defaultThinkingLevels).toEqual({ frontier: "low", workhorse: "low", cheap: "low", tiny: "low" });
		expect(thinkingDefaultProblems(profile.defaultThinkingLevels ?? {})).toEqual([]);
	});

	it("keeps DeepSeek and Qwen models on OpenRouter hosts at 8-bit precision or better, and leaves z-ai and minimax unset", () => {
		const floor = ["fp8", "bf16", "fp16", "fp32", "unknown"];
		expect(profile.openRouterRouting).toEqual({ deepseek: { quantizations: floor }, qwen: { quantizations: floor } });
		expect(openRouterRoutingProblems(profile.openRouterRouting ?? {})).toEqual([]);
	});
});
