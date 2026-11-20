/**
 * What a session start does about Ballerina once the machine's status is
 * known, with every outside effect passed in (no pi imports): the setup
 * notice for the model, the background install of a missing required tool,
 * the daily update check (`discover` updated without asking), and the
 * dialog after the first turn that offers a newer distribution and runs
 * `bal dist pull` for the one the user picks. index.ts binds the effects to
 * pi, `node:fs` and `fetch`.
 *
 * Everything that writes to `~/.ballerina` runs one at a time: in turn
 * within this session, and under the install lock (install-lock.ts) across
 * sessions and processes.
 */
import { type BallerinaStatus, type CommandResult, failureDetail, installedMessage, installFailedNotice, installingNotice, setupNotice } from "./environment.ts";
import {
	activeDiscover,
	busyMessage,
	DISCOVER_URL,
	discoverUpdatedMessage,
	distributionUrl,
	dueForCheck,
	failedCheck,
	latestDiscover,
	latestDistribution,
	newestPatch,
	planUpdates,
	readState,
	releaseLine,
	type UpdateState,
	updateDialog,
	updatedMessage,
	updatingMessage,
} from "./updates.ts";

export const SETUP_REMINDER_KEY = "ballerina-setup";
export const TOOLS_REMINDER_KEY = "ballerina-tools";

/** `bal dist list` reads Central: a JVM start and one request. */
export const LIST_TIMEOUT_MS = 60_000;
/** A tool's download from Ballerina Central, on a slow line. */
export const TOOL_TIMEOUT_MS = 300_000;
/** A distribution with its runtime, a few hundred megabytes, on a slow line. */
export const DIST_TIMEOUT_MS = 30 * 60_000;

export interface SetupEnv {
	/** Runs `bal` with these arguments; never rejects. */
	bal(args: string[], timeoutMs: number): Promise<CommandResult>;
	/** Ballerina Central's JSON answer, or undefined when none came. */
	fetchJson(url: string): Promise<unknown>;
	now(): number;
	/** `bal-tools.toml`'s text, or undefined when it cannot be read. */
	readRegistry(): string | undefined;
	/** The stored update state's text, or undefined. */
	readState(): string | undefined;
	/** Store the update state; a failure only means the check runs again next session. */
	writeState(text: string): void;
	/** Take the install lock; false while another session holds it. */
	lock(): boolean;
	unlock(): void;
	/**
	 * Whether the session has a terminal or RPC interface. A one-shot run
	 * skips the update check and the dialog: nobody is there to answer.
	 */
	interactive: boolean;
	/** False once the session ended; work in flight then stops. */
	live(): boolean;
	/** A reminder for the model, dropped once the session ended. */
	remind(key: string, text: string): void;
	/** A notice for the user, dropped once the session ended. */
	notify(level: "info" | "warning", text: string): void;
	/** A choice for the user; undefined when they dismissed it. */
	choose(title: string, options: string[]): Promise<string | undefined>;
}

export interface SessionSetup {
	/** Act on the machine's status: the notice, the install, the update check. */
	act(status: BallerinaStatus): void;
	/** A prompt starts: an install still running reaches the model on this prompt's request, once. */
	promptStarted(): void;
	/** The model's turn ended: the time to show an update dialog the check left waiting. */
	turnEnded(): void;
}

/** A newer distribution to offer: the newest patch of the active line, the newest release on another line, or both. */
interface Offer {
	current: string;
	patch?: string;
	release?: string;
}

