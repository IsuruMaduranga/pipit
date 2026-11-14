/**
 * The Ballerina knowledge layer: the `# Ballerina` system-prompt section
 * (profile/extensions/ballerina/prompt.ts), the `librarian` agent and the
 * Ballerina skills. The section is a pure function of the tier, carries the
 * full domain knowledge on every tier, and none of the text names a tool the
 * product does not have (the earlier BI harness's and the VS Code Copilot's
 * tools are gone; library lookup is the shell).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseFrontmatter } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import type { PromptTier } from "../../extensions/lib/models/model-tier.ts";
import { ballerinaSection } from "../extensions/ballerina/prompt.ts";

const PROFILE = join(import.meta.dirname, "..");
const TIERS: PromptTier[] = ["frontier", "workhorse", "cheap", "tiny"];
const SKILLS = ["data-map", "agent-builder", "workflow-builder", "skill-creator", "connector"];
const AGENTS = ["librarian"];

const render = (tier: PromptTier, tools?: readonly string[]) => ballerinaSection({ tier, taskTools: true, tools });

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
	it("renders the same bytes twice for every tier, whatever else the session holds", () => {
		for (const tier of TIERS) {
			const first = render(tier);
			expect(first).toBeDefined();
			expect(render(tier)).toBe(first);
			expect(render(tier, ["read", "bash", "config_status"])).toBe(first);
			expect(ballerinaSection({ tier, taskTools: false, tools: ["read"] })).toBe(first);
		}
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
		for (const heading of ["## Terminology", "## Creating a project or an integration", "## Keeping code editable in the BI designer", "## Finding a library", "## Coding rules", "## Data binding, type casts and narrowing", "## Concurrency safety and shared state", "## Built-in language libraries", "## Configuration", "## Building, running and testing"]) {
			expect(headings(frontier)).toContain(heading);
		}
		for (const tier of TIERS) expect(render(tier)?.startsWith(frontier)).toBe(true);
		expect(render("workhorse")).toBe(frontier);
		expect(render("cheap")).toContain("## Syntax skeletons");
		expect(render("tiny")).toBe(render("cheap"));
		expect(frontier).not.toContain("## Syntax skeletons");
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

function frontmatterOf(path: string): { frontmatter: Record<string, unknown>; body: string } {
	// Strict YAML: the loose fallback would hide a description that does not parse.
	const parsed = parseFrontmatter(readFileSync(path, "utf8")) as { frontmatter?: Record<string, unknown>; body: string };
	return { frontmatter: parsed.frontmatter ?? {}, body: parsed.body };
}

describe("the Ballerina skills", () => {
	for (const skill of SKILLS) {
		it(`${skill} has valid frontmatter naming its folder, and names no foreign tool`, () => {
			const path = join(PROFILE, "skills", skill, "SKILL.md");
			const { frontmatter, body } = frontmatterOf(path);
			expect(frontmatter.name).toBe(skill);
			expect(typeof frontmatter.description).toBe("string");
			expect(String(frontmatter.description).length).toBeGreaterThan(40);
			expect(body.trim().length).toBeGreaterThan(0);
			expectNoForeignTools(skill, readFileSync(path, "utf8"));
			expect(readFileSync(path, "utf8").includes(EM_DASH), `${skill} has an em dash`).toBe(false);
		});
	}
});

describe("the librarian agent", () => {
	for (const agent of AGENTS) {
		it(`${agent} has valid frontmatter naming its file, a shell-and-read tool set and a cheaper model`, () => {
			const path = join(PROFILE, "agents", `${agent}.md`);
			const { frontmatter, body } = frontmatterOf(path);
			expect(frontmatter.name).toBe(agent);
			expect(typeof frontmatter.description).toBe("string");
			expect(String(frontmatter.tools).split(/,\s*/)).toEqual(["bash", "read"]);
			expect(frontmatter.model).toBe("haiku");
			expect(body).toContain("bal discover");
			expectNoForeignTools(agent, readFileSync(path, "utf8"));
		});
	}
});
