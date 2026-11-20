/**
 * Whether this machine has what the product needs from Ballerina (pure: the
 * caller supplies the file reads and the command runner): the `bal` command,
 * a Java runtime for it, a distribution the product's knowledge was checked
 * against, and the `bal` tools its text tells the model to use. What is
 * missing becomes one notice for the model, which points at the
 * `ballerina-setup` skill. Ballerina itself is installed only with the
 * user's consent, which that skill asks for and the permission gate holds.
 * A missing tool from `REQUIRED_TOOLS` is the exception: the product cannot
 * look a library up without it, so the extension installs it itself, without
 * asking (setup-session.ts; the owner's call, 2026-11-18).
 *
 * Two probes. `probeFiles` reads what the `bal` launcher itself reads (the
 * active distribution, the Java runtime that distribution's launcher names,
 * the tool registry) in a few milliseconds, so the notice can join the
 * session's first request. It answers only for the installer layout it
 * knows; anywhere else (Windows, a layout it does not recognize, a file it
 * cannot parse) it answers nothing, and `probeBallerina` asks `bal` itself,
 * which starts a JVM per command.
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
	/** `bal` is there but finds no Java runtime, so every `bal` command fails. */
	| { kind: "noJava"; distribution?: string }
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
	if (!distribution) {
		if (JAVA_ERROR.test(`${version.stdout}\n${version.stderr}`)) return { kind: "noJava" };
		return notStarted(version) ? { kind: "missing" } : { kind: "unknown" };
	}
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

/** What a distribution's launcher prints when it finds no Java runtime. */
const JAVA_ERROR = /JAVA_HOME is not defined correctly|You must set the JAVA_HOME variable/;

/** What `probeFiles` reads; `index.ts` passes `node:fs` and the process's environment. */
export interface Machine {
	platform: string;
	/** The process's `PATH`. */
	path: string | undefined;
	/** The home folder, where `bal` keeps `~/.ballerina`. */
	home: string;
	javaHome: string | undefined;
	isFile(path: string): boolean;
	isDir(path: string): boolean;
	/** The file's text, or undefined when it cannot be read. */
	read(path: string): string | undefined;
	realpath(path: string): string | undefined;
}

/** The `bal` tool registry, under the home folder. */
export const TOOL_REGISTRY = ".ballerina/.config/bal-tools.toml";

/** One `[[tool]]` entry of the registry, read a line per key. */
export interface RegistryTool {
	id?: string;
	version?: string;
	/** Absent for a tool from Ballerina Central. */
	repository?: string;
	active: boolean;
}

/** The registry's `[[tool]]` entries. */
export function registryTools(toml: string): RegistryTool[] {
	return toml
		.split(/^\[\[tool\]\]\s*$/m)
		.slice(1)
		.map((block) => ({
			id: /^id\s*=\s*"([^"]+)"/m.exec(block)?.[1],
			version: /^version\s*=\s*"([^"]+)"/m.exec(block)?.[1],
			repository: /^repository\s*=\s*"([^"]*)"/m.exec(block)?.[1],
			active: /^active\s*=\s*true\s*$/m.test(block),
		}));
}

/** The tool ids the registry marks active, or undefined when an entry has no id. */
export function activeToolIds(toml: string): string[] | undefined {
	const tools = registryTools(toml);
	if (tools.some((tool) => !tool.id)) return undefined;
	return tools.filter((tool) => tool.active).map((tool) => tool.id as string);
}

/**
 * The machine's Ballerina, read from files the way the `bal` launcher reads
 * them (its installer layout: `<root>/bin/bal`, `<root>/distributions/`,
 * `<root>/dependencies/`), or undefined when this probe cannot tell.
 */
