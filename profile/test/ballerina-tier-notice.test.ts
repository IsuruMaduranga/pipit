/**
 * The notice for the user when the session model sits below the product's
 * tier floor (profile/extensions/ballerina/tier-notice.ts, wired in
 * index.ts): once per model in a session, through the base's lifecycle
 * notices with a UI and on stderr without one, and never into the request.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { envName } from "../../extensions/lib/profile/brand.mjs";
import { REMINDER_CHANNEL } from "../../extensions/sdk/extension.ts";
import { createFakeCtx, createFakePi, flushNotices } from "../../test/unit/helpers/fake-pi.ts";
import ballerina from "../extensions/ballerina/index.ts";
import { createTierNotices, tierNoticeText } from "../extensions/ballerina/tier-notice.ts";

const SMALL = { provider: "openrouter", id: "qwen/qwen3.8-27b" };
const OTHER = { provider: "openrouter", id: "small/other" };

describe("the tier notice's logic", () => {
	it("warns below workhorse only", () => {
		const notices = createTierNotices();
		expect(notices.noticeFor("s", SMALL, "frontier")).toBeUndefined();
		expect(notices.noticeFor("s", SMALL, "workhorse")).toBeUndefined();
		expect(notices.noticeFor("s", SMALL, "cheap")).toBe(tierNoticeText(SMALL.id));
		expect(notices.noticeFor("s", OTHER, "tiny")).toBe(tierNoticeText(OTHER.id));
	});

	it("names each model once a session", () => {
		const notices = createTierNotices();
		expect(notices.noticeFor("s", SMALL, "tiny")).toContain(SMALL.id);
		expect(notices.noticeFor("s", SMALL, "tiny")).toBeUndefined();
		expect(notices.noticeFor("s", OTHER, "cheap")).toContain(OTHER.id);
		expect(notices.noticeFor("s", undefined, "tiny")).toBeUndefined();
		expect(notices.noticeFor("another session", SMALL, "tiny")).toContain(SMALL.id);
	});

	it("claims only that the model is not among the best fits, and says which models do best, naming no other product", () => {
		const text = tierNoticeText("m");
		expect(text).toContain("not one of the models this product does its best work with");
		expect(text).toContain("more rounds of correction");
		expect(text).toContain("frontier models");
		expect(text).not.toMatch(/smaller|claude|one ?code|anthropic|copilot/i);
		expect(text.includes(String.fromCharCode(0x2014))).toBe(false);
	});
});

describe("the tier notice's wiring", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
	});

	/** A fresh extension under a forced tier, with what reached the user and the reminders it sent toward the request. */
	function load(tier: string, mode = "tui", hasUI = true) {
		vi.stubEnv(envName("PROMPT_TIER"), tier);
		const fake = createFakePi();
		const reminders: unknown[] = [];
		fake.events.on(REMINDER_CHANNEL, (data) => reminders.push(data));
		ballerina(fake.pi as never);
		const notices: Array<[string, string]> = [];
		const ctx = createFakeCtx({ hasUI, mode, model: SMALL, ui: { notify: (text: string, level: string) => notices.push([text, level]) } });
		return { fake, ctx, notices, reminders };
	}

	it("shows one warning at the session's start for a model below the floor, and none for the same model again", async () => {
		const { fake, ctx, notices, reminders } = load("tiny");
		await fake.fire("session_start", { reason: "startup" }, ctx);
		await flushNotices();
		expect(notices).toEqual([[tierNoticeText(SMALL.id), "warning"]]);
		await fake.fire("model_select", { model: SMALL }, ctx);
		await flushNotices();
		expect(notices).toHaveLength(1);
		// A switch to another small model names that one.
		await fake.fire("model_select", { model: OTHER }, ctx);
		await flushNotices();
		expect(notices.map(([text]) => text)).toEqual([tierNoticeText(SMALL.id), tierNoticeText(OTHER.id)]);
		// No reminder carries it toward the request (the live request dump checks the rest).
		expect(JSON.stringify(reminders)).not.toContain(tierNoticeText(SMALL.id));
	});

	it("shows it once when pi starts the session twice, and again in a fresh extension for a new session", async () => {
		const { fake, ctx, notices } = load("cheap", "rpc");
		// RPC mode emits session_start twice for a new, switched or forked session.
		await fake.fire("session_start", { reason: "new" }, ctx);
		await fake.fire("session_start", { reason: "new" }, ctx);
		await flushNotices();
		expect(notices).toHaveLength(1);
		// pi runs the extension again for a replaced session.
		const next = load("cheap");
		await next.fake.fire("session_start", { reason: "new" }, next.ctx);
		await flushNotices();
		expect(next.notices).toHaveLength(1);
	});

	it("says nothing for a workhorse or frontier model", async () => {
		for (const tier of ["workhorse", "frontier"]) {
			const { fake, ctx, notices } = load(tier);
			await fake.fire("session_start", { reason: "startup" }, ctx);
			await fake.fire("model_select", { model: OTHER }, ctx);
			await flushNotices();
			expect(notices, tier).toEqual([]);
		}
	});

	it("says nothing in a one-shot run, on screen or on stderr", async () => {
		const stderr = vi.spyOn(console, "error").mockImplementation(() => undefined);
		for (const mode of ["print", "json"]) {
			const { fake, ctx, notices } = load("tiny", mode, false);
			await fake.fire("session_start", { reason: "startup" }, ctx);
			await flushNotices();
			expect(notices, mode).toEqual([]);
		}
		expect(stderr).not.toHaveBeenCalled();
	});
});
