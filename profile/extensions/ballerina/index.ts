/**
 * The Ballerina extension's main-session entry: the tools and secret
 * redaction every session gets (session.ts), the `# Ballerina` section of
 * the system prompt (prompt.ts), one notice when Ballerina is missing or
 * out of date on this machine (environment.ts), which points the model at
 * the `ballerina-setup` skill, one notice for the user when the session
 * model sits below the tier the product works best on (tier-notice.ts), and
 * the `/visualize` command (visualize/visualize.ts), which shows the
 * integration's diagrams in a browser. Neither of the last two adds anything
 * to the model's request. A child session loads child.ts instead. Both
 * export their factory through the SDK's `productExtension`, which runs it
 * only under a profile that runs this folder (`Profile.extensions`).
 */

import { mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
	lspErrorDetail,
	lspFilesChanged,
	lspRequest,
	modelCapability,
	openInBrowser,
	productSetting,
	productExtension,
	productStateDir,
	queueNotice,
	REMINDER_CHANNEL,
	type ReminderPayload,
	SYSTEM_PROMPT_SECTION_CHANNEL,
	thinkingLevelsFor,
	type SystemPromptSection,
} from "../../../extensions/sdk/extension.ts";
import brand from "../../brand.json" with { type: "json" };
import { BALLERINA_SERVER, BI_JAR, jarPath, LAUNCHER_PATH, launcherArgs, parseLauncherCheck } from "../../ballerina/language-server.ts";
import { type CommandResult, type Machine, probeBallerina, probeFiles, TOOL_REGISTRY } from "./environment.ts";
import { ensureJar } from "./jar-download.ts";
import { STATE_FILE } from "./updates.ts";
import { LOCK_FILE, releaseLock, takeLock } from "./install-lock.ts";
import { createSessionSetup, type SessionSetup } from "./setup-session.ts";
import { ballerinaSection } from "./prompt.ts";
import { registerBallerinaSession } from "./session.ts";
import { createReasoningNotices } from "./reasoning-notice.ts";
import { REASONING_NOTICE_SETTING, TIER_NOTICE_SETTING } from "../../settings.ts";
import { isAtOrBelowDefault } from "../../thinking.ts";
import { createTierNotices } from "./tier-notice.ts";
import { type CommandUi, Visualizer } from "./visualize/visualize.ts";

export const BALLERINA_SECTION_ID = "ballerina";
export { SETUP_REMINDER_KEY, TOOLS_REMINDER_KEY } from "./setup-session.ts";
export const VISUALIZE_COMMAND = "visualize";
/** `bal` starts a JVM: slow on a cold machine, and never worth holding a session for. */
const PROBE_TIMEOUT_MS = 30_000;
/** One request to Ballerina Central's API for the newest versions. */
const VERSION_CHECK_TIMEOUT_MS = 10_000;
const BUNDLE_DIR = fileURLToPath(new URL("./visualize/bundle", import.meta.url));
const STATUS_KEY = "visualize";

/** The command's notices, confirm and reload, in the terminal interface (the only place the command runs). */
function commandUi(ctx: ExtensionCommandContext): CommandUi {
	return {
		notify: (text, level) => ctx.ui.notify(text, level),
		setStatus: (text) => ctx.ui.setStatus(STATUS_KEY, text),
		confirm: async (title, body) => (await ctx.ui.confirm(title, body)) === true,
		reload: () => ctx.reload(),
	};
}

/**
 * Print and JSON modes bind no interface, so a notice would go nowhere and
 * the page would end with the run: the command says so on stderr, which
 * those modes show, and starts nothing.
 */
export const NO_INTERFACE_MESSAGE = "/visualize needs the interactive terminal: the page lives as long as the session. Start the product without -p or --mode, then run /visualize.";

