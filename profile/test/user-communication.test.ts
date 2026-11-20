/**
 * Every question goes through ask_user_question, on every tier: the system
 * prompt's `# User communication` section says so while the tool is in the
 * session, and the whole section leaves with the tool. Its plan bullet names
 * exit_plan_mode and leaves with that tool.
 */
import { describe, expect, it } from "vitest";
import type { LiveTools, PromptTier } from "../../extensions/sdk/profile.ts";
import { profile } from "../index.ts";

const TIERS: PromptTier[] = ["frontier", "workhorse", "cheap", "tiny"];

const lead = (tier: PromptTier, live: LiveTools = { has: () => true }) =>
	(profile.text({ live }).systemPrompt?.lead({ tier, taskTools: true, tools: undefined }) ?? []).join("\n\n");

const without = (...off: string[]): LiveTools => ({ has: (tool) => !off.includes(tool) });

describe("the # User communication section", () => {
	it("sends every question through ask_user_question on every tier", () => {
		for (const tier of TIERS) {
			const text = lead(tier);
			expect(text, tier).toContain("# User communication\nPut every question to the user through the ask_user_question tool, never as text in your reply");
			expect(text, tier).toContain("the dialog adds a free-text row for anything else");
			expect(text, tier).toContain('Never offer one that puts the answer off, such as "I\'ll describe it"');
			expect(text, tier).toContain("ask again with the tool, not in text");
			expect(text, tier).toContain('When the user picks "Chat about this" instead of answering, the question moves into the conversation');
			expect(text, tier).toContain("exit_plan_mode puts it in front of the user for approval");
		}
	});

	it("comes after the writing rules in the long registers", () => {
		for (const tier of ["workhorse", "cheap", "tiny"] as const) {
			const text = lead(tier);
			expect(text.indexOf("# User communication"), tier).toBeGreaterThan(text.indexOf("# Writing to the user"));
		}
	});

	it("leaves with ask_user_question, plan bullet and all", () => {
		for (const tier of TIERS) {
			const text = lead(tier, without("ask_user_question"));
			expect(text, tier).not.toContain("# User communication");
			expect(text, tier).not.toContain("ask_user_question");
			expect(text, tier).not.toContain("A plan is the one exception");
		}
	});

	it("drops only the plan bullet without exit_plan_mode", () => {
		for (const tier of TIERS) {
			const text = lead(tier, without("exit_plan_mode"));
			expect(text, tier).toContain("# User communication");
			expect(text, tier).not.toContain("exit_plan_mode");
			expect(text, tier).toContain('not as a closing "Shall I add tests?".');
		}
	});
});