export function createSessionSetup(env: SetupEnv): SessionSetup {
	// A missing required tool is installed here, never left to the model or the user's yes: without it there is no library lookup.
	let installing: string[] = [];
	// The offer the update check found, shown once at the end of a turn.
	let pending: Offer | undefined;

	let queue: Promise<unknown> = Promise.resolve();
	/** Run `work` after this session's earlier writes, under the install lock; "busy" when another session holds it. */
	const exclusive = <T>(work: () => Promise<T>): Promise<T | "busy"> => {
		const run = queue.then(async () => {
			if (!env.lock()) return "busy" as const;
			try {
				return await work();
			} finally {
				env.unlock();
			}
		});
		queue = run.catch(() => {});
		return run;
	};

	const writeState = (state: UpdateState) => env.writeState(`${JSON.stringify(state)}\n`);

	const installTools = async (tools: string[]) => {
		installing = [...tools];
		// When another session holds the lock it is installing them: the model hears they are on their way.
		await exclusive(async () => {
			for (const tool of tools) {
				const result = await env.bal(["tool", "pull", tool], TOOL_TIMEOUT_MS);
				if (!env.live()) return;
				installing = installing.filter((name) => name !== tool);
				if (result.code === 0) {
					env.notify("info", installedMessage(tool));
					continue;
				}
				const detail = failureDetail(result);
				env.remind(`${TOOLS_REMINDER_KEY}:${tool}:failed`, installFailedNotice(tool, detail));
				env.notify("warning", `Could not install the bal tool \`${tool}\`: ${detail}`);
			}
		});
	};

	const updateDiscover = (from: string) =>
		exclusive(async () => {
			const result = await env.bal(["tool", "update", "discover"], TOOL_TIMEOUT_MS);
			if (!env.live()) return;
			const after = activeDiscover(env.readRegistry() ?? "")?.version;
			// `bal tool update` exits 0 without a change when the newest version does not fit this distribution.
			if (result.code === 0) {
				if (after !== from) env.notify("info", discoverUpdatedMessage(from, after));
			} else env.notify("warning", `Could not update the bal tool \`discover\`: ${failureDetail(result)}`);
		});

	// At most once a day. A `discover` installed this session is already the newest, so Central is not asked about it.
	const checkUpdates = async (distribution: string, discoverJustInstalled: boolean) => {
		const state = readState(env.readState());
		const now = env.now();
		if (!dueForCheck(state, now)) return;
		const [tool, newest] = await Promise.all([discoverJustInstalled ? undefined : env.fetchJson(DISCOVER_URL), env.fetchJson(distributionUrl(distribution))]);
		if (!env.live()) return;
		// Offline: try again in a few hours, not at every session start.
		if (tool === undefined && newest === undefined) return writeState(failedCheck(state, now));
		const discover = discoverJustInstalled ? undefined : activeDiscover(env.readRegistry() ?? "");
		const plan = planUpdates({ now, state, discover, latestDiscover: latestDiscover(tool), distribution, latestDistribution: latestDistribution(newest) });
		writeState(plan.state);
		if (plan.updateDiscover && discover) void updateDiscover(discover.version);
		if (!plan.newer) return;
		if (releaseLine(plan.newer) === releaseLine(distribution)) {
			pending = { current: distribution, patch: plan.newer };
			return;
		}
		// The newest is on another line: `bal dist list` names the newest patch of this one, if there is one.
		const list = await env.bal(["dist", "list"], LIST_TIMEOUT_MS);
		if (!env.live()) return;
		const patch = list.code === 0 ? newestPatch(list.stdout, distribution) : undefined;
		pending = { current: distribution, release: plan.newer, ...(patch ? { patch } : {}) };
	};

	const offerUpdate = async (offer: Offer) => {
		const { title, choices } = updateDialog(offer.current, offer.patch, offer.release);
		const label = await env.choose(title, choices.map((choice) => choice.label));
		const choice = choices.find((candidate) => candidate.label === label);
		// Dismissed or "Not now": nothing is recorded, so tomorrow's check offers it again.
		if (!env.live() || !choice || choice.kind === "later") return;
		if (choice.kind === "skip") {
			writeState({ ...(readState(env.readState()) ?? { checkedAt: env.now() }), skipped: choice.version });
			return;
		}
		env.notify("info", updatingMessage(choice.version));
		const outcome = await exclusive(() => env.bal(["dist", "pull", choice.version], DIST_TIMEOUT_MS));
		if (outcome === "busy") env.notify("warning", busyMessage);
		else if (outcome.code === 0) env.notify("info", updatedMessage(choice.version));
		else env.notify("warning", `Could not update Ballerina to ${choice.version}: ${failureDetail(outcome)}`);
	};

	return {
		act(status) {
			if (!env.live()) return;
			// With `bal` absent or without Java there is nothing to install a tool into.
			const install = status.kind === "installed" ? status.missingTools : [];
			const text = setupNotice(status, env.interactive);
			if (text) env.remind(SETUP_REMINDER_KEY, text);
			if (install.length > 0) void installTools(install);
			if (status.kind === "installed" && env.interactive) void checkUpdates(status.distribution, install.includes("discover"));
		},
		promptStarted() {
			if (installing.length > 0) env.remind(TOOLS_REMINDER_KEY, installingNotice(installing));
			installing = [];
		},
		turnEnded() {
			const offer = pending;
			pending = undefined;
			if (offer && env.live()) void offerUpdate(offer);
		},
	};
}
