/**
 * The reasoning notice on pi's own runtime, with the base's effort feature
 * applying the profile's `low` default: the default's level change, a model
 * switch that carries or fits a level, and a model with no `low` never show
 * the notice, and the user's own pick above low does. Only the provider is
 * replaced.
 */
import { join } from "node:path";
import { type AgentSession, createAgentSession, DefaultResourceLoader, ModelRuntime, SessionManager, SettingsManager } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import effortExtension from "../../extensions/ui/effort/index.ts";
import { setLaunchArgsForTest } from "../../extensions/lib/profile/profile.ts";
import { tempHome } from "../../test/unit/helpers/temp-home.ts";
import ballerina from "../extensions/ballerina/index.ts";
import { reasoningNoticeText } from "../extensions/ballerina/reasoning-notice.ts";
import { fixtureModel } from "./helpers-model.ts";

const PROVIDER = "reasoning-provider";
const model = (id: string, levels: Record<string, string | null>) => fixtureModel(PROVIDER, id, { baseUrl: "http://localhost.invalid", levels });
/** Reaches every level; has no `low` (pi runs the default as `medium`); has neither `low` nor `medium`. */
const FULL = model("full", {});
const NO_LOW = model("no-low", { low: null, minimal: null });
const HIGH_ONLY = model("high-only", { low: null, minimal: null, medium: null });

const sessions: AgentSession[] = [];
let dir: string;

beforeEach(() => {
	dir = tempHome("reasoning-runtime-").cwd;
	// No Ballerina on this machine for the test: the setup check ends at once.
	vi.stubEnv("PATH", join(dir, "no-bin"));
});
afterEach(async () => {
	for (const session of sessions.splice(0)) {
		await session.abort();
		session.dispose();
	}
	setLaunchArgsForTest([]);
	vi.restoreAllMocks();
});

const UI_METHODS = "select confirm input onTerminalInput setStatus setWorkingMessage setWorkingVisible setWorkingIndicator setHiddenThinkingLabel setFooter setHeader setTitle custom pasteToEditor setEditorText getEditorText addAutocompleteProvider setEditorComponent getEditorComponent getAllThemes getTheme setTheme getToolsExpanded setToolsExpanded setWidget";

/** A terminal session with the effort feature and the Ballerina extension; `shown` lists every notice that reached the user. */
async function start(initial: typeof FULL, thinkingLevel?: "medium", settings: Record<string, unknown> = {}) {
	const settingsManager = SettingsManager.inMemory({ retry: { enabled: false }, compaction: { enabled: false }, ...settings });
	const loader = new DefaultResourceLoader({
		cwd: dir, agentDir: dir, settingsManager, noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
		extensionFactories: [effortExtension, ballerina],
	});
	await loader.reload();
	const runtime = await ModelRuntime.create({ credentials: { read: async () => undefined, list: async () => [], modify: async () => undefined, delete: async () => {} }, modelsPath: null, refreshOnCreate: false });
	vi.spyOn(runtime, "hasConfiguredAuth").mockReturnValue(true);
	vi.spyOn(runtime, "checkAuth").mockResolvedValue({} as never);
	const { session } = await createAgentSession({ cwd: dir, agentDir: dir, resourceLoader: loader, settingsManager, modelRuntime: runtime, model: initial as never, thinkingLevel, tools: [], sessionManager: SessionManager.inMemory(dir) });
	sessions.push(session);
	const shown: string[] = [];
	const ui: Record<string, unknown> = Object.fromEntries(UI_METHODS.split(" ").map((name) => [name, () => undefined]));
	ui.notify = (text: string) => shown.push(text);
	ui.theme = { fg: (_color: string, text: string) => text, dim: (text: string) => text, bold: (text: string) => text };
	await session.bindExtensions({ mode: "tui", uiContext: ui as never, onError: () => undefined });
	const reasoning = () => shown.filter((text) => text.startsWith("Reasoning is set to"));
	return { session, reasoning };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 30));

describe("the reasoning notice with the base's default level", () => {
	it("stays quiet for a new session at low, on a model with low and on one without", async () => {
		for (const initial of [FULL, NO_LOW, HIGH_ONLY]) {
			const { session, reasoning } = await start(initial);
			await settle();
			expect(session.thinkingLevel, initial.id).toBe(initial === FULL ? "low" : initial === NO_LOW ? "medium" : "high");
			expect(reasoning(), initial.id).toEqual([]);
		}
	});

	it("stays quiet when a model switch carries or fits the level", async () => {
		const { session, reasoning } = await start(FULL);
		await settle();
		await session.setModel(NO_LOW as never);
		await settle();
		await session.setModel(HIGH_ONLY as never);
		await settle();
		await session.setModel(FULL as never);
		await settle();
		expect(reasoning()).toEqual([]);
	});

	it("stays quiet when the user's own level is fitted to a model without it", async () => {
		const { session, reasoning } = await start(FULL, "medium");
		await settle();
		await session.setModel(HIGH_ONLY as never);
		await settle();
		expect(session.thinkingLevel).toBe("high");
		expect(reasoning()).toEqual([]);
	});

	it("warns once when the user raises the level, and again for nothing else in the session", async () => {
		const { session, reasoning } = await start(FULL);
		await settle();
		session.setThinkingLevel("high");
		await settle();
		expect(reasoning()).toEqual([reasoningNoticeText("high")]);
		session.setThinkingLevel("xhigh");
		await settle();
		expect(reasoning()).toHaveLength(1);
	});

	it("does not warn when the user lowers the level back", async () => {
		const { session, reasoning } = await start(FULL, "medium");
		await settle();
		session.setThinkingLevel("low");
		await settle();
		expect(reasoning()).toEqual([]);
	});

	it("warns once when a switch lands on a model with a level the user saved for it, which looks like a pick", async () => {
		const { session, reasoning } = await start(FULL, undefined, { modelThinkingLevels: { [`${PROVIDER}/no-low`]: "high" } });
		await settle();
		await session.setModel(NO_LOW as never);
		await settle();
		expect(session.thinkingLevel).toBe("high");
		expect(reasoning()).toEqual([reasoningNoticeText("high")]);
		await session.setModel(FULL as never);
		await settle();
		await session.setModel(NO_LOW as never);
		await settle();
		expect(reasoning()).toHaveLength(1);
	});
});
