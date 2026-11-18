/**
 * The product's system prompt, subagent, subagent-model and hand-back words
 * (profile/text: system-prompt, subagents, subagent-models, handback), and
 * the bundled explore, general-purpose and plan agents and the code-review,
 * simplify, security-review and fewer-permission-prompts skills, name no
 * other product and no other product's instruction file or folder. The
 * passages that name another tool follow the live tool set: with a tool off
 * they never name it, and every passage a table cuts is in the text.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { LiveTools } from "../../extensions/lib/profile/live-tools.ts";
import type { PromptTier } from "../../extensions/lib/models/model-tier.ts";
import type { DescriptionForm } from "../../extensions/lib/profile/tool-variants.ts";
import { ALL_LIVE } from "../../test/unit/helpers/live.ts";
import { guideInput } from "../../test/unit/helpers/guide-input.ts";
import { type EnglishPhrases, mentions, type NamedText, stalePassages, toolLeaks } from "../../test/unit/helpers/tool-mentions.ts";
import brand from "../brand.json" with { type: "json" };
import { profile } from "../index.ts";

const PROFILE = join(import.meta.dirname, "..");
const TIERS: PromptTier[] = ["frontier", "workhorse", "cheap", "tiny"];
const FORMS: DescriptionForm[] = ["short", "long"];
const TOOL_SETS: (readonly string[] | undefined)[] = [undefined, ["bash"], ["powershell"], ["bash", "powershell"]];

/** Another product, its instruction file, or its config folder. */
const OTHER_PRODUCT = /claude|one ?code|anthropic|\bCLAUDE(\.local)?\.md\b/i;

/** Phrases where a tool's name is an English word, not the tool. */
const ENGLISH: EnglishPhrases = {};

/** A session with this tool set, as pi reports it for `live`: the task tools only when they are on. */
const sessionFor = (live: LiveTools, tier: PromptTier, tools: readonly string[] | undefined) => ({ tier, taskTools: live.has("task_create"), tools: tools?.filter((tool) => live.has(tool)) });

/** Every text of these groups that can name another tool, with the feature that owns it and the tool whose own words it is. */
function texts(live: LiveTools): NamedText[] {
	const t = profile.text({ live });
	const { systemPrompt, subagents, handback } = t as Required<typeof t>;
	const out: NamedText[] = [];
	const push = (label: string, owner: string | undefined, text: string, tool?: string) => out.push([label, owner, text, tool]);
	for (const tier of TIERS) {
		for (const tools of TOOL_SETS) {
			const session = sessionFor(live, tier, tools);
			systemPrompt.lead(session).forEach((section, i) => push(`${tier} lead ${i}`, undefined, section));
			systemPrompt.tail(session).forEach((section, i) => push(`${tier} tail ${i}`, undefined, section));
			push(`${tier} memory`, undefined, systemPrompt.memory("/mem", session));
		}
	}
	for (const form of FORMS) push(`Agent ${form}`, "subagents", subagents.agentDescription({ form, configDir: brand.stateDir }), "Agent");
	push("nested Agent", "subagents", subagents.nestedAgentDescription({ catalog: ["- explore: x"] }), "Agent");
	push("SendMessage", "subagents", `${subagents.sendMessageDescription}\n${JSON.stringify(subagents.sendMessageParams)}`, "SendMessage");
	push("list_agents", "subagents", subagents.listAgentsDescription, "list_agents");
	push("to main", "subagents", subagents.toMain.description);
	push("fork task", "subagents", subagents.forkTask({ task: "T", isolation: { worktreePath: "/w", parentCwd: "/p" } }));
	// The base sends the steer only while Agent is registered (extensions/agents/subagents/index.ts emitDelegationSteer), as if Agent's own words.
	push("delegation steer", "subagents", subagents.delegationSteer, "Agent");
	push("handback", undefined, handback.description);
	return out;
}

