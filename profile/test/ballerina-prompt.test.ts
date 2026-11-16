/**
 * The Ballerina knowledge layer: the `# Ballerina` system-prompt section
 * (profile/extensions/ballerina/prompt.ts), the `librarian` agent and the
 * Ballerina skills. The section is a pure function of the tier and the tools
 * the session can have, carries the full domain knowledge on every tier, and
 * none of the text names a tool the product does not have (the earlier BI
 * harness's and the VS Code Copilot's tools are gone; library lookup is the
 * shell) or a tool the session lacks.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseFrontmatter } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import type { PromptTier } from "../../extensions/lib/models/model-tier.ts";
import { parseFrontmatterLoosely } from "../../extensions/lib/core/frontmatter.ts";
import type { LiveTools } from "../../extensions/sdk/profile.ts";
import { deferralChanges, type EnglishPhrases, mentions, type NamedText, stalePassages, toolLeaks } from "../../test/unit/helpers/tool-mentions.ts";
import { ballerinaSection } from "../extensions/ballerina/prompt.ts";

const PROFILE = join(import.meta.dirname, "..");
const TIERS: PromptTier[] = ["frontier", "workhorse", "cheap", "tiny"];
const SKILLS = ["data-map", "agent-builder", "workflow-builder", "skill-creator", "connector"];
const AGENTS = ["librarian"];
const BUNDLED_AGENTS = ["explore", "general-purpose", "plan", "librarian"];

const ALL: LiveTools = { has: () => true };
/** A session that can have every tool but these. */
const without = (...off: string[]): LiveTools => ({ has: (tool) => !off.includes(tool) });
const render = (tier: PromptTier, live: LiveTools = ALL, tools?: readonly string[]) => ballerinaSection({ tier, taskTools: true, tools, live });

/** Phrases where a tool's name is an English word, a skill or a Ballerina name, not the tool. */
const ENGLISH: EnglishPhrases = {
	// Ballerina's agent type.
	Agent: [/`ai:Agent`/],
	// A skill, not the tool that loads one.
	skill: [/a loaded skill/],
	// Ballerina's workflow module and the construct it builds.
	workflow: [/ballerina\/workflow/, /Durable workflow/, /A workflow goes in/],
	edit: [/\b(each|every|first) edit\b/, /\b[Nn]ever edit\b/, /cannot edit it/],
};

