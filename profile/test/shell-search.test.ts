/**
 * Search goes through the shell on every tier: the profile turns pi's grep,
 * find and ls tools off, and the tiny tier's text, the only one that named
 * them, points at the shell whenever any of the three is off.
 */
import { describe, expect, it } from "vitest";
import { searchToolsEnabled } from "../../extensions/lib/models/model-tier.ts";
import type { LiveTools } from "../../extensions/sdk/profile.ts";
import { profile } from "../index.ts";

// The base hands the bash description `searchTools` by the same rule the prompt's passages follow.
const tinyText = (live: LiveTools) => {
	const text = profile.text({ live });
	return [...(text.systemPrompt?.lead({ tier: "tiny", taskTools: true, tools: undefined }) ?? []), text.shell?.bashDescription({ form: "long", autoMode: true, searchTools: searchToolsEnabled("tiny", live.has) }) ?? ""].join("\n\n");
};

describe("shell search", () => {
	it("turns pi's search tools off", () => {
		for (const tool of ["grep", "find", "ls"]) expect(profile.tools[tool]).toEqual({ enabled: false });
	});

	it("points the tiny tier at the search tools only while all three are in the session", () => {
		const on = tinyText({ has: () => true });
		expect(on).toContain("the grep, find and ls tools for finding files or text");
		expect(on).toContain("use the search tools yourself.");
		expect(on).toContain("Search with the dedicated tools instead of this shell");
	});

	it("points it at the shell when any of them is off, and names no search tool", () => {
		for (const off of ["grep", "find", "ls"]) {
			const text = tinyText({ has: (tool) => tool !== off });
			expect(text, off).toContain("Find files and text in the shell (grep, find, ls).");
			expect(text, off).toContain("search in the shell yourself (grep, find).");
			for (const gone of ["ls tools", "search tools", "dedicated tools instead of this shell", "the grep tool", "the find tool", "the ls tool"]) expect(text, `${off}: ${gone}`).not.toContain(gone);
		}
	});
});
