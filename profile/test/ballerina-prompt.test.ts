/**
 * The Ballerina knowledge layer: the `# Ballerina` system-prompt section
 * (profile/extensions/ballerina/prompt.ts and its templates under prompt/),
 * the `librarian` agent and the Ballerina skills. The section is a pure
 * function of the tools the session can have, the same text on every tier,
 * and none of the text names a tool the product does not have (the earlier
 * BI harness's and the VS Code Copilot's tools are gone; library lookup is
 * the shell) or a tool the session lacks.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseFrontmatter } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import type { PromptTier } from "../../extensions/lib/models/model-tier.ts";
import { parseFrontmatterLoosely } from "../../extensions/lib/core/frontmatter.ts";
import type { LiveTools } from "../../extensions/sdk/profile.ts";
import { TOOL_FEATURES } from "../../extensions/lib/profile/features.ts";
import { deferralChanges, type EnglishPhrases, mentions, type NamedText, toolLeaks } from "../../test/unit/helpers/tool-mentions.ts";
import { ballerinaSection, SECTION_TOOLS, SECTION_VALUES, TEMPLATES, valuesFor } from "../extensions/ballerina/prompt.ts";
import { CONFIG_STATUS_TOOL, CREATE_INTEGRATION_TOOL } from "../extensions/ballerina/session.ts";
import { blockTools } from "./block-tools.ts";

const PROFILE = join(import.meta.dirname, "..");
const TIERS: PromptTier[] = ["frontier", "workhorse", "cheap", "tiny"];
const SKILLS = ["data-map", "agent-builder", "workflow-builder", "skill-creator", "connector"];
const AGENTS = ["librarian"];
const BUNDLED_AGENTS = ["explore", "general-purpose", "plan", "librarian"];

const ALL: LiveTools = { has: () => true };
/** A session that can have every tool but these. */
const without = (...off: string[]): LiveTools => ({ has: (tool) => !off.includes(tool) });
/** The section is the same on every tier (the first test checks it), so the helper renders for one. */
const render = (live: LiveTools = ALL) => ballerinaSection({ tier: "frontier", taskTools: true, tools: undefined, live });

/** Phrases where a tool's name is an English word, a skill or a Ballerina name, not the tool. */
const ENGLISH: EnglishPhrases = {
	// Ballerina's agent type.
	Agent: [/`ai:Agent`/],
	// A skill, not the tool that loads one.
	skill: [/a loaded skill/, /a skill shows/],
	// Ballerina's workflow module and the construct it builds.
	workflow: [/ballerina\/workflow/, /Durable workflow/, /A workflow goes in/],
	edit: [/\b(each|every|first) edit\b/, /\b[Nn]ever edit\b/, /\bedit it visually/],
};

/** The section, for the tool-set checks. */
const sectionTexts = (live: LiveTools): NamedText[] => [["section", undefined, render(live) ?? ""]];

/** Tools of the earlier BI harness and of the VS Code Copilot that this product does not have. */
const REMOVED_TOOLS = [
	"ballerina_reference",
	"ballerina_scaffold",
	"library_search",
	"library_docs",
	"config_variables",
	"ballerina_diagnostics",
	"ballerina-expert",
	"config_collector",
	"connector_generator",
	"invoke_skill",
	"file_read",
	"file_write",
	"file_edit",
	"file_batch_edit",
	"task_write",
	"kill_task",
	"docs_grep",
	"docs_read",
];

/** Base tools the product leaves out. Some are English words, so only a reference to the tool counts. */
const ABSENT_TOOLS = ["notebook_edit", "artifact", "workflow", "enter_worktree", "cron_create", "monitor", "schedule_wakeup"];

// Case-sensitive: tool names are lowercase, and `<name>Workflow(` is a Ballerina function.
const toolReference = (name: string) => new RegExp(`\`${name}\`|\\b${name} tool\\b|\\b${name}\\(`);

function expectNoForeignTools(label: string, text: string) {
	for (const name of REMOVED_TOOLS) expect(text.includes(name), `${label} names ${name}`).toBe(false);
	for (const name of ABSENT_TOOLS) expect(toolReference(name).test(text), `${label} names the ${name} tool`).toBe(false);
}

