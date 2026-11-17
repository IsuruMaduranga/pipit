/**
 * The notice for the user who raises the thinking level above the product's
 * default (profile/extensions/ballerina/reasoning-notice.ts, wired in
 * index.ts): the rules that keep it quiet for a level the user did not
 * choose, once per session, and the wiring on `thinking_level_select` with the
 * off switch. The real-pi cases are in ballerina-reasoning-runtime.test.ts.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { thinkingLevelsFor } from "../../extensions/sdk/extension.ts";
import type { ThinkingLevelName } from "../../extensions/sdk/profile.ts";
import { createFakeCtx, createFakePi, flushNotices } from "../../test/unit/helpers/fake-pi.ts";
import ballerina from "../extensions/ballerina/index.ts";
import { createReasoningNotices, reasoningNoticeText } from "../extensions/ballerina/reasoning-notice.ts";
import { REASONING_NOTICE_SETTING } from "../settings.ts";
import { EM_DASH } from "./em-dash.ts";
import { fixtureModel } from "./helpers-model.ts";
import { settingMatrix } from "./setting-matrix.ts";

/** A model that reaches every level, and one with no `low` (pi runs `low` as `medium` there). */
const FULL = fixtureModel("openrouter", "vendor/full");
const NO_LOW = fixtureModel("openrouter", "vendor/no-low", { levels: { low: null, minimal: null } });
/** A model with no `medium` either: `medium` and `low` both run as `high`. */
const HIGH_ONLY = fixtureModel("openrouter", "vendor/high-only", { levels: { low: null, minimal: null, medium: null } });

const full = thinkingLevelsFor(FULL);
const noLow = thinkingLevelsFor(NO_LOW);
const highOnly = thinkingLevelsFor(HIGH_ONLY);

describe("the reasoning notice's rules", () => {
	const LEVELS: ThinkingLevelName[] = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];

	it("warns for every level above the default", () => {
		for (const level of LEVELS.slice(3)) expect(createReasoningNotices().noticeFor("s", level, "low", full), level).toBe(reasoningNoticeText(level));
	});

	it("names the level and keeps to the approved wording", () => {
		expect(reasoningNoticeText("high")).toBe(
			"Reasoning is set to high. Integration tasks rarely need more than low: a higher level is slower and costs more, and the model may overthink simple changes.",
		);
		expect(reasoningNoticeText("high").includes(EM_DASH)).toBe(false);
	});

	it("says nothing for the level pi fits the product's low to on a model with no low", () => {
		expect(noLow.settle("low")).toBe("medium");
		expect(createReasoningNotices().noticeFor("s", "medium", "high", noLow)).toBeUndefined();
		expect(highOnly.settle("low")).toBe("high");
		expect(createReasoningNotices().noticeFor("s", "high", "medium", highOnly)).toBeUndefined();
	});

	it("says nothing for a model's lowest level when it sits above the default, which pi fits the default up to", () => {
		// A model with no `off` and no `low`: its lowest level is `medium`, and that is what `low` settles to.
		const lowestMedium = thinkingLevelsFor(fixtureModel("openrouter", "vendor/lowest-medium", { levels: { off: null, low: null, minimal: null } }));
		expect(lowestMedium.supported[0]).toBe("medium");
		expect(lowestMedium.settle("low")).toBe("medium");
		expect(createReasoningNotices().noticeFor("s", "medium", "high", lowestMedium)).toBeUndefined();
	});

	it("says nothing for the level pi fitted from the previous one when the model changed", () => {
		// The user was on medium; the new model has no medium, and pi runs it as high.
		expect(highOnly.settle("medium")).toBe("high");
		expect(createReasoningNotices().noticeFor("s", "high", "medium", highOnly)).toBeUndefined();
	});

	it("warns when the user picks a level the model reaches", () => {
		expect(createReasoningNotices().noticeFor("s", "high", "medium", noLow)).toBe(reasoningNoticeText("high"));
		expect(createReasoningNotices().noticeFor("s", "xhigh", "low", noLow)).toBe(reasoningNoticeText("xhigh"));
	});

	it("warns once a session, and again in another", () => {
		const notices = createReasoningNotices();
		expect(notices.noticeFor("s", "high", "low", full)).toBe(reasoningNoticeText("high"));
		expect(notices.noticeFor("s", "xhigh", "high", full)).toBeUndefined();
		expect(notices.noticeFor("other", "xhigh", "high", full)).toBe(reasoningNoticeText("xhigh"));
	});

	it("does not use up its one warning on a level it stayed quiet for", () => {
		const notices = createReasoningNotices();
		expect(notices.noticeFor("s", "high", "medium", highOnly)).toBeUndefined();
		expect(notices.noticeFor("s", "xhigh", "high", highOnly)).toBe(reasoningNoticeText("xhigh"));
	});
});

describe("the reasoning notice's wiring", () => {
	afterEach(() => vi.restoreAllMocks());

	/** A fresh extension, and a context in the given mode that records what reached the user. */
	function load({ mode = "tui", hasUI = true, cwd = process.cwd(), current = FULL as unknown } = {}) {
		const fake = createFakePi();
		ballerina(fake.pi as never);
		const notices: Array<[string, string]> = [];
		const ctx = createFakeCtx({ cwd, hasUI, mode, model: current, ui: { notify: (text: string, level: string) => notices.push([text, level]) } });
		const select = async (level: string, previousLevel: string) => {
			await fake.fire("thinking_level_select", { level, previousLevel }, ctx);
			await flushNotices();
		};
		return { fake, ctx, notices, select };
	}

	it("warns once when the user raises the level above low, and never for a level at or below it", async () => {
		const { notices, select } = load();
		await select("low", "medium");
		await select("minimal", "low");
		expect(notices).toEqual([]);
		await select("high", "low");
		expect(notices).toEqual([[reasoningNoticeText("high"), "warning"]]);
		await select("xhigh", "high");
		expect(notices).toHaveLength(1);
	});

	it("says nothing at the session's start for a level already in force", async () => {
		const { fake, ctx, notices } = load();
		await fake.fire("session_start", { reason: "startup" }, ctx);
		await flushNotices();
		expect(notices.filter(([text]) => text.startsWith("Reasoning"))).toEqual([]);
	});

	it("says nothing for the level pi fitted the default to, which the base sets before the first request", async () => {
		const { notices, select } = load({ current: NO_LOW });
		await select("medium", "high");
		expect(notices).toEqual([]);
	});

	it("says nothing in a one-shot run", async () => {
		for (const [mode, hasUI] of [["print", false], ["json", false], ["tui", false]] as const) {
			const { notices, select } = load({ mode, hasUI });
			await select("high", "low");
			expect(notices, mode).toEqual([]);
		}
	});

	it("shows it in an RPC session", async () => {
		const { notices, select } = load({ mode: "rpc" });
		await select("high", "low");
		expect(notices).toEqual([[reasoningNoticeText("high"), "warning"]]);
	});

	settingMatrix(
		REASONING_NOTICE_SETTING,
		async (cwd) => {
			const { notices, select } = load({ cwd });
			await select("high", "low");
			return notices.map(([text]) => text);
		},
		[reasoningNoticeText("high")],
	);
});