/** The section on every tier, for the tool-set checks. */
const sectionTexts = (live: LiveTools): NamedText[] => TIERS.map((tier) => [`${tier} section`, undefined, render(tier, live) ?? ""]);

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
	it("renders the same bytes twice for every tier, whatever the active tools are", () => {
		for (const tier of TIERS) {
			const first = render(tier);
			expect(first).toBeDefined();
			expect(render(tier)).toBe(first);
			// The active tools never matter: only the tools the session can have do.
			expect(render(tier, ALL, ["read", "bash", "edit", "write", "Agent", "config_status"])).toBe(first);
			expect(ballerinaSection({ tier, taskTools: false, tools: ["read"], live: ALL })).toBe(first);
		}
	});

	it("stays the same when a deferred tool loads", () => {
		expect(deferralChanges((session) => ballerinaSection(session))).toEqual([]);
	});

	it("names no tool the session cannot have", () => {
		expect(toolLeaks(sectionTexts, ENGLISH)).toEqual([]);
	});

	it("has every passage its table cuts", () => {
		expect(stalePassages(sectionTexts)).toEqual([]);
	});

	it("changes source files only through the file tools, naming only the file tools the session has", () => {
		const text = render("frontier") ?? "";
		for (const part of ["Create and change `.bal` files", "only with `write` and `edit`, never", "through the shell"]) expect(text).toContain(part);
		expect(text).toContain("A change made through the shell gets no compiler check");
		expect(text).toContain("- Only a change made with `write` or `edit` is checked.");
		// The rule sits before the first edit is described, near the top.
		expect(text.indexOf("Create and change `.bal` files only with")).toBeLessThan(text.indexOf("## Terminology"));
		expect(render("frontier", without("edit"))).toContain("only with `write`, never");
		expect(render("frontier", without("edit"))).toContain("Only a change made with `write` is checked");
		expect(render("frontier", without("write"))).toContain("only with `edit`, never");
		for (const tier of TIERS) {
			const noFiles = render(tier, without("write", "edit")) ?? "";
			expect(toolReference("edit").test(noFiles), `the ${tier} section names edit without it`).toBe(false);
			expect(toolReference("write").test(noFiles), `the ${tier} section names write without it`).toBe(false);
			expect(noFiles).not.toContain("Create and change `.bal` files only with");
		}
	});

	it("promises a check after each edit only with a file tool and the language-server diagnostics", () => {
		const promises = ["arrive after each edit", "The compiler checks every edit", "let the compiler check it", "no block means no new errors", "A change made through the shell gets no compiler check"];
		const buildInstead = ["Run `bal build` after a change to get the compiler's errors", "write the code and check it with `bal build`"];
		for (const tier of TIERS) {
			const all = render(tier) ?? "";
			for (const text of promises) expect(all, `${tier}: ${text}`).toContain(text);
			// File tools on, no lsp_diagnostics: the base's lsp feature may still add the block, so the text neither promises nor denies it.
			const unknown = render(tier, without("lsp_diagnostics")) ?? "";
			// The rule's reason is cut, so the exception follows its list of commands directly.
			for (const part of ["only with `write` and `edit`, never", "script that writes them. Commands that generate"]) expect(unknown).toContain(part);
			for (const text of promises) expect(unknown, `${tier} without diagnostics: ${text}`).not.toContain(text);
			for (const text of [...buildInstead, "Check each change to a `.bal` file with `bal build`", "When the result of a change carries a `<new-diagnostics>` block"]) expect(unknown, `${tier} without diagnostics: ${text}`).toContain(text);
			expect(unknown).not.toContain("no check arrives on its own");
			// No file tools: no change is checked on its own, whether or not diagnostics are live.
			for (const off of [["write", "edit"], ["write", "edit", "lsp_diagnostics"]]) {
				const noFiles = render(tier, without(...off)) ?? "";
				for (const text of [...promises, "<new-diagnostics>"]) expect(noFiles, `${tier} without ${off}: ${text}`).not.toContain(text);
				for (const text of [...buildInstead, "no check arrives on its own"]) expect(noFiles, `${tier} without ${off}: ${text}`).toContain(text);
			}
		}
	});

	it("names neither product tool when the session cannot have it, and says what to do instead", () => {
		for (const tool of ["create_integration", "config_status"]) {
			for (const tier of TIERS) expect(mentions(render(tier, without(tool)) ?? "", tool, {}), `${tier} without ${tool}`).toEqual([]);
			expect(mentions(render("frontier") ?? "", tool, {}), tool).not.toEqual([]);
		}
		const noCreate = render("frontier", without("create_integration")) ?? "";
		for (const part of ["write the layout above by hand, exactly as shown", "Never use `bal new` for a BI project", "Leave `Config.toml` to the user"]) expect(noCreate).toContain(part);
		expect(noCreate).not.toContain("Do not write the layout by hand either");
		const noStatus = render("frontier", without("config_status")) ?? "";
		for (const part of ["read the `configurable` declarations in the source", "only the user can tell you", "Never ask the user for a secret value in the chat"]) expect(noStatus).toContain(part);
	});

	it("tells the model to load no skill when the skill tool is off", () => {
		for (const tier of TIERS) expect(render(tier, without("skill")) ?? "", tier).not.toMatch(/load (it with )?the `|skill explains/);
	});

	it("starts with its one top-level heading", () => {
		for (const tier of TIERS) {
			const text = render(tier) ?? "";
			expect(text.startsWith("# Ballerina\n")).toBe(true);
			expect(text.split("\n").filter((line) => /^# /.test(line))).toEqual(["# Ballerina"]);
		}
	});

	it("carries the full domain knowledge on every tier, and skeletons on the weaker ones", () => {
		const frontier = render("frontier") ?? "";
		for (const heading of ["## Terminology", "## Creating a project or an integration", "## Keeping code editable in the BI designer", "## Finding a library", "## Imports and dependencies", "## Coding rules", "## Data binding, type casts and narrowing", "## Concurrency safety and shared state", "## Built-in language libraries", "## Configuration", "## Building, running and testing"]) {
			expect(headings(frontier), `frontier lacks ${heading}`).toContain(heading);
		}
		// The lower tiers differ only by the skeletons appended, so a rule asserted on the frontier text holds on every tier.
		for (const tier of TIERS) expect(render(tier)?.startsWith(frontier), `${tier} does not start with the frontier text`).toBe(true);
		expect(render("workhorse")).toBe(frontier);
		expect(render("cheap")).toContain("## Syntax skeletons");
		expect(render("tiny")).toBe(render("cheap"));
		expect(frontier).not.toContain("## Syntax skeletons");
	});

	it("looks a library up on a named gap, not by default", () => {
		const text = render("frontier") ?? "";
		expect(text).toContain("Look something up only when you can name the gap");
		expect(text).toContain("when the compiler rejects a library name, look it up");
		expect(text).toContain("a shape this section or a loaded skill shows");
		expect(text).toContain("Never web-search for a first-party Ballerina API fact");
	});

	it("keeps each lookup small: one question, text output, nested types read once, the readme only for a reason", () => {
		const text = render("frontier") ?? "";
		expect(text).toContain("Ask one question per command");
		expect(text).toContain("Always add `--output-format text`");
		expect(text).toContain("Read the nested types there; do not open them again");
		expect(text).toContain("only for a package you do not know at all");
		expect(text).toContain("Stop as soon as you can write the code");
		expect(text).toContain("Never read a readme to get your bearings");
	});

	it("sends learning a library to the librarian by a count of lookups", () => {
		const text = render("frontier") ?? "";
		expect(text).toContain("when one or two commands answer the question");
		expect(text).toContain("likely to take three or more lookups");
		expect(text).toContain("its report costs your context far less than the raw answers would");
		expect(text).toContain("Write one brief per independent external system");
		expect(text).toContain("tell the user in one short sentence what you are looking up");
		expect(text).toContain("so do not look them up again");
		expect(text).toContain("What it lists as not confirmed, or does not cover, look up before you write code that depends on it");
		expect(text).toContain("goes to the same librarian, not a new one");
		expect(text).toContain("it needs no lookup and no librarian");
		expect(text).toContain("`bal discover client <Client> -p <org>/<name> --output-format text`");
	});

	it("shows the lower tiers a reserved word quoted as an identifier", () => {
		const quoted = "foreach Order 'order in orders";
		for (const tier of ["cheap", "tiny"] as const) expect(render(tier)).toContain(quoted);
		for (const tier of ["frontier", "workhorse"] as const) expect(render(tier)).not.toContain(quoted);
	});

	it("keys the route on Agent only, and never names the deferred SendMessage", () => {
		for (const tier of TIERS) {
			expect(render(tier)).toContain("`Agent` tool");
			expect(toolReference("SendMessage").test(render(tier) ?? ""), `${tier} names SendMessage`).toBe(false);
			// pi's --exclude-tools Agent takes it out alone, and the route with it.
			const noAgent = render(tier, without("Agent")) ?? "";
			expect(toolReference("Agent").test(noAgent), `${tier} names Agent without it`).toBe(false);
			expect(/librarian/i.test(noAgent), `${tier} mentions the librarian without Agent`).toBe(false);
			expect(noAgent).not.toContain("two kinds");
		}
	});

	it("routes configuration through config_status and library lookup through the shell", () => {
		const text = render("frontier") ?? "";
		expect(text).toContain("`config_status`");
		expect(text).toContain("bal discover");
		expect(text).toContain("bal search");
		expect(text).toContain("`librarian`");
		expect(text).toContain("Never ask the user for a secret value in the chat");
	});

	it("names no removed tool and no tool the product lacks, and uses no em dash", () => {
		for (const tier of TIERS) {
			const text = render(tier) ?? "";
			expectNoForeignTools(`the ${tier} section`, text);
			expect(text.includes(EM_DASH), `the ${tier} section has an em dash`).toBe(false);
		}
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
			["the frontier section", render("frontier") ?? ""],
			["the cheap section", render("cheap") ?? ""],
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
	it("tell the reader to use the library shapes they show as written, not to look them up", () => {
		for (const skill of ["agent-builder", "workflow-builder"]) {
			const text = readFileSync(join(PROFILE, "skills", skill, "SKILL.md"), "utf8").replace(/\s+/g, " ");
			expect(text, skill).toContain("as shown and do not look them up");
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
