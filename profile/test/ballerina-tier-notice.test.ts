/**
 * The notice for the user when the session model's capability sits below the product's
 * tier floor (profile/extensions/ballerina/tier-notice.ts, wired in
 * index.ts): once per model in a session, through the base's lifecycle
 * notices with a UI and on stderr without one, and never into the request.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { envName } from "../../extensions/lib/profile/brand.mjs";
import { REMINDER_CHANNEL } from "../../extensions/sdk/extension.ts";
import { type FixtureModel, pinCatalog } from "../../test/unit/catalog-fixture.ts";
import { createFakeCtx, createFakePi, flushNotices } from "../../test/unit/helpers/fake-pi.ts";
import ballerina from "../extensions/ballerina/index.ts";
import { TIER_NOTICE_SETTING } from "../settings.ts";
import { createTierNotices, tierNoticeText } from "../extensions/ballerina/tier-notice.ts";
import { EM_DASH } from "./em-dash.ts";
import { fixtureModel } from "./helpers-model.ts";
import { settingMatrix } from "./setting-matrix.ts";

/** Rated cheap by a rule that knows it, though the prompt register for it is frontier. */
const HAIKU_ID = "anthropic/claude-haiku-5.5";
const DEEPSEEK_ID = "deepseek/deepseek-v4.1-flash-1017";
const HAIKU = fixtureModel("openrouter", HAIKU_ID, { price: [1, 5] });
/** Rated cheap, and the register is cheap too. */
const DEEPSEEK = fixtureModel("openrouter", DEEPSEEK_ID, { price: [0.14, 0.28] });
/** Rated frontier through the gateway. */
const SONNET = fixtureModel("openrouter", "anthropic/claude-sonnet-5.5", { price: [3, 15] });
/** A custom provider with no price: the base can only guess its tier. */
const UNKNOWN = fixtureModel("my-gateway", "mystery/model-1", { baseUrl: "http://localhost:9999/v1" });

/**
 * The catalog the base's rules read: a model is rated by name only when a
 * catalog entry (or the user's `modelTiers`) knows it, so these are the rows
 * the real catalog holds for the models above. Sonnet is rated frontier by
 * the vendor's rule and needs none; the custom provider has none on purpose.
 */
const CATALOG: FixtureModel[] = [
	{ id: "anthropic/claude-haiku-5-5", released: "2026-10-20", price: [1, 5], servedAs: ["openrouter/anthropic/claude-haiku-5.5"] },
	{ id: "deepseek/deepseek-v4.1-flash-1017", released: "2026-10-17", price: [0.14, 0.28], servedAs: ["openrouter/deepseek/deepseek-v4.1-flash-1017"] },
];

const CHEAP = { tier: "cheap", known: true } as const;

describe("the tier notice's logic", () => {
	const A = { provider: "openrouter", id: "a/one" };
	const B = { provider: "openrouter", id: "b/two" };

	it("warns below workhorse only, and only for a rating the base knows", () => {
		const notices = createTierNotices();
		expect(notices.noticeFor("s", A, { tier: "frontier", known: true })).toBeUndefined();
		expect(notices.noticeFor("s", A, { tier: "workhorse", known: true })).toBeUndefined();
		expect(notices.noticeFor("s", A, { tier: "cheap", known: false })).toBeUndefined();
		expect(notices.noticeFor("s", A, { tier: "tiny", known: false })).toBeUndefined();
		expect(notices.noticeFor("s", A, CHEAP)).toBe(tierNoticeText(A.id));
		expect(notices.noticeFor("s", B, { tier: "tiny", known: true })).toBe(tierNoticeText(B.id));
	});

	it("names each model once a session", () => {
		const notices = createTierNotices();
		expect(notices.noticeFor("s", A, CHEAP)).toContain(A.id);
		expect(notices.noticeFor("s", A, CHEAP)).toBeUndefined();
		expect(notices.noticeFor("s", B, CHEAP)).toContain(B.id);
		expect(notices.noticeFor("s", undefined, CHEAP)).toBeUndefined();
		expect(notices.noticeFor("another session", A, CHEAP)).toContain(A.id);
	});

	it("claims only that the model is not among the best fits, and says which models do best, naming no other product", () => {
		const text = tierNoticeText("m");
		expect(text).toContain("not one of the models this product does its best work with");
		expect(text).toContain("more rounds of correction");
		expect(text).toContain("frontier models");
		expect(text).not.toMatch(/smaller|claude|one ?code|anthropic|copilot/i);
		expect(text.includes(EM_DASH)).toBe(false);
	});
});