const EM_DASH = String.fromCharCode(0x2014);

const headings = (text: string) => text.split("\n").filter((line) => line.startsWith("## "));

describe("the # Ballerina section", () => {
	it("renders the same bytes twice, on every tier, whatever the active tools are", () => {
		const first = render();
		expect(first).toBeDefined();
		const noFiles = without("write", "edit");
		for (const tier of TIERS) {
			expect(ballerinaSection({ tier, taskTools: true, tools: undefined, live: ALL })).toBe(first);
			// The active tools never matter: only the tools the session can have do.
			expect(ballerinaSection({ tier, taskTools: true, tools: ["read", "bash", "edit", "write", "Agent", "config_status"], live: ALL })).toBe(first);
			expect(ballerinaSection({ tier, taskTools: false, tools: ["read"], live: ALL })).toBe(first);
			expect(ballerinaSection({ tier, taskTools: true, tools: undefined, live: noFiles })).toBe(render(noFiles));
		}
	});

	it("stays the same when a deferred tool loads", () => {
		expect(deferralChanges((session) => ballerinaSection(session))).toEqual([]);
	});

	it("names no tool the session cannot have", () => {
		expect(toolLeaks(sectionTexts, ENGLISH)).toEqual([]);
	});

	it("names in its blocks only tools the product can have, never SendMessage", () => {
		const product = new Set(["read", "bash", "edit", "write", ...Object.keys(TOOL_FEATURES), CONFIG_STATUS_TOOL, CREATE_INTEGRATION_TOOL]);
		const named = new Set(TEMPLATES.flatMap((template) => [...blockTools(template)]));
		for (const tool of SECTION_TOOLS) expect(product.has(tool), tool).toBe(true);
		// Every declared tool has a passage, so the list stays the set the text follows.
		expect([...named].sort()).toEqual([...SECTION_TOOLS].sort());
		expect(SECTION_TOOLS.has("SendMessage")).toBe(false);
	});

	it("computes each value from the tools the session can have, never naming one it lacks", () => {
		expect(valuesFor(ALL)).toEqual({ fileTools: "`write` and `edit`", anyFileTool: "`write` or `edit`" });
		expect(valuesFor(without("edit"))).toEqual({ fileTools: "`write`", anyFileTool: "`write`" });
		expect(valuesFor(without("write"))).toEqual({ fileTools: "`edit`", anyFileTool: "`edit`" });
		expect(valuesFor(without("write", "edit"))).toEqual({ fileTools: "", anyFileTool: "" });
		expect([...SECTION_VALUES].sort()).toEqual(["anyFileTool", "fileTools"]);
	});

	it("reads cleanly with any one tool off, and with the file tools and diagnostics off together", () => {
		const cases = [[], ...[...SECTION_TOOLS].map((tool) => [tool]), ["write", "edit"], ["write", "edit", "lsp_diagnostics"], ["write", "edit", "skill"], ["task_output", "task_stop"], [...SECTION_TOOLS]];
		for (const off of cases) {
			const text = render(without(...off)) ?? "";
			const label = `off: ${off.join(", ") || "nothing"}`;
			expect(text.includes("\n\n\n"), `${label}: a doubled blank line`).toBe(false);
			expect(/^\s*-\s*$/m.test(text), `${label}: an empty bullet`).toBe(false);
			expect(/ \n|\n$|^\s/.test(text), `${label}: stray whitespace`).toBe(false);
			expect(text.includes("{{"), `${label}: a template tag left in`).toBe(false);
		}
	});

	it("changes source files only through the file tools, naming only the file tools the session has", () => {
		const text = render() ?? "";
		for (const part of ["Create and change `.bal` files", "only with `write` and `edit`, never", "through the shell"]) expect(text).toContain(part);
		expect(text).toContain("A change made through the shell gets no compiler check");
		expect(text).toContain("- Only a change made with `write` or `edit` is checked.");
		// The rule sits before the first edit is described, near the top.
		expect(text.indexOf("Create and change `.bal` files only with")).toBeLessThan(text.indexOf("## Terminology"));
		expect(render(without("edit"))).toContain("only with `write`, never");
		expect(render(without("edit"))).toContain("Only a change made with `write` is checked");
		expect(render(without("write"))).toContain("only with `edit`, never");
		const noFiles = render(without("write", "edit")) ?? "";
		expect(toolReference("edit").test(noFiles), "the section names edit without it").toBe(false);
		expect(toolReference("write").test(noFiles), "the section names write without it").toBe(false);
		expect(noFiles).not.toContain("Create and change `.bal` files only with");
	});

	it("promises a check after each edit only with a file tool and the language-server diagnostics", () => {
		const promises = ["the compiler errors that arrive after each edit", "The compiler checks every edit", "write the code and let the compiler check it", "no block means no new errors", "A change made through the shell gets no compiler check"];
		const buildInstead = ["Run `bal build` after a change to get the compiler's errors", "write the code and check it with `bal build`"];
		const all = render() ?? "";
		for (const text of promises) expect(all, text).toContain(text);
		// File tools on, no lsp_diagnostics: the base's lsp feature may still add the block, so the text neither promises nor denies it.
		const unknown = render(without("lsp_diagnostics")) ?? "";
		// The rule's reason is cut, so the exception follows its list of commands directly.
		for (const part of ["only with `write` and `edit`, never", "script that writes them. Commands that generate"]) expect(unknown).toContain(part);
		for (const text of promises) expect(unknown, `without diagnostics: ${text}`).not.toContain(text);
		for (const text of [...buildInstead, "Check each change to a `.bal` file with `bal build`", "When the result of a change carries a `<new-diagnostics>` block"]) expect(unknown, `without diagnostics: ${text}`).toContain(text);
		expect(unknown).not.toContain("no check arrives on its own");
		// No file tools: no change is checked on its own, whether or not diagnostics are live.
		for (const off of [["write", "edit"], ["write", "edit", "lsp_diagnostics"]]) {
			const noFiles = render(without(...off)) ?? "";
			for (const text of [...promises, "<new-diagnostics>"]) expect(noFiles, `without ${off}: ${text}`).not.toContain(text);
			for (const text of [...buildInstead, "no check arrives on its own"]) expect(noFiles, `without ${off}: ${text}`).toContain(text);
		}
	});

	it("names neither product tool when the session cannot have it, and says what to do instead", () => {
		for (const tool of ["create_integration", "config_status"]) {
			expect(mentions(render(without(tool)) ?? "", tool, {}), `without ${tool}`).toEqual([]);
			expect(mentions(render() ?? "", tool, {}), tool).not.toEqual([]);
		}
		const noCreate = render(without("create_integration")) ?? "";
		for (const part of ["write the layout above by hand, exactly as shown", "Never use `bal new` for a BI project", "Leave `Config.toml` to the user"]) expect(noCreate).toContain(part);
		expect(noCreate).not.toContain("Do not write the layout by hand either");
		const noStatus = render(without("config_status")) ?? "";
		for (const part of ["read the `configurable` declarations in the source", "only the user can tell you", "Never ask the user for a secret value in the chat"]) expect(noStatus).toContain(part);
	});

	it("tells the model not to load a skill again while its text is in the conversation, only when the skill tool is on", () => {
		const sentence = "Do not load a skill again while its text is still in the conversation; after the conversation has been summarized, load it again before you rely on it.";
		expect(render(SECTION_TOOLS) ?? "").toContain(sentence);
		expect(render(without("skill")) ?? "").not.toContain(sentence);
	});

	it("tells the model to load no skill when the skill tool is off", () => {
		expect(render(without("skill")) ?? "").not.toMatch(/load (it with )?the `|skill explains/);
	});

	it("starts with its one top-level heading", () => {
		const text = render() ?? "";
		expect(text.startsWith("# Ballerina\n")).toBe(true);
		expect(text.split("\n").filter((line) => /^# /.test(line))).toEqual(["# Ballerina"]);
	});

	it("carries the full domain knowledge and the syntax skeletons, in order", () => {
		const text = render() ?? "";
		expect(headings(text)).toEqual([
			"## How to think and work",
			"## Terminology",
			"## Project layout",
			"## Creating a project or an integration",
			"## Keeping code editable in the BI designer",
			"## Scope and questions",
			"## When to look a library up",
			"## Using bal discover",
			"## Imports and dependencies",
			"## Code structure",
			"## Coding rules",
			"## Data binding, type casts and narrowing",
			"## Module-level initialization",
			"## Concurrency safety and shared state",
			"## Errors and logging",
			"## HTTP",
			"## SQL",
			"## Event-driven services",
			"## Built-in language libraries",
			"## Configuration",
			"## Editing files and diagnostics",
			"## Building, running and testing",
			"## Common errors",
			"## Syntax skeletons",
		]);
	});

	it("settles a library fact with a tool: write first when sure, look it up first when not", () => {
		const text = render() ?? "";
		expect(text).toContain("So do not settle these details by reasoning about them: get them from a tool.");
		expect(text).toContain("Write first when you remember the fact clearly and the compiler can check it");
		expect(text).toContain("Look it up first when you are not sure of your memory");
		// One rule for a rejected library symbol, wherever it is stated.
		expect(text).toContain("When the compiler rejects a library symbol and the error shows the fix, apply it; when it does not, look the symbol up. Never try a second guessed name.");
		expect(text).toContain("When the error shows the fix, apply it; when it does not, look the symbol up, and never try a second guessed name.");
		expect(text).toContain("When the name is a library's and the error does not show the right one, look it up (see When to look a library up); never try a second guessed name.");
		expect(text).not.toContain("one short error and one fix");
		expect(text).toContain("A shape that this section or a loaded skill shows was checked on the installed distribution: it is not a memory to doubt, so write it as shown, without looking it up.");
		// What the model already has comes before the reasons to look something up.
		expect(text.indexOf("What you already have needs no lookup")).toBeLessThan(text.indexOf("- Write first when"));
		expect(text.indexOf("Take the cheaper one each time.")).toBeLessThan(text.indexOf("What you already have needs no lookup"));
		expect(text.indexOf("- Look it up first when")).toBeLessThan(text.indexOf("When the user asks you to check, inspect or verify"));
		// Planning has a limit: a Ballerina question goes to a tool, not to more thought.
		expect(text).toContain("- Plan in a few sentences, then make your first tool call or write your first file.");
		expect(text).toContain("do not think it through: answer it with a tool call");
		// The string methods models invent, next to the ones that exist.
		expect(text).toContain("A string has no `toLowerCase`, `toUpperCase` or `split` method");
		expect(text).toContain("``re `,`.split(\"a,b\")``");
		expect(text).toContain("The user's request comes before the rules in this part, and it is answered with the lookups the task needs, under the same cost rule as any other lookup");
		expect(text).toContain("Never answer it by reading every readme section, listing every symbol, or reading folders on disk.");
		expect(text).toContain("Never web-search for a first-party Ballerina API fact");
	});

	it("builds to check its own changes, and runs the program or its tests only when the user asks", () => {
		const text = render() ?? "";
		expect(text).toContain("Use the shell. Run `bal build` whenever you need to check your own changes. Run the program or its tests only when the user asks.");
		expect(text).not.toContain("Existing tests are the exception to waiting for the user");
	});

	it("keeps each lookup small: one question, text output, nested types read once, the readme only for a reason", () => {
		const text = render() ?? "";
		expect(text).toContain("one question per lookup, one command per question");
		expect(text).toContain("Always add `--output-format text`");
		expect(text).toContain("Read the nested types there; do not open them again");
		expect(text).toContain("only for a package you do not know at all");
		expect(text).toContain("Stop as soon as you can write the code");
		expect(text).toContain("Never read a readme to get your bearings");
	});

	it("sends learning a library to the librarian by a count of lookups", () => {
		const text = render() ?? "";
		expect(text).toContain("when one or two commands answer the question");
		expect(text).toContain("likely to take three or more lookups");
		expect(text).toContain("its report costs your context far less than the raw answers would");
		expect(text).toContain("Write one brief per independent external system and start them in the same message");
		expect(text).toContain("No more than three librarians run at a time");
		expect(text).toContain("With more than three briefs, start three, and start each of the others when an earlier librarian reports.");
		expect(text).toContain("tell the user in one short sentence what you are looking up");
		expect(text).toContain("so do not look them up again");
		expect(text).toContain("What it lists as not confirmed, or does not cover, look up before you write code that depends on it");
		expect(text).toContain("goes to the same librarian, not a new one");
		expect(text).toContain("What you already have needs no lookup and no librarian.");
		expect(render(without("Agent"))).toContain("What you already have needs no lookup. A shape");
		expect(text).toContain("`bal discover client <Client> -p <org>/<name> --output-format text`");
	});

	it("shows a reserved word quoted as an identifier, an enum and a range in the skeletons", () => {
		const text = render() ?? "";
		for (const shape of ["foreach Order 'order in orders", "enum OrderStatus {", "foreach int attempt in 1 ... 3 {"]) expect(text, shape).toContain(shape);
	});

	it("keys the route on Agent only, and never names the deferred SendMessage", () => {
		expect(render()).toContain("`Agent` tool");
		expect(toolReference("SendMessage").test(render() ?? ""), "names SendMessage").toBe(false);
		// pi's --exclude-tools Agent takes it out alone, and the route with it.
		const noAgent = render(without("Agent")) ?? "";
		expect(toolReference("Agent").test(noAgent), "names Agent without it").toBe(false);
		expect(/librarian/i.test(noAgent), "mentions the librarian without Agent").toBe(false);
	});

	it("routes configuration through config_status and library lookup through the shell", () => {
		const text = render() ?? "";
		expect(text).toContain("`config_status`");
		expect(text).toContain("bal discover");
		expect(text).toContain("bal search");
		expect(text).toContain("`librarian`");
		expect(text).toContain("Never ask the user for a secret value in the chat");
	});

	it("names no removed tool and no tool the product lacks, and uses no em dash", () => {
		const text = render() ?? "";
		expectNoForeignTools("the section", text);
		expect(text.includes(EM_DASH), "the section has an em dash").toBe(false);
	});
});

function frontmatterOf(source: string): { frontmatter: Record<string, unknown>; body: string } {
	// Strict YAML: the loose fallback would hide a description that does not parse.
	const parsed = parseFrontmatter(source) as { frontmatter?: Record<string, unknown>; body: string };
	return { frontmatter: parsed.frontmatter ?? {}, body: parsed.body };
}

/**
 * Every `bal discover` command written out in a text, for the text-output
 * rule: in single backticks, and on a line of a fenced code block.
 */
function discoverCommands(text: string): string[] {
	const inline = [...text.matchAll(/(?<!`)`(bal discover [^`]+)`/g)].map((match) => match[1]);
	const fenced: string[] = [];
	let inFence = false;
	for (const line of text.split("\n")) {
		if (/^\s*```/.test(line)) inFence = !inFence;
		else if (inFence) for (const match of line.matchAll(/\bbal discover [^;|&#]+/g)) fenced.push(match[0].trim());
	}
	return [...inline, ...fenced];
}

/** Every SKILL.md under profile/skills/ and every file under profile/agents/, found by listing the folders. */
function bundledTexts(): Array<[string, string]> {
	const skills = readdirSync(join(PROFILE, "skills"), { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry): [string, string] => [entry.name, readFileSync(join(PROFILE, "skills", entry.name, "SKILL.md"), "utf8")]);
	const agents = readdirSync(join(PROFILE, "agents")).map((file): [string, string] => [file, readFileSync(join(PROFILE, "agents", file), "utf8")]);
	return [...skills, ...agents];
}

describe("bal discover commands in the text", () => {
	it("ask for text output everywhere a command is written out", () => {
		const texts: Array<[string, string]> = [
			["the section", render() ?? ""],
			...bundledTexts(),
		];
		let seen = 0;
		for (const [label, text] of texts) {
			for (const command of discoverCommands(text)) {
				seen++;
				expect(command, `${label}: ${command}`).toContain("--output-format text");
			}
		}
		expect(seen).toBeGreaterThan(20);
	});

	it("finds a command in a fenced block", () => {
		expect(discoverCommands("```bash\nbal discover type A -p o/n\n```")).toEqual(["bal discover type A -p o/n"]);
	});
});

describe("the Ballerina skills", () => {
	it("tell the reader to write the library shapes they show as written, and to check with bal discover when the user asks", () => {
		const flat = (skill: string) => readFileSync(join(PROFILE, "skills", skill, "SKILL.md"), "utf8").replace(/\s+/g, " ");
		expect(flat("agent-builder")).toContain("were checked on the installed distribution, so write them as shown");
		expect(flat("workflow-builder")).toContain("write the shapes as shown: they compile on it");
		for (const skill of ["agent-builder", "workflow-builder"]) {
			expect(flat(skill), skill).toMatch(/When the user asks you to check what .+ supports, (do|check) it with `bal discover` before you write, even for a shape shown here/);
			expect(flat(skill), skill).not.toContain("do not look them up");
		}
	});

	for (const skill of SKILLS) {
		it(`${skill} has valid frontmatter naming its folder, and names no foreign tool`, () => {
			const source = readFileSync(join(PROFILE, "skills", skill, "SKILL.md"), "utf8");
			const { frontmatter, body } = frontmatterOf(source);
			expect(frontmatter.name).toBe(skill);
			expect(typeof frontmatter.description).toBe("string");
			expect(String(frontmatter.description).length).toBeGreaterThan(40);
			expect(body.trim().length).toBeGreaterThan(0);
			expectNoForeignTools(skill, source);
			expect(source.includes(EM_DASH), `${skill} has an em dash`).toBe(false);
		});
	}
});

describe("the librarian agent", () => {
	it("is described as the way to learn a library, and reports enough to write from", () => {
		const { frontmatter, body } = frontmatterOf(readFileSync(join(PROFILE, "agents", "librarian.md"), "utf8"));
		expect(String(frontmatter.description)).toMatch(/^The way to learn a Ballerina library or connector/);
		expect(String(frontmatter.description)).toContain("Not for one named symbol");
		const flat = body.replace(/\s+/g, " ");
		expect(flat).toContain("under about 4,000 characters for each external system");
		expect(flat).toContain("Stop also after 8 commands that read a chosen library's API");
		expect(flat).toContain("The searches and overviews you run to find and choose the library do not count toward the 8");
		expect(flat).toContain("never as `resource function`");
		for (const part of ["**Imports**", "**Creating it**", "**Services**", "**Calls**", "**Types**", "**Defaults that change behavior**", "**Not confirmed**"]) expect(body).toContain(part);
	});

	it("every bundled agent declares model: inherit", () => {
		// `inherit` runs the agent on the session model (since the base at fb0c1c3a).
		// Loose parsing: explore's description holds a colon followed by a space.
		for (const agent of BUNDLED_AGENTS) {
			const { frontmatter } = parseFrontmatterLoosely(readFileSync(join(PROFILE, "agents", `${agent}.md`), "utf8"));
			expect(frontmatter.model, agent).toBe("inherit");
		}
	});

	for (const agent of AGENTS) {
		it(`${agent} has valid frontmatter naming its file and a shell-and-read tool set`, () => {
			const source = readFileSync(join(PROFILE, "agents", `${agent}.md`), "utf8");
			const { frontmatter, body } = frontmatterOf(source);
			expect(frontmatter.name).toBe(agent);
			expect(typeof frontmatter.description).toBe("string");
			expect(String(frontmatter.tools).split(/,\s*/)).toEqual(["bash", "read"]);
			expect(body).toContain("bal discover");
			expectNoForeignTools(agent, source);
			// A colon followed by a space in a description drops the agent from the listing.
			expect(String(frontmatter.description)).not.toContain(": ");
		});
	}
});
