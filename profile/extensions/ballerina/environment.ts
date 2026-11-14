/**
 * Whether this machine has what the product needs from Ballerina (pure: the
 * caller supplies the command runner): the `bal` command, a distribution the
 * product's knowledge was checked against, and the `bal` tools its text tells
 * the model to use. What is missing becomes one notice for the model, which
 * points at the `ballerina-setup` skill; nothing is installed without the
 * user's consent, which that skill asks for and the permission gate holds.
 */

/** The oldest distribution the product's Ballerina knowledge was checked against. */
export const MIN_DISTRIBUTION = "2201.14.0";
/** `bal` tools the product's text relies on, by tool id (`bal tool pull <id>`). */
export const REQUIRED_TOOLS = ["discover"] as const;
export const SETUP_SKILL = "ballerina-setup";

export type BallerinaStatus =
	/** The command could not be started. */
	| { kind: "missing" }
	| { kind: "installed"; distribution: string; missingTools: string[] }
	/** `bal` ran but its answer could not be read: say nothing rather than guess. */
	| { kind: "unknown" };

export interface CommandResult {
	stdout: string;
	stderr: string;
	code: number;
}
/** Runs a command; rejects when it cannot be started. */
export type RunCommand = (command: string, args: string[]) => Promise<CommandResult>;

/** `x.y.z` of the active distribution, from `bal version`. */
export function distributionOf(versionOutput: string): string | undefined {
	return /Ballerina\s+(\d+\.\d+\.\d+)/.exec(versionOutput)?.[1] ?? /(\d+\.\d+\.\d+)/.exec(versionOutput)?.[1];
}

/** The tool ids in `bal tool list`'s table. */
export function toolIds(listOutput: string): string[] {
	const ids: string[] = [];
	for (const line of listOutput.split("\n")) {
		const cell = /^\s*\|\s*([A-Za-z0-9_.-]+)\s*\|/.exec(line)?.[1];
		if (cell && cell !== "TOOL" && !/^-+$/.test(cell)) ids.push(cell);
	}
	return ids;
}

/** -1, 0 or 1 for two dotted versions. */
export function compareDistributions(a: string, b: string): number {
	const [x, y] = [a, b].map((version) => version.split(".").map(Number));
	for (let i = 0; i < 3; i++) {
		const difference = (x?.[i] ?? 0) - (y?.[i] ?? 0);
		if (difference !== 0) return Math.sign(difference);
	}
	return 0;
}

const notStarted = (result: CommandResult) => result.code === 127 || /ENOENT|not found|not recognized/i.test(result.stderr);

/** Asks `bal` what is installed. Never rejects. */
export async function probeBallerina(run: RunCommand): Promise<BallerinaStatus> {
	let version: CommandResult;
	try {
		version = await run("bal", ["version"]);
	} catch {
		return { kind: "missing" };
	}
	const distribution = distributionOf(version.stdout);
	if (!distribution) return notStarted(version) ? { kind: "missing" } : { kind: "unknown" };
	let missingTools: string[] = [];
	try {
		const list = await run("bal", ["tool", "list"]);
		// An unreadable list is not taken as "nothing installed".
		if (list.code === 0) {
			const installed = new Set(toolIds(list.stdout));
			missingTools = REQUIRED_TOOLS.filter((tool) => !installed.has(tool));
		}
	} catch {}
	return { kind: "installed", distribution, missingTools };
}

/** The notice for the model, or undefined when nothing is missing. */
export function setupNotice(status: BallerinaStatus): string | undefined {
	const consent = `Load the \`${SETUP_SKILL}\` skill for the procedure. Tell the user what is missing and ask before installing or updating anything; never install on your own.`;
	if (status.kind === "missing") {
		return `Ballerina is not installed on this machine: the \`bal\` command was not found. Builds, runs, tests, library lookup and compiler diagnostics will not work until it is installed. ${consent}`;
	}
	if (status.kind !== "installed") return undefined;
	const parts: string[] = [];
	if (compareDistributions(status.distribution, MIN_DISTRIBUTION) < 0) {
		parts.push(`The active Ballerina distribution is ${status.distribution}, older than ${MIN_DISTRIBUTION}, the oldest one this product is checked against: some syntax and library advice may not hold on it.`);
	}
	if (status.missingTools.length > 0) {
		parts.push(`The \`bal\` ${status.missingTools.length === 1 ? "tool" : "tools"} ${status.missingTools.map((tool) => `\`${tool}\``).join(", ")} ${status.missingTools.length === 1 ? "is" : "are"} not installed, so \`bal ${status.missingTools[0]}\` will fail.`);
	}
	return parts.length > 0 ? `${parts.join(" ")} ${consent}` : undefined;
}