export function probeFiles(machine: Machine): BallerinaStatus | undefined {
	if (machine.platform === "win32") return undefined;
	// Not on PATH: let `bal` itself be asked, which fails at once without a JVM.
	const bal = (machine.path ?? "").split(":").filter(Boolean).map((dir) => `${dir.replace(/\/+$/, "")}/bal`).find((file) => machine.isFile(file));
	const real = bal && machine.realpath(bal);
	if (!real || !real.endsWith("/bin/bal")) return undefined;
	const root = real.slice(0, -"/bin/bal".length);
	const distributions = `${root}/distributions`;
	// The launcher's rule: the installation's choice, overridden by the user's when that distribution exists.
	let active = machine.read(`${distributions}/ballerina-version`)?.trim();
	const chosen = machine.read(`${machine.home}/.ballerina/ballerina-version`)?.trim();
	if (chosen && machine.isDir(`${distributions}/${chosen}`)) active = chosen;
	const distribution = active && /^ballerina-(\d+\.\d+\.\d+)/.exec(active)?.[1];
	if (!active || !distribution || !machine.isDir(`${distributions}/${active}`)) return undefined;

	// The distribution's launcher names the runtime it ships with. Without that runtime the launcher's own
	// search decides (JAVA_HOME, and on macOS the system's JDK registry), which this probe does not repeat:
	// a valid JAVA_HOME settles it, anything else is left to `bal`.
	const runtime = /^JAVA_PATH=\$BALLERINA_HOME\/\.\.\/\.\.\/(dependencies\/\S+?)\s*$/m.exec(machine.read(`${distributions}/${active}/bin/bal`) ?? "")?.[1];
	if (!runtime) return undefined;
	if (!machine.isDir(`${root}/${runtime}`) && !(machine.javaHome && machine.isFile(`${machine.javaHome}/bin/java`))) return undefined;

	const toml = machine.read(`${machine.home}/${TOOL_REGISTRY}`);
	const tools = toml === undefined ? [] : activeToolIds(toml);
	if (!tools) return undefined;
	return { kind: "installed", distribution, missingTools: REQUIRED_TOOLS.filter((tool) => !tools.includes(tool)) };
}

const toolList = (tools: readonly string[]) => tools.map((tool) => `\`${tool}\``).join(", ");

/** For the model while the extension installs the tools. */
export function installingNotice(tools: readonly string[]): string {
	return `The \`bal\` ${tools.length === 1 ? "tool" : "tools"} ${toolList(tools)} ${tools.length === 1 ? "is" : "are"} being installed in the background now, which takes a few seconds to a minute. Do not install ${tools.length === 1 ? "it" : "them"} yourself. If \`bal ${tools[0]}\` fails as an unknown command before then, do other work first and run it again.`;
}

/** For the model when the extension's install failed: it installs the tool itself, still without asking. */
export function installFailedNotice(tool: string, detail: string): string {
	return `Installing the \`bal\` tool \`${tool}\` in the background failed (${detail}), so \`bal ${tool}\` does not work yet. Run \`bal tool pull ${tool}\` yourself now, without asking: this product needs it. If that fails too, tell the user what failed and load the \`${SETUP_SKILL}\` skill.`;
}

/** For the user once a tool is in place. */
export function installedMessage(tool: string): string {
	return `Installed the bal tool \`${tool}\` (library lookup) into ~/.ballerina. Remove it with \`bal tool remove ${tool}\`.`;
}

/** The first line worth showing from a failed command's output. */
export function failureDetail(result: CommandResult): string {
	const line = `${result.stderr}\n${result.stdout}`.split("\n").map((text) => text.trim()).find((text) => text.length > 0);
	return line ? line.slice(0, 200) : `exit code ${result.code}`;
}

/**
 * The notice for the model, or undefined when nothing is missing. A missing
 * required tool is not in it: the extension installs that itself
 * (setup-session.ts). In a session with an interface the model asks the user
 * about a missing `bal` or Java, and the product's own dialog offers a
 * distribution update; in a one-shot run nobody can answer, so the model
 * does the task as far as it goes and reports what is missing.
 */
export function setupNotice(status: BallerinaStatus, interactive: boolean): string | undefined {
	const consent = interactive
		? `In your next reply, before the task's work, tell the user what is missing and ask whether to install it, even when the current task does not need it; load the \`${SETUP_SKILL}\` skill for the procedure. Never install or update anything without the user's yes, except the \`discover\` tool.`
		: `Nobody can answer a question in this run: do the task as far as it can go, then say in your final message what is missing and that the \`${SETUP_SKILL}\` skill sets it up. Do not install or update anything.`;
	if (status.kind === "missing") {
		return `Ballerina is not installed on this machine: the \`bal\` command was not found. Builds, runs, tests, library lookup and compiler diagnostics will not work until it is installed, with its \`discover\` tool. ${consent}`;
	}
	if (status.kind === "noJava") {
		return `Ballerina${status.distribution ? ` ${status.distribution}` : ""} is installed, but it finds no Java runtime, so every \`bal\` command fails with "Error: JAVA_HOME is not defined correctly." Builds, runs, tests, library lookup and compiler diagnostics will not work until that is fixed. ${consent}`;
	}
	if (status.kind !== "installed" || compareDistributions(status.distribution, MIN_DISTRIBUTION) >= 0) return undefined;
	const old = `The active Ballerina distribution is ${status.distribution}, older than ${MIN_DISTRIBUTION}, the oldest one this product is checked against: some syntax and library advice may not hold on it.`;
	return interactive
		? `${old} The product offers the user an update itself, so do not raise it; if the user asks to update, load the \`${SETUP_SKILL}\` skill.`
		: `${old} Mention it in your final message. Do not install or update anything.`;
}