describe("the tier notice's wiring", () => {
	beforeEach(() => pinCatalog(CATALOG));
	afterEach(() => {
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
	});

	/** A fresh extension with what reached the user and the reminders it sent toward the request. */
	function load(mode = "tui", hasUI = true, current: unknown = HAIKU) {
		const fake = createFakePi();
		const reminders: unknown[] = [];
		fake.events.on(REMINDER_CHANNEL, (data) => reminders.push(data));
		ballerina(fake.pi as never);
		const notices: Array<[string, string]> = [];
		const ctx = createFakeCtx({ hasUI, mode, model: current, ui: { notify: (text: string, level: string) => notices.push([text, level]) } });
		return { fake, ctx, notices, reminders };
	}

	it("shows one warning at the session's start for a model rated below the floor, and none for the same model again", async () => {
		const { fake, ctx, notices, reminders } = load();
		await fake.fire("session_start", { reason: "startup" }, ctx);
		await flushNotices();
		expect(notices).toEqual([[tierNoticeText(HAIKU_ID), "warning"]]);
		await fake.fire("model_select", { model: HAIKU }, ctx);
		await flushNotices();
		expect(notices).toHaveLength(1);
		// A switch to another model rated cheap names that one.
		await fake.fire("model_select", { model: DEEPSEEK }, ctx);
		await flushNotices();
		expect(notices.map(([text]) => text)).toEqual([tierNoticeText(HAIKU_ID), tierNoticeText(DEEPSEEK_ID)]);
		// No reminder carries it toward the request (the live request dump checks the rest).
		expect(JSON.stringify(reminders)).not.toContain(tierNoticeText(HAIKU_ID));
	});

	it("judges by capability, not the prompt register: Haiku 5.5 warns under the frontier register", async () => {
		vi.stubEnv(envName("PROMPT_TIER"), "frontier");
		const { fake, ctx, notices } = load();
		await fake.fire("session_start", { reason: "startup" }, ctx);
		await flushNotices();
		expect(notices).toEqual([[tierNoticeText(HAIKU_ID), "warning"]]);
		// And the knob that moves the register to cheap does not make a frontier model warn.
		vi.stubEnv(envName("PROMPT_TIER"), "cheap");
		const next = load("tui", true, SONNET);
		await next.fake.fire("session_start", { reason: "startup" }, next.ctx);
		await flushNotices();
		expect(next.notices).toEqual([]);
	});

	it("says nothing for Sonnet 5.5 through OpenRouter, at the start or after a switch", async () => {
		const { fake, ctx, notices } = load("tui", true, SONNET);
		await fake.fire("session_start", { reason: "startup" }, ctx);
		await fake.fire("model_select", { model: SONNET }, ctx);
		await flushNotices();
		expect(notices).toEqual([]);
	});

	it("says nothing for a model the base can only guess at, at the start or after a switch", async () => {
		const { fake, ctx, notices } = load("tui", true, UNKNOWN);
		await fake.fire("session_start", { reason: "startup" }, ctx);
		await fake.fire("model_select", { model: UNKNOWN }, ctx);
		await flushNotices();
		expect(notices).toEqual([]);
		// Without a model chosen yet, nothing either.
		const none = load();
		const noModel = createFakeCtx({ hasUI: true, mode: "tui", model: undefined, ui: { notify: (text: string, level: string) => none.notices.push([text, level]) } });
		await none.fake.fire("session_start", { reason: "startup" }, noModel);
		await flushNotices();
		expect(none.notices).toEqual([]);
	});

	it("shows it once when pi starts the session twice, and again in a fresh extension for a new session", async () => {
		const { fake, ctx, notices } = load("rpc");
		// RPC mode emits session_start twice for a new, switched or forked session.
		await fake.fire("session_start", { reason: "new" }, ctx);
		await fake.fire("session_start", { reason: "new" }, ctx);
		await flushNotices();
		expect(notices).toHaveLength(1);
		// pi runs the extension again for a replaced session.
		const next = load();
		await next.fake.fire("session_start", { reason: "new" }, next.ctx);
		await flushNotices();
		expect(next.notices).toHaveLength(1);
	});

	it("says nothing in a one-shot run, on screen or on stderr", async () => {
		const stderr = vi.spyOn(console, "error").mockImplementation(() => undefined);
		for (const mode of ["print", "json"]) {
			const { fake, ctx, notices } = load(mode, false);
			await fake.fire("session_start", { reason: "startup" }, ctx);
			await flushNotices();
			expect(notices, mode).toEqual([]);
		}
		expect(stderr).not.toHaveBeenCalled();
	});

	settingMatrix(
		TIER_NOTICE_SETTING,
		async (cwd) => {
			const { fake, notices } = load();
			const ctx = createFakeCtx({ cwd, hasUI: true, mode: "tui", model: HAIKU, ui: { notify: (text: string, level: string) => notices.push([text, level]) } });
			await fake.fire("session_start", { reason: "startup" }, ctx);
			await fake.fire("model_select", { model: DEEPSEEK }, ctx);
			await flushNotices();
			return notices.map(([text]) => text);
		},
		[tierNoticeText(HAIKU_ID), tierNoticeText(DEEPSEEK_ID)],
	);
});