export default productExtension("ballerina", function ballerina(pi: ExtensionAPI) {
	registerBallerinaSession(pi);
	pi.events.emit(SYSTEM_PROMPT_SECTION_CHANNEL, { id: BALLERINA_SECTION_ID, place: "tail", render: ballerinaSection } satisfies SystemPromptSection);

	// Only a session with an interface that outlives the turn (the terminal, an RPC client) gets the
	// notices: a one-shot run would print them on every scripted call, with no way to turn them off.
	// The user's off switch (`settings` in profile/index.ts) is read at each boundary: it may have changed since the last.
	const noticeWanted = (ctx: ExtensionContext, setting: string) =>
		ctx.hasUI && (ctx.mode === "tui" || ctx.mode === "rpc") && productSetting(setting, ctx.cwd) !== false;

	// The user's notice when the session model sits below the floor: never in the request.
	const tierNotices = createTierNotices();
	const tierNotice = (ctx: ExtensionContext, model: ExtensionContext["model"]) => {
		if (!noticeWanted(ctx, TIER_NOTICE_SETTING)) return;
		const text = tierNotices.noticeFor(ctx.sessionManager.getSessionId(), model, modelCapability(model));
		// Joined with the other startup and model-switch notices.
		if (text) queueNotice(pi.events, ctx, "warning", text);
	};
	pi.on("session_start", (_event, ctx) => tierNotice(ctx, ctx.model));
	pi.on("model_select", (event, ctx) => tierNotice(ctx, event.model));

	// The user's notice when they raise the thinking level above the default (reasoning-notice.ts, which also
	// says which announced levels are not the user's pick: pi fits levels to a model and the base sets its own).
	const reasoningNotices = createReasoningNotices();
	pi.on("thinking_level_select", (event, ctx) => {
		if (isAtOrBelowDefault(event.level) || !noticeWanted(ctx, REASONING_NOTICE_SETTING)) return;
		const text = reasoningNotices.noticeFor(ctx.sessionManager.getSessionId(), event.level, event.previousLevel, thinkingLevelsFor(ctx.model));
		if (text) queueNotice(pi.events, ctx, "warning", text);
	});

	// The check never holds the session up. Reading Ballerina's files takes a
	// few milliseconds, so its notice joins the first request; only when the
	// files cannot tell does it ask `bal` itself, beside the session, and the
	// notice joins the next request after the answer is in. With Ballerina in
	// place it says nothing.
	let live = false;
	let visualizer: Visualizer | undefined;
	let setup: SessionSetup | undefined;
	pi.on("before_agent_start", () => setup?.promptStarted());
	pi.on("agent_end", () => setup?.turnEnded());
	pi.on("session_start", (_event, ctx) => {
		live = true;
		const stateFile = join(productStateDir(), STATE_FILE);
		const registry = join(homedir(), TOOL_REGISTRY);
		const lockFile = join(productStateDir(), LOCK_FILE);
		setup = createSessionSetup({
			// Through a promise: pi.exec throws at once on a session that /new, /resume or /reload replaced.
			bal: (args, timeout) => Promise.resolve().then(() => pi.exec("bal", args, { timeout })).catch(failedToStart),
			fetchJson: (url) =>
				fetch(url, { signal: AbortSignal.timeout(VERSION_CHECK_TIMEOUT_MS), headers: { accept: "application/json" } })
					.then((response) => (response.ok ? (response.json() as Promise<unknown>) : undefined))
					.catch(() => undefined),
			now: Date.now,
			interactive: ctx.hasUI && (ctx.mode === "tui" || ctx.mode === "rpc"),
			readRegistry: () => readText(registry),
			readState: () => readText(stateFile),
			writeState: (text) => {
				try {
					mkdirSync(productStateDir(), { recursive: true });
					writeFileSync(stateFile, text);
				} catch {}
			},
			lock: () => takeLock(lockFile),
			unlock: () => releaseLock(lockFile),
			live: () => live,
			remind: (key, text) => {
				if (live) pi.events.emit(REMINDER_CHANNEL, { key, text, placement: "last-append" } satisfies ReminderPayload);
			},
			notify: (level, text) => {
				if (live) queueNotice(pi.events, ctx, level, text);
			},
			choose: (title, options) => ctx.ui.select(title, options),
		});
		const { act } = setup;
		const fromFiles = probeFiles(thisMachine());
		if (fromFiles) act(fromFiles);
		else void probeBallerina((command, args) => pi.exec(command, args, { timeout: PROBE_TIMEOUT_MS })).then(act);
	});
	pi.on("session_shutdown", async () => {
		live = false;
		const running = visualizer;
		visualizer = undefined;
		await running?.stop();
	});

	const request = (file: string, method: string, params: unknown, timeoutMs: number) => lspRequest(pi.events, { server: BALLERINA_SERVER, file, method, params, timeoutMs });
	pi.registerCommand(VISUALIZE_COMMAND, {
		description: "Open the integration's diagrams in a browser: the overview and each flow, updated as the code changes",
		handler: async (_args, ctx) => {
			if (!ctx.hasUI) {
				process.stderr.write(`${NO_INTERFACE_MESSAGE}\n`);
				return;
			}
			visualizer ??= new Visualizer({
				platform: process.platform,
				cwd: ctx.cwd,
				productName: brand.name,
				bundleDir: BUNDLE_DIR,
				ensureJar: (progress, signal) => ensureJar({ pin: BI_JAR, target: jarPath(), ...progress, signal }),
				checkLauncher: async () => {
					const result = await pi.exec("sh", [LAUNCHER_PATH, "--check", ...launcherArgs(jarPath())], { timeout: PROBE_TIMEOUT_MS });
					return parseLauncherCheck(result.stdout);
				},
				request: (model) => request(model.routeFile, model.method, model.params, model.timeoutMs),
				errorDetail: lspErrorDetail,
				sync: (changes) => lspFilesChanged(pi.events, { server: BALLERINA_SERVER, changes }),
				openBrowser: openInBrowser,
			});
			// Returns at once: pi holds the user's input until a command handler returns, and the first start downloads 73 MB.
			visualizer.open(commandUi(ctx));
		},
	});
});

/** This process's machine, as the setup check's file probe reads it. */
function thisMachine(): Machine {
	const stat = (path: string) => {
		try {
			return statSync(path);
		} catch {
			return undefined;
		}
	};
	return {
		platform: process.platform,
		path: process.env.PATH,
		home: homedir(),
		javaHome: process.env.JAVA_HOME,
		isFile: (path) => stat(path)?.isFile() === true,
		isDir: (path) => stat(path)?.isDirectory() === true,
		read: readText,
		realpath: (path) => {
			try {
				return realpathSync(path);
			} catch {
				return undefined;
			}
		},
	};
}

/** A command that could not be started, as a failed result. */
const failedToStart = (error: unknown): CommandResult => ({ stdout: "", stderr: error instanceof Error ? error.message : String(error), code: -1 });

/** A file's text, or undefined when it cannot be read. */
function readText(path: string): string | undefined {
	try {
		return readFileSync(path, "utf8");
	} catch {
		return undefined;
	}
}