/** Every string these groups can send, with every tool on. */
function allWords(): string[] {
	const t = profile.text({ live: ALL_LIVE });
	const g = t as Required<typeof t>;
	const words = texts(ALL_LIVE).map(([, , text]) => text);
	const strings = (value: unknown): void => {
		if (typeof value === "string") words.push(value);
		else if (value && typeof value === "object") for (const inner of Object.values(value)) strings(inner);
	};
	const { guideAgent, agentDescription: _a, nestedAgentDescription: _n, forkTask: _f, ...rest } = g.subagents;
	strings([rest, g.subagentModels, g.handback]);
	if (guideAgent) {
		words.push(guideAgent.name, guideAgent.description);
		for (const shape of ["app", "extension"] as const) {
			const input = guideInput({ install: { ...guideInput().install, shape }, config: { instructionFiles: ["AGENTS.md", brand.productFile], configDir: brand.stateDir } });
			words.push(guideAgent.systemPrompt(input));
		}
	}
	return words;
}

/** The bundled files in scope: the three agents and the four skills, every file in each skill folder. */
function bundledFiles(): string[] {
	const files = ["explore", "general-purpose", "plan"].map((name) => join(PROFILE, "agents", `${name}.md`));
	const walk = (path: string): void => {
		if (statSync(path).isDirectory()) for (const entry of readdirSync(path)) walk(join(path, entry));
		else files.push(path);
	};
	for (const skill of ["code-review", "simplify", "security-review", "fewer-permission-prompts"]) walk(join(PROFILE, "skills", skill));
	return files;
}

describe("the system prompt, subagent and hand-back words", () => {
	it("name no other product", () => {
		const named = allWords().filter((text) => OTHER_PRODUCT.test(text));
		expect(named.map((text) => text.match(OTHER_PRODUCT)?.[0])).toEqual([]);
	});

	it("open with the product's name", () => {
		for (const tier of TIERS) expect(profile.text({ live: ALL_LIVE }).systemPrompt.lead(sessionFor(ALL_LIVE, tier, undefined))[0]).toMatch(new RegExp(`^You are ${brand.name},`));
	});

	it("leave out the tools of each optional feature that is off, and edit", () => {
		expect(toolLeaks(texts, ENGLISH)).toEqual([]);
	});

	it("leave SendMessage out of the Agent tool's words and the guide agent when pi's flags take it out alone", () => {
		// SendMessage is pinned, so only pi's --exclude-tools takes it out; deferred, it is still one the session can have.
		const words = (live: LiveTools) => {
			const subagents = profile.text({ live }).subagents!;
			return [...FORMS.map((form) => subagents.agentDescription({ form, configDir: brand.stateDir })), JSON.stringify(subagents.agentParams), subagents.guideAgent?.description ?? ""].join("\n");
		};
		expect(mentions(words({ has: (tool) => tool !== "SendMessage" }), "SendMessage", ENGLISH)).toEqual([]);
		// One in each form's usage notes, one in each form's closing section, the `name` parameter, the guide agent.
		expect(mentions(words(ALL_LIVE), "SendMessage", ENGLISH)).toHaveLength(6);
	});

	it("tell the model to wait for an agent's notification or call yield, never to fetch its output", () => {
		const subagents = profile.text({ live: { has: (tool) => tool !== "task_output" } }).subagents!;
		for (const form of FORMS) {
			const text = subagents.agentDescription({ form, configDir: brand.stateDir });
			expect(mentions(text, "task_output", ENGLISH)).toEqual([]);
			expect(text).toContain("call yield to wait for it");
			expect(text).toContain("End a run you no longer need with task_stop");
		}
		// pi holds a message to a running agent until it next calls a tool or ends its reply.
		expect(subagents.sendMessageDescription).toContain("the message is queued until the agent next calls a tool or finishes the reply it is writing");
		// The base's list_agents shows `running`, `idle` and `finished`.
		expect(subagents.listAgentsDescription).toContain("`idle` means its turn is over");
		expect(subagents.listAgentsDescription).not.toContain("resident");
	});

	it("have every passage their tables cut", () => {
		expect(stalePassages(texts)).toEqual([]);
	});
});

describe("the bundled agents and skills in scope", () => {
	it("name no other product", () => {
		const named = bundledFiles().filter((file) => OTHER_PRODUCT.test(readFileSync(file, "utf8")));
		expect(named).toEqual([]);
	});
});
