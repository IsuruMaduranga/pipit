/**
 * The product's tool, mode and side-call words (profile/text: ask-user,
 * background, btw, compaction, context, effort, init, lsp, mcp, native-web,
 * notifications, permissions, plan-mode, recap, session-title, shell, skill,
 * tasks, tool-search, tool-style, web-fetch, web-search, and the auto-mode
 * setup call) name no other product and no other product's instruction file,
 * and the passages that name another tool follow the live tool set: with a
 * tool off they never name it, and every passage a table cuts is in the text.
 */
import { describe, expect, it } from "vitest";
import type { LiveTools } from "../../extensions/lib/profile/live-tools.ts";
import type { DescriptionForm } from "../../extensions/lib/profile/tool-variants.ts";
import { profile } from "../index.ts";
import { type EnglishPhrases, type NamedText, stalePassages, toolLeaks } from "../../test/unit/helpers/tool-mentions.ts";

const FORMS: DescriptionForm[] = ["short", "long"];

/** Phrases where a tool's name is an English word, not the tool. */
const ENGLISH: EnglishPhrases = {
	// The PowerShell description compares its syntax with bash's.
	bash: [/work as they do in bash/, /bash's `if \[ -f x \]`/],
};

/** Every text of these groups that can name another tool, with the tool whose own words it is. */
function toolTexts(live: LiveTools): NamedText[] {
	const t = profile.text({ live });
	const { askUser, planMode, shell, toolStyle, toolSearch, permissions, background, webFetch } = t as Required<typeof t>;
	const out: NamedText[] = [];
	const push = (label: string, owner: string | undefined, text: string, tool?: string) => out.push([label, owner, text, tool]);
	for (const form of FORMS) {
		push(`ask_user_question ${form}`, "ask-user", askUser.description(form), "ask_user_question");
		push(`enter_plan_mode ${form}`, "plan-mode", planMode.descriptions.enter_plan_mode(form), "enter_plan_mode");
		push(`write ${form}`, undefined, toolStyle.writeDescription(form));
		push(`web_fetch ${form}`, "web-fetch", webFetch.description(form), "web_fetch");
		for (const autoMode of [true, false]) {
			for (const searchTools of [true, false]) push(`bash ${form}`, "bash", shell.bashDescription({ form, autoMode, searchTools }), "bash");
		}
	}
	push("exit_plan_mode", "plan-mode", planMode.descriptions.exit_plan_mode, "exit_plan_mode");
	for (const planExists of [true, false]) push(`plan mode reminder${planExists ? " (file exists)" : ""}`, "plan-mode", planMode.reminder({ planFile: "/p.md", planExists }));
	push("tool_search", "tool-search", toolSearch.description);
	for (const [tool, hint] of Object.entries(toolSearch.listingHints ?? {})) push(`listing line ${tool}`, "tool-search", hint, tool);
	if (toolSearch.listingClose) push("listing close", "tool-search", toolSearch.listingClose, "tool_search");
	push("monitor", "background", background.monitor.description, "monitor");
	push("task_output", "background", background.tasks.outputDescription, "task_output");
	for (const firm of [true, false]) push(`auto-mode note${firm ? " firm" : ""}`, undefined, permissions.autoModeNote({ firm }));
	for (const edition of ["core", "desktop", "unknown"] as const) push(`powershell ${edition}`, "bash", shell.powershellDescription({ edition }), "powershell");
	return out;
}

/** Every string these groups can send, rendered for one live tool set. */
function allWords(live: LiveTools): string[] {
	const t = profile.text({ live });
	const g = t as Required<typeof t>;
	const words: string[] = toolTexts(live).map(([, , text]) => text);
	const strings = (value: unknown): void => {
		if (typeof value === "string") words.push(value);
		else if (value && typeof value === "object") for (const inner of Object.values(value)) strings(inner);
	};
	strings([g.askUser.params, g.askUser.promptSnippet, g.shell.bashParams, g.shell.powershellParams, g.shell.powershellPrimary]);
	strings([g.tasks, g.webSearch.params, g.webFetch.params, g.webFetch.reader.system, g.nativeWeb.fetch.system, g.nativeWeb.searchSystem]);
	strings([g.lsp, g.mcp, g.skill, g.effort, g.recap, g.sessionTitle.system, g.context.descriptors, g.toolSearch.params, g.toolSearch.promptSnippet]);
	strings([g.notifications, g.autoModeSetup.system, g.autoModeSetup.usageOptions, g.background.tasks, g.background.wakeup, g.background.monitor.description]);
	words.push(
		g.sessionTitle.user("s"),
		g.btw.question("q"),
		g.context.productPreamble({ above: "AGENTS.md" }),
		g.init.prompt("AGENTS.md"),
		g.compaction.instruction({ reason: "manual", customInstructions: "c", keptTail: { count: 2, landmark: { kind: "opens", text: "x" } } }),
		g.compaction.instruction({ reason: "overflow" }),
		g.compaction.continuation({ summary: "s", transcriptPath: "/t.jsonl" }),
		g.compaction.standaloneSystemPrompt,
		g.toolStyle.editDescription({ base: "" }),
		g.background.cron.createDescription({ maxAgeDays: 7 }),
		JSON.stringify(g.background.cron.createParams({ maxAgeDays: 7 })),
		g.background.cron.listDescription,
		g.background.cron.deleteDescription,
		JSON.stringify(g.background.monitor.params({ defaultTimeoutMs: 1, maxTimeoutMs: 2 })),
		...FORMS.map((form) => g.webSearch.description(form)),
	);
	const loop = g.background.loop;
	const file = { path: "/p/loop.md", content: "tasks" };
	for (const persistent of [true, false]) {
		words.push(loop.skillBody({ form: { kind: "prompt", input: "x" }, loopFile: null, persistent, maxAgeDays: 7 }));
		for (const selfPaced of [true, false]) {
			for (const loopFile of [null, file]) words.push(loop.skillBody({ form: { kind: "noPrompt", selfPaced, interval: "10m" }, loopFile, persistent, maxAgeDays: 7 }));
		}
		words.push(loop.withPreamble({ persistent, tick: "t" }));
	}
	for (const tick of ["autonomous", "autonomousDynamic", "loopFile", "loopFileDynamic", "loopFileAbsentDynamic"] as const) words.push(loop.tick(tick));
	words.push(loop.loopFileTick({ loopFile: { ...file, truncatedAt: 10 }, tick: "t" }), loop.foldNote({ streak: 2 }));
	return words;
}

describe("the product's tool, mode and side-call words", () => {
	it("name no other product and no other product's instruction file or folder", () => {
		for (const live of [{ has: () => true }, { has: () => false }] satisfies LiveTools[]) {
			for (const text of allWords(live)) {
				expect(text).not.toMatch(/claude|one ?code/i);
				expect(text).not.toMatch(/ONECODE\.md/);
			}
		}
	});

	it("leave out the tools of each optional feature that is off, and edit", () => {
		expect(toolLeaks(toolTexts, ENGLISH)).toEqual([]);
	});

	it("have every passage their tables cut or reword", () => {
		expect(stalePassages(toolTexts)).toEqual([]);
	});

	it("tell a session without monitor that a foreground sleep is blocked, without naming monitor", () => {
		const off = profile.text({ live: { has: (tool) => tool !== "monitor" } });
		const bash = off.shell!.bashDescription({ form: "short", autoMode: false, searchTools: false });
		expect(bash).toContain("A `sleep` in the foreground is blocked.");
		expect(bash).not.toMatch(/\bmonitor\b/);
		expect(off.background!.tasks.outputDescription).toContain("(background subagent or background bash)");
	});

	it("keep the plan-mode block the same for a given plan file and state", () => {
		const t = profile.text({ live: { has: () => true } });
		for (const planExists of [true, false]) expect(t.planMode!.reminder({ planFile: "/p.md", planExists })).toBe(t.planMode!.reminder({ planFile: "/p.md", planExists }));
	});

	it("ask the compaction model for line-anchored <analysis> and <summary> blocks", () => {
		const instruction = profile.text({ live: { has: () => true } }).compaction!.instruction({ reason: "threshold" });
		expect(instruction).toMatch(/^<analysis>$/m);
		expect(instruction).toMatch(/^<summary>$/m);
		expect(instruction).toMatch(/^<\/summary>$/m);
	});

	it("ask the session-title model for a JSON title", () => {
		expect(profile.text({ live: { has: () => true } }).sessionTitle!.system).toContain('{"title":');
	});
});
