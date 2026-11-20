/**
 * Keeping Ballerina current (pure: the caller fetches and runs commands).
 * The `discover` tool is updated without asking, as it is installed: the
 * product's library lookup depends on it (the owner's call, 2026-11-18). A
 * newer Ballerina distribution is only offered, in the product's own dialog
 * after the session's first turn, and the extension runs `bal dist pull`
 * after the user picks a version (the owner's call, 2026-11-20): an update
 * applies to every project on the machine and can change how it builds.
 *
 * The newest versions come from Ballerina Central's HTTP API, the one the
 * `bal` tool itself calls, so a check costs two small requests and no JVM;
 * it runs at most once a day per state folder (`UpdateState`), and three
 * hours after a check that reached nothing. Central's `latest` answer names
 * the newest distribution whatever version is asked about, so the newest
 * patch of the active release line comes from `bal dist list`, run only
 * when the newest distribution is on another line.
 */
import { compareDistributions, registryTools } from "./environment.ts";

/** The newest `discover` on Ballerina Central (its `version` field). */
export const DISCOVER_URL = "https://api.central.ballerina.io/2.0/registry/tools/discover";
/** The newest distribution (`{ major, minor, patch }`, each the newest of all whatever `version` and `type` say: ran 2026-11-20). */
export const distributionUrl = (current: string) =>
	`https://api.central.ballerina.io/2.0/update-tool/distributions/latest?version=${encodeURIComponent(current)}&type=patch`;
/** How often the check may go to the network. */
export const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
/** How long after a check that reached nothing the next one may run. */
export const RETRY_MS = 3 * 60 * 60 * 1000;
/** The file under the product's state folder that holds `UpdateState`. */
export const STATE_FILE = "ballerina-updates.json";

/** What the last check left behind. */
export interface UpdateState {
	/** When the last check reached Central (ms since the epoch); 0 before the first. */
	checkedAt: number;
	/** When the last check reached nothing, if it came after `checkedAt`. */
	failedAt?: number;
	/** The newest distribution the user chose to skip: nothing up to it is offered again. */
	skipped?: string;
}

const VERSION = /^\d+\.\d+\.\d+$/;
const isVersion = (value: unknown): value is string => typeof value === "string" && VERSION.test(value);

/** The state as stored, or undefined when it is missing or not ours. */
export function readState(text: string | undefined): UpdateState | undefined {
	if (!text) return undefined;
	try {
		const value = JSON.parse(text) as Partial<UpdateState>;
		if (typeof value.checkedAt !== "number") return undefined;
		return {
			checkedAt: value.checkedAt,
			...(typeof value.failedAt === "number" ? { failedAt: value.failedAt } : {}),
			...(isVersion(value.skipped) ? { skipped: value.skipped } : {}),
		};
	} catch {
		return undefined;
	}
}

/** Whether the check may go to the network now. */
export function dueForCheck(state: UpdateState | undefined, now: number): boolean {
	if (!state) return true;
	// A clock set back counts as due rather than leaving the check stuck.
	if (state.failedAt !== undefined && now >= state.failedAt && now - state.failedAt < RETRY_MS) return false;
	return now - state.checkedAt >= CHECK_INTERVAL_MS || now < state.checkedAt;
}

/** The state after a check that reached nothing: try again in `RETRY_MS`. */
export const failedCheck = (state: UpdateState | undefined, now: number): UpdateState => ({ ...(state ?? { checkedAt: 0 }), failedAt: now });

/** The newest `discover` version in Central's answer, when it holds one. */
export function latestDiscover(answer: unknown): string | undefined {
	const version = (answer as { version?: unknown } | null)?.version;
	return isVersion(version) ? version : undefined;
}

/** The newest distribution in Central's answer, when it holds one. */
export function latestDistribution(answer: unknown): string | undefined {
	const value = answer as { major?: unknown } | null;
	return isVersion(value?.major) ? value.major : undefined;
}

/** A distribution's release line: `2201.14` for `2201.14.3`. */
export const releaseLine = (version: string) => version.split(".").slice(0, 2).join(".");

