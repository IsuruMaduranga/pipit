/**
 * Keeping Ballerina current (updates.ts, setup-session.ts, install-lock.ts):
 * `discover` is updated without asking, a newer distribution is offered in
 * the product's own dialog after a turn and pulled for the version the user
 * picks, the network is asked at most once a day (three hours after a check
 * that reached nothing), and one writer at a time touches `~/.ballerina`.
 * The answer shapes are Ballerina Central's and `bal dist list`'s
 * (working-docs/findings/01-ballerina-cli.md).
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LOCK_FILE, releaseLock, takeLock } from "../extensions/ballerina/install-lock.ts";
import { createSessionSetup, DIST_TIMEOUT_MS, type SetupEnv } from "../extensions/ballerina/setup-session.ts";
import {
	activeDiscover,
	CHECK_INTERVAL_MS,
	discoverUpdatedMessage,
	distributionUrl,
	dueForCheck,
	failedCheck,
	latestDiscover,
	latestDistribution,
	newestPatch,
	planUpdates,
	readState,
	RETRY_MS,
	updateDialog,
} from "../extensions/ballerina/updates.ts";

const REGISTRY = '# AUTO-GENERATED FILE. DO NOT MODIFY.\n\n[[tool]]\nid = "migen"\nversion = "1.0.2"\nactive = true\n\n[[tool]]\nid = "discover"\norg = "ballerina"\nname = "tool_discover"\nversion = "0.1.0"\nactive = true\nforce = true\n';

describe("reading Central's answers, bal dist list and the tool registry", () => {
	it("takes the newest discover and the newest distribution from Central's answers", () => {
		expect(latestDiscover({ name: "tool_discover", version: "0.1.2", platform: "java25" })).toBe("0.1.2");
		// Every field holds the newest of all, whatever the request asked (ran 2026-11-20).
		expect(latestDistribution({ major: "2201.15.0", minor: "2201.15.0", patch: "2201.15.0" })).toBe("2201.15.0");
		expect(latestDiscover({ message: "invalid request" })).toBeUndefined();
		expect(latestDistribution(undefined)).toBeUndefined();
		expect(distributionUrl("2201.14.0")).toBe("https://api.central.ballerina.io/2.0/update-tool/distributions/latest?version=2201.14.0&type=patch");
	});

	it("finds the newest patch of the active line in bal dist list", () => {
		const list = "Distributions available locally: \n\n  2201.14.2\n* 2201.14.0\n\nDistributions available remotely:\n\nSwan Lake channel\n\n  2201.15.0 - latest\n  2201.14.2\n* 2201.14.0\n  2201.13.7\n\n1.* channel\n\n  1.2.71 - latest\n";
		expect(newestPatch(list, "2201.14.0")).toBe("2201.14.2");
		expect(newestPatch(list, "2201.13.2")).toBe("2201.13.7");
		expect(newestPatch(list, "2201.14.2")).toBeUndefined();
		expect(newestPatch("", "2201.14.0")).toBeUndefined();
	});

	it("reads the active discover from the registry, and a local build as not Central's", () => {
		expect(activeDiscover(REGISTRY)).toEqual({ version: "0.1.0", central: true });
		expect(activeDiscover(REGISTRY.replace("force = true", 'repository = "local"'))).toEqual({ version: "0.1.0", central: false });
		expect(activeDiscover(REGISTRY.replace(/active = true\nforce/, "active = false\nforce"))).toBeUndefined();
		expect(activeDiscover("")).toBeUndefined();
	});

	it("reads only its own state, checks again after a day or a clock that went back, and waits three hours after a failed check", () => {
		expect(readState('{"checkedAt":5,"skipped":"2201.14.2","failedAt":7}')).toEqual({ checkedAt: 5, skipped: "2201.14.2", failedAt: 7 });
		expect(readState('{"checkedAt":5,"skipped":"latest"}')).toEqual({ checkedAt: 5 });
		expect(readState("not json")).toBeUndefined();
		expect(readState(undefined)).toBeUndefined();
		expect(dueForCheck(undefined, 1000)).toBe(true);
		expect(dueForCheck({ checkedAt: 1000 }, 1000 + CHECK_INTERVAL_MS - 1)).toBe(false);
		expect(dueForCheck({ checkedAt: 1000 }, 1000 + CHECK_INTERVAL_MS)).toBe(true);
		expect(dueForCheck({ checkedAt: 1000 }, 500)).toBe(true);
		const at = 10 * CHECK_INTERVAL_MS;
		const failed = failedCheck(undefined, at);
		expect(failed).toEqual({ checkedAt: 0, failedAt: at });
		expect(dueForCheck(failed, at + RETRY_MS - 1)).toBe(false);
		expect(dueForCheck(failed, at + RETRY_MS)).toBe(true);
	});
});

describe("planning the updates", () => {
	const base = { now: 9, state: undefined, discover: { version: "0.1.0", central: true }, latestDiscover: "0.1.0", distribution: "2201.14.0", latestDistribution: "2201.14.0" };

	it("updates a Central discover that is behind, and leaves an up-to-date or local one", () => {
		expect(planUpdates({ ...base, latestDiscover: "0.1.1" }).updateDiscover).toBe(true);
		expect(planUpdates(base).updateDiscover).toBe(false);
		expect(planUpdates({ ...base, discover: { version: "0.1.0", central: false }, latestDiscover: "0.2.0" }).updateDiscover).toBe(false);
		expect(planUpdates({ ...base, discover: undefined, latestDiscover: "0.2.0" }).updateDiscover).toBe(false);
	});

	it("names a newer distribution until the user skips it, and records the check", () => {
		expect(planUpdates({ ...base, latestDistribution: "2201.14.2" })).toEqual({ updateDiscover: false, newer: "2201.14.2", state: { checkedAt: 9 } });
		const skipped = { checkedAt: 1, skipped: "2201.14.2" };
		expect(planUpdates({ ...base, state: skipped, latestDistribution: "2201.14.2" })).toEqual({ updateDiscover: false, state: { checkedAt: 9, skipped: "2201.14.2" } });
		expect(planUpdates({ ...base, state: skipped, latestDistribution: "2201.15.0" }).newer).toBe("2201.15.0");
		expect(planUpdates(base)).toEqual({ updateDiscover: false, state: { checkedAt: 9 } });
	});

	it("offers a patch and a new release as separate choices, and says an update reaches every project", () => {
		const both = updateDialog("2201.14.0", "2201.14.2", "2201.15.0");
		expect(both.title).toContain("this machine runs 2201.14.0. An update applies to every Ballerina project on this machine.");
		expect(both.choices).toEqual([
			{ kind: "update", version: "2201.14.2", label: "Update to 2201.14.2 (a patch of 2201.14)" },
			{ kind: "update", version: "2201.15.0", label: "Update to 2201.15.0 (a new release: it may change how your projects build)" },
			{ kind: "later", label: "Not now (ask again tomorrow)" },
			{ kind: "skip", version: "2201.15.0", label: "Skip these versions" },
		]);
		expect(updateDialog("2201.14.0", "2201.14.2", undefined).choices.map((choice) => choice.label)).toEqual(["Update to 2201.14.2 (a patch of 2201.14)", "Not now (ask again tomorrow)", "Skip 2201.14.2"]);
		expect(discoverUpdatedMessage("0.1.0", "0.1.1")).toBe("Updated the bal tool `discover` from 0.1.0 to 0.1.1.");
	});
});

describe("the install lock", () => {
	it("lets one holder in, takes over a dead holder's lock, and releases only its own", () => {
		const dir = mkdtempSync(join(tmpdir(), "bal-lock-"));
		try {
			const file = join(dir, "state", LOCK_FILE);
			expect(takeLock(file)).toBe(true);
			// This process holds it: another session of it waits.
			expect(takeLock(file)).toBe(false);
			releaseLock(file);
			expect(takeLock(file)).toBe(true);
			releaseLock(file);
			// A holder that is gone (no process has this id).
			writeFileSync(file, "2147483646\n");
			expect(takeLock(file)).toBe(true);
			expect(readFileSync(file, "utf8")).toBe(`${process.pid}\n`);
			// Someone else's live lock is not released.
			writeFileSync(file, "1\n");
			releaseLock(file);
			expect(readFileSync(file, "utf8")).toBe("1\n");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("the session's setup (setup-session.ts)", () => {
	type Fake = SetupEnv & { urls: string[]; ran: string[]; notices: string[]; asked: string[][]; stored: string | undefined };
	const fake = (change: Partial<SetupEnv> & { newest?: string; list?: string; pick?: (options: string[]) => string | undefined } = {}): Fake => {
		const env: Fake = {
			urls: [],
			ran: [],
			notices: [],
			asked: [],
			stored: undefined,
			bal: async (args) => {
				env.ran.push(args.join(" "));
				return { stdout: args[1] === "list" ? (change.list ?? "") : "", stderr: "", code: 0 };
			},
			fetchJson: async (url) => {
				env.urls.push(url);
				return url.includes("/tools/discover") ? { version: "0.1.1" } : { major: change.newest ?? "2201.14.0" };
			},
			now: () => 1_000,
			readRegistry: () => REGISTRY,
			readState: () => env.stored,
			writeState: (text) => {
				env.stored = text;
			},
			lock: () => true,
			unlock: () => {},
			interactive: true,
			live: () => true,
			remind: () => {},
			notify: (_level, text) => env.notices.push(text),
			choose: async (_title, options) => {
				env.asked.push(options);
				return change.pick?.(options);
			},
			...change,
		};
		return env;
	};
	const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
	const installed = (missingTools: string[] = []) => ({ kind: "installed" as const, distribution: "2201.14.0", missingTools });

	it("asks Central only about the distribution after installing discover, and updates nothing", async () => {
		const env = fake();
		createSessionSetup(env).act(installed(["discover"]));
		await settle();
		expect(env.urls).toEqual([distributionUrl("2201.14.0")]);
		expect(env.ran).toEqual(["tool pull discover"]);
	});

	it("asks about both when discover was already there, and says nothing when bal tool update left it where it was", async () => {
		const env = fake();
		createSessionSetup(env).act(installed());
		await settle();
		expect(env.urls).toHaveLength(2);
		expect(env.ran).toEqual(["tool update discover"]);
		expect(env.notices).toEqual([]);
	});

	it("checks nothing in a one-shot run, where nobody can answer an offer", async () => {
		const env = fake({ interactive: false });
		createSessionSetup(env).act(installed());
		await settle();
		expect(env.urls).toEqual([]);
	});

	it("records a check that reached nothing, so the next session waits", async () => {
		const env = fake({ fetchJson: async () => undefined });
		createSessionSetup(env).act(installed());
		await settle();
		expect(readState(env.stored)).toEqual({ checkedAt: 0, failedAt: 1_000 });
	});

	it("shows the update dialog after a turn, with the patch bal dist list names, and pulls the version the user picks", async () => {
		const env = fake({ newest: "2201.15.0", list: "Swan Lake channel\n\n  2201.15.0 - latest\n  2201.14.2\n* 2201.14.0\n", pick: (options) => options[0] });
		const setup = createSessionSetup(env);
		setup.act(installed());
		await settle();
		expect(env.asked).toEqual([]);
		setup.turnEnded();
		await settle();
		expect(env.asked[0]).toEqual(["Update to 2201.14.2 (a patch of 2201.14)", "Update to 2201.15.0 (a new release: it may change how your projects build)", "Not now (ask again tomorrow)", "Skip these versions"]);
		// `dist list` only reads, so it runs beside the queued discover update.
		expect([...env.ran].sort()).toEqual(["dist list", "dist pull 2201.14.2", "tool update discover"]);
		expect(env.notices.at(-1)).toBe("Ballerina 2201.14.2 is installed and active. Run /reload to use it in this session.");
		// Once per check: the next turn asks nothing.
		setup.turnEnded();
		await settle();
		expect(env.asked).toHaveLength(1);
	});

	it("records a skip and asks nothing on Not now", async () => {
		const skip = fake({ newest: "2201.14.2", pick: (options) => options.at(-1) });
		const setup = createSessionSetup(skip);
		setup.act(installed());
		await settle();
		setup.turnEnded();
		await settle();
		expect(readState(skip.stored)?.skipped).toBe("2201.14.2");
		expect(skip.ran).not.toContain("dist pull 2201.14.2");

		const later = fake({ newest: "2201.14.2", pick: (options) => options.find((option) => option.startsWith("Not now")) });
		const again = createSessionSetup(later);
		again.act(installed());
		await settle();
		again.turnEnded();
		await settle();
		expect(readState(later.stored)?.skipped).toBeUndefined();
		expect(later.ran).toEqual(["tool update discover"]);
	});

	it("leaves the pull to the session that holds the lock, and says so", async () => {
		const env = fake({ newest: "2201.14.2", pick: (options) => options[0], lock: () => false });
		const setup = createSessionSetup(env);
		setup.act(installed());
		await settle();
		setup.turnEnded();
		await settle();
		expect(env.ran).toEqual([]);
		expect(env.notices.at(-1)).toContain("Another session is installing or updating Ballerina right now");
		expect(DIST_TIMEOUT_MS).toBeGreaterThan(60_000);
	});
});