/** The newest version on `current`'s release line that is newer than it, from `bal dist list`'s output. */
export function newestPatch(listOutput: string, current: string): string | undefined {
	const line = releaseLine(current);
	let newest: string | undefined;
	for (const match of listOutput.matchAll(/^\s*\*?\s*(\d+\.\d+\.\d+)\b/gm)) {
		const version = match[1] as string;
		if (releaseLine(version) === line && compareDistributions(version, newest ?? current) > 0) newest = version;
	}
	return newest;
}

/**
 * The `discover` entry `bal-tools.toml` marks active: its version, and
 * whether it came from Ballerina Central (an entry naming another
 * repository, a local build, is never updated).
 */
export function activeDiscover(toml: string): { version: string; central: boolean } | undefined {
	const entry = registryTools(toml).find((tool) => tool.id === "discover" && tool.active);
	return entry?.version && isVersion(entry.version) ? { version: entry.version, central: entry.repository === undefined || entry.repository === "central" } : undefined;
}

/** What to do with what Central answered. */
export interface UpdatePlan {
	/** Run `bal tool update discover`: Central has a newer one than the active Central copy. */
	updateDiscover: boolean;
	/** The newest distribution, when it is newer than the active one and than what the user skipped. */
	newer?: string;
	/** The state to store. */
	state: UpdateState;
}

export function planUpdates(input: {
	now: number;
	state: UpdateState | undefined;
	discover: { version: string; central: boolean } | undefined;
	latestDiscover: string | undefined;
	distribution: string;
	latestDistribution: string | undefined;
}): UpdatePlan {
	const { discover, distribution, latestDistribution: newest, state } = input;
	const updateDiscover = !!discover?.central && !!input.latestDiscover && compareDistributions(input.latestDiscover, discover.version) > 0;
	const newer = newest && compareDistributions(newest, distribution) > 0 && (!state?.skipped || compareDistributions(newest, state.skipped) > 0) ? newest : undefined;
	return { updateDiscover, ...(newer ? { newer } : {}), state: { checkedAt: input.now, ...(state?.skipped ? { skipped: state.skipped } : {}) } };
}

/** One choice of the update dialog. */
export type UpdateChoice = { kind: "update"; version: string; label: string } | { kind: "later"; label: string } | { kind: "skip"; version: string; label: string };

/**
 * The update dialog for the active distribution, the newest patch of its
 * line (when there is a newer one) and the newest release (when it is on
 * another line).
 */
export function updateDialog(current: string, patch: string | undefined, release: string | undefined): { title: string; choices: UpdateChoice[] } {
	const newest = release ?? patch;
	if (!newest) throw new Error("updateDialog needs a newer version");
	const choices: UpdateChoice[] = [];
	if (patch) choices.push({ kind: "update", version: patch, label: `Update to ${patch} (a patch of ${releaseLine(current)})` });
	if (release) choices.push({ kind: "update", version: release, label: `Update to ${release} (a new release: it may change how your projects build)` });
	choices.push({ kind: "later", label: "Not now (ask again tomorrow)" });
	choices.push({ kind: "skip", version: newest, label: patch && release ? "Skip these versions" : `Skip ${newest}` });
	return {
		title: `A newer Ballerina is available; this machine runs ${current}. An update applies to every Ballerina project on this machine.`,
		choices,
	};
}

/** For the user while `bal dist pull` runs, and when it ends. */
export const updatingMessage = (version: string) => `Updating Ballerina to ${version} in the background. It downloads the distribution, which can take a few minutes.`;
export const updatedMessage = (version: string) => `Ballerina ${version} is installed and active. Run /reload to use it in this session.`;
export const busyMessage = "Another session is installing or updating Ballerina right now. Try again when it has finished.";

/** For the user once `discover` is updated. */
export function discoverUpdatedMessage(from: string, to: string | undefined): string {
	return `Updated the bal tool \`discover\` from ${from}${to ? ` to ${to}` : ""}.`;
}
