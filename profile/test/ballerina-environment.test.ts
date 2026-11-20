/**
 * The Ballerina environment check: what `bal` reports becomes one notice
 * for the model, only when something is missing, and never an install.
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REMINDER_CHANNEL, type ReminderPayload } from "../../extensions/sdk/extension.ts";
import { createFakeCtx, createFakePi, flushNotices } from "../../test/unit/helpers/fake-pi.ts";
import { activeToolIds, type CommandResult, compareDistributions, distributionOf, type Machine, MIN_DISTRIBUTION, probeBallerina, probeFiles, REQUIRED_TOOLS, SETUP_SKILL, setupNotice, toolIds } from "../extensions/ballerina/environment.ts";
import ballerina, { SETUP_REMINDER_KEY, TOOLS_REMINDER_KEY } from "../extensions/ballerina/index.ts";

const VERSION = "Ballerina 2201.14.0-20260917-124200-7f273e6a (Swan Lake Update 14)\nLanguage specification 2024R1\nUpdate Tool 1.5.1\n";
const TOOLS = "|TOOL ID               |VERSION                        |\n|----------------------|-------------------------------|\n|migrate-mule          |1.2.11                         |\n|discover              |0.1.0                          |\n\n2 active tool versions found.\n";
const ok = (stdout: string): CommandResult => ({ stdout, stderr: "", code: 0 });
const runner = (answers: Record<string, CommandResult | Error>) => async (_command: string, args: string[]) => {
	const answer = answers[args.join(" ")];
	if (answer === undefined || answer instanceof Error) throw answer ?? new Error("spawn bal ENOENT");
	return answer;
};

describe("reading bal's answers", () => {
	it("reads the distribution and the tool ids", () => {
		expect(distributionOf(VERSION)).toBe("2201.14.0");
		expect(distributionOf("command not found")).toBeUndefined();
		expect(toolIds(TOOLS)).toEqual(["migrate-mule", "discover"]);
		expect(toolIds("No tools found.")).toEqual([]);
	});

	it("orders distributions", () => {
		expect(compareDistributions("2201.13.7", "2201.14.0")).toBe(-1);
		expect(compareDistributions("2201.14.0", "2201.14.0")).toBe(0);
		expect(compareDistributions("2201.14.1", "2201.14.0")).toBe(1);
	});
});

describe("the check", () => {
	it("says nothing when Ballerina and its tools are in place", async () => {
		const status = await probeBallerina(runner({ version: ok(VERSION), "tool list": ok(TOOLS) }));
		expect(status).toEqual({ kind: "installed", distribution: "2201.14.0", missingTools: [] });
		expect(setupNotice(status, true)).toBeUndefined();
	});

	it("reports a missing bal, whether the command cannot start or the shell says so", async () => {
		expect(await probeBallerina(runner({}))).toEqual({ kind: "missing" });
		expect(await probeBallerina(runner({ version: { stdout: "", stderr: "bal: command not found", code: 127 } }))).toEqual({ kind: "missing" });
		const notice = setupNotice({ kind: "missing" }, true);
		expect(notice).toContain("Ballerina is not installed");
		expect(notice).toContain(`\`${SETUP_SKILL}\` skill`);
		expect(notice).toContain("In your next reply, before the task's work, tell the user what is missing and ask whether to install it");
		expect(notice).toContain("Never install or update anything without the user's yes, except the `discover` tool.");
		expect(notice).toContain("with its `discover` tool");
		// A one-shot run: nobody can answer, so no question and no install.
		const oneShot = setupNotice({ kind: "missing" }, false);
		expect(oneShot).toContain("Nobody can answer a question in this run: do the task as far as it can go, then say in your final message what is missing");
		expect(oneShot).toContain("Do not install or update anything.");
		expect(oneShot).not.toContain("ask whether");
	});

	it("reports an old distribution, leaves a missing tool to the install, and never guesses from an answer it cannot read", async () => {
		const status = await probeBallerina(runner({ version: ok(VERSION.replace("2201.14.0", "2201.12.3")), "tool list": ok("No tools found.") }));
		expect(status).toEqual({ kind: "installed", distribution: "2201.12.3", missingTools: [...REQUIRED_TOOLS] });
		const notice = setupNotice(status, true);
		expect(notice).toContain(`2201.12.3, older than ${MIN_DISTRIBUTION}`);
		expect(notice).not.toContain("is not installed");
		// The product's own dialog offers the update.
		expect(notice).toContain("The product offers the user an update itself, so do not raise it");
		expect(setupNotice(status, false)).toContain("Mention it in your final message. Do not install or update anything.");
		// A tool list that failed is not "no tools"; an unreadable version is not "missing".
		expect(await probeBallerina(runner({ version: ok(VERSION), "tool list": { stdout: "", stderr: "boom", code: 1 } }))).toEqual({ kind: "installed", distribution: "2201.14.0", missingTools: [] });
		expect(await probeBallerina(runner({ version: ok("something else") }))).toEqual({ kind: "unknown" });
		expect(setupNotice({ kind: "unknown" }, true)).toBeUndefined();
	});
});

// The installer layout as the launchers read it: `<root>/bin/bal`, the active
// distribution in `distributions/ballerina-version`, the runtime its own
// launcher names under `dependencies/`, and the tool registry in the home.
const ROOT = "/opt/ballerina";
const DIST_LAUNCHER = 'JAVA_PATH=$BALLERINA_HOME/../../dependencies/jdk-25.0.3+9-jre\nif test -d "$JAVA_PATH"; then\n';
const REGISTRY = '# AUTO-GENERATED FILE. DO NOT MODIFY.\n\n[[tool]]\nid = "migen"\nversion = "1.0.2"\nactive = true\n\n[[tool]]\nid = "discover"\norg = "ballerina"\nversion = "0.1.0"\nactive = true\nforce = true\n';
const machine = (files: Record<string, string>, dirs: string[], change: Partial<Machine> = {}): Machine => ({
	platform: "linux",
	path: "/usr/bin:/usr/local/bin/",
	home: "/home/u",
	javaHome: undefined,
	isFile: (path) => path in files,
	isDir: (path) => dirs.includes(path),
	read: (path) => files[path],
	realpath: (path) => (path === "/usr/local/bin/bal" ? `${ROOT}/bin/bal` : path in files ? path : undefined),
	...change,
});
const installed = (change: Partial<Machine> = {}, extra: Record<string, string> = {}, dirs: string[] = []) =>
	machine(
		{
			"/usr/local/bin/bal": "#!/bin/bash",
			[`${ROOT}/distributions/ballerina-version`]: "ballerina-2201.14.0\n",
			[`${ROOT}/distributions/ballerina-2201.14.0/bin/bal`]: DIST_LAUNCHER,
			"/home/u/.ballerina/.config/bal-tools.toml": REGISTRY,
			...extra,
		},
		[`${ROOT}/distributions/ballerina-2201.14.0`, `${ROOT}/distributions/ballerina-2201.13.7`, `${ROOT}/dependencies/jdk-25.0.3+9-jre`, ...dirs],
		change,
	);

describe("reading Ballerina's files", () => {
	it("reads the active distribution, its runtime and the active tools without running bal", () => {
		expect(probeFiles(installed())).toEqual({ kind: "installed", distribution: "2201.14.0", missingTools: [] });
	});

	it("takes the user's distribution only when it exists, as the launcher does", () => {
		const chosen = (version: string) => installed({}, { "/home/u/.ballerina/ballerina-version": version, [`${ROOT}/distributions/ballerina-2201.13.7/bin/bal`]: DIST_LAUNCHER });
		expect(probeFiles(chosen("ballerina-2201.13.7\n"))).toMatchObject({ distribution: "2201.13.7" });
		expect(probeFiles(chosen("ballerina-2201.12.0"))).toMatchObject({ distribution: "2201.14.0" });
	});

	it("names a tool the registry lacks or marks inactive, and reads no registry as no tools", () => {
		const without = REGISTRY.replace('id = "discover"', 'id = "openapi"');
		expect(probeFiles(installed({}, { "/home/u/.ballerina/.config/bal-tools.toml": without }))).toMatchObject({ missingTools: ["discover"] });
		expect(probeFiles(installed({}, { "/home/u/.ballerina/.config/bal-tools.toml": REGISTRY.replace(/active = true\nforce/, "active = false\nforce") }))).toMatchObject({ missingTools: ["discover"] });
		const none = installed();
		expect(probeFiles({ ...none, read: (path) => (path.endsWith("bal-tools.toml") ? undefined : none.read(path)) })).toMatchObject({ missingTools: ["discover"] });
		expect(activeToolIds("[[tool]]\nversion = 1\n")).toBeUndefined();
	});

	it("leaves a missing bundled runtime to bal unless JAVA_HOME stands in, and reads no system JDK itself", () => {
		const gone = (change: Partial<Machine> = {}, extra: Record<string, string> = {}) => {
			const base = installed(change, extra);
			return { ...base, isDir: (path: string) => !path.includes("/dependencies/") && base.isDir(path) };
		};
		// The launcher's own search (JAVA_HOME's rules, macOS's JDK registry) decides the rest: `bal` is asked.
		expect(probeFiles(gone())).toBeUndefined();
		expect(probeFiles(gone({ javaHome: "/jdk" }, { "/jdk/bin/java": "" }))).toMatchObject({ kind: "installed" });
		expect(probeFiles(gone({ javaHome: "/nowhere" }))).toBeUndefined();
		expect(probeFiles(gone({ platform: "darwin" }))).toBeUndefined();
		expect(setupNotice({ kind: "noJava", distribution: "2201.14.0" }, true)).toContain("Ballerina 2201.14.0 is installed, but it finds no Java runtime");
	});

	it("leaves every case it cannot read to bal itself", () => {
		expect(probeFiles(installed({ platform: "win32" }))).toBeUndefined();
		expect(probeFiles(installed({ path: "/usr/bin" }))).toBeUndefined();
		expect(probeFiles(installed({ realpath: () => "/opt/homebrew/Cellar/bal/2201.14.2/libexec/bal" }))).toBeUndefined();
		expect(probeFiles(installed({}, { [`${ROOT}/distributions/ballerina-version`]: "nonsense" }))).toBeUndefined();
		expect(probeFiles(installed({}, { "/home/u/.ballerina/.config/bal-tools.toml": "[[tool]]\nversion = 1\n" }))).toBeUndefined();
		// A launcher that names its runtime in another form.
		expect(probeFiles(installed({}, { [`${ROOT}/distributions/ballerina-2201.14.0/bin/bal`]: 'JAVA_PATH="$BALLERINA_HOME/../../dependencies/jdk"\n' }))).toBeUndefined();
	});

	it("reads a launcher's Java error as no Java when asking bal itself", async () => {
		expect(await probeBallerina(runner({ version: { stdout: "Error: JAVA_HOME is not defined correctly.\n", stderr: "", code: 1 } }))).toEqual({ kind: "noJava" });
		expect(setupNotice({ kind: "noJava" }, true)).toContain("Ballerina is installed, but it finds no Java runtime");
	});
});

describe("the wiring", () => {
	// An empty PATH sends the check to `bal` itself (the fake `exec` below); two tests give it a layout to read instead.
	// Ballerina Central is offline (profile/test/setup.ts) unless a test answers for it.
	beforeEach(() => {
		vi.stubEnv("PATH", "");
	});
	afterEach(() => {
		vi.unstubAllEnvs();
		vi.unstubAllGlobals();
	});
	/** An installer layout of 2201.14.0 under `root` with this tool registry, on PATH and as HOME; returns the registry's path. */
	const makeLayout = (root: string, registry: string) => {
		for (const dir of ["bin", "distributions/ballerina-2201.14.0/bin", "dependencies/jdk-25.0.3+9-jre", "home/.ballerina/.config"]) mkdirSync(join(root, dir), { recursive: true });
		writeFileSync(join(root, "bin", "bal"), "#!/bin/bash\n");
		writeFileSync(join(root, "distributions", "ballerina-version"), "ballerina-2201.14.0");
		writeFileSync(join(root, "distributions", "ballerina-2201.14.0", "bin", "bal"), DIST_LAUNCHER);
		const file = join(root, "home", ".ballerina", ".config", "bal-tools.toml");
		writeFileSync(file, registry);
		vi.stubEnv("PATH", join(root, "bin"));
		vi.stubEnv("HOME", join(root, "home"));
		return file;
	};
	const start = async (exec: (command: string, args: string[]) => Promise<unknown>) => {
		const fake = createFakePi();
		(fake.pi as { exec: unknown }).exec = exec;
		const reminders: ReminderPayload[] = [];
		fake.events.on(REMINDER_CHANNEL, (data) => reminders.push(data as ReminderPayload));
		ballerina(fake.pi as never);
		return { fake, reminders };
	};
	const settle = () => new Promise((resolve) => setTimeout(resolve, 10));
	/** What reached the user through the notice owner (`queueNotice`). */
	const notified = async (ctx: Record<string, unknown>) => {
		await flushNotices();
		return ((ctx.ui as { notify: { mock: { calls: unknown[][] } } }).notify.mock.calls).map((call) => call[0]);
	};

	it("sends one reminder after the session starts when bal is missing, and none when it is there", async () => {
		const missing = await start(async () => {
			throw new Error("spawn bal ENOENT");
		});
		await missing.fake.fire("session_start", {});
		await settle();
		expect(missing.reminders.map((reminder) => reminder.key)).toEqual([SETUP_REMINDER_KEY]);
		expect(missing.reminders[0]?.text).toContain("Ballerina is not installed");

		const present = await start(async (_command, args) => ok(args[0] === "version" ? VERSION : TOOLS));
		await present.fake.fire("session_start", {});
		await settle();
		expect(present.reminders).toEqual([]);
	});

	it("sends the files' answer with the session's start, before any request, and never runs bal", async () => {
		const root = mkdtempSync(join(tmpdir(), "bal-files-"));
		try {
			makeLayout(root, REGISTRY.replace('id = "discover"', 'id = "openapi"'));
			const ran: string[] = [];
			let finish: (() => void) | undefined;
			const files = await start(async (_command, args) => {
				ran.push(args.join(" "));
				await new Promise<void>((resolve) => {
					finish = resolve;
				});
				return ok("ballerina/tool_discover:0.1.0 pulled from central successfully\n");
			});
			const ctx = createFakeCtx();
			await files.fake.fire("session_start", {}, ctx);
			// A prompt sent while the install runs carries the notice; the model is told not to install it.
			await files.fake.fire("before_agent_start", {}, ctx);
			expect(files.reminders.map((reminder) => reminder.key)).toEqual([TOOLS_REMINDER_KEY]);
			expect(files.reminders[0]?.text).toContain("The `bal` tool `discover` is being installed in the background now");
			expect(files.reminders[0]?.text).toContain("Do not install it yourself.");
			finish?.();
			await settle();
			// No `bal version` or `bal tool list`: the only command is the install, without asking.
			expect(ran).toEqual(["tool pull discover"]);
			expect(await notified(ctx)).toEqual([expect.stringContaining("Installed the bal tool `discover`")]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it("says nothing to the model when the install finished before the first prompt", async () => {
		const ctx = createFakeCtx();
		const quick = await start(async (_command, args) =>
			args[0] === "version" ? ok(VERSION) : args[0] === "tool" && args[1] === "list" ? ok("|TOOL ID |VERSION |\n|migen |1.0.2 |\n") : ok("pulled from central successfully\n"),
		);
		await quick.fake.fire("session_start", {}, ctx);
		await settle();
		await quick.fake.fire("before_agent_start", {}, ctx);
		expect(quick.reminders).toEqual([]);
		expect(await notified(ctx)).toEqual([expect.stringContaining("Installed the bal tool `discover`")]);
	});

	it("tells the model to install the tool itself when the background install fails", async () => {
		const ctx = createFakeCtx();
		const failing = await start(async (_command, args) =>
			args[0] === "version" ? ok(VERSION) : args[0] === "tool" && args[1] === "list" ? ok("|TOOL ID |VERSION |\n|migen |1.0.2 |\n") : { stdout: "", stderr: "error: unable to connect to central.ballerina.io", code: 1 },
		);
		await failing.fake.fire("session_start", {}, ctx);
		await settle();
		expect(failing.reminders.map((reminder) => reminder.key)).toEqual([`${TOOLS_REMINDER_KEY}:discover:failed`]);
		expect(failing.reminders[0]?.text).toContain("failed (error: unable to connect to central.ballerina.io)");
		expect(failing.reminders[0]?.text).toContain("Run `bal tool pull discover` yourself now, without asking");
		expect(await notified(ctx)).toEqual([expect.stringContaining("Could not install the bal tool `discover`")]);
	});

	it("updates discover without asking and offers a newer distribution in a dialog after the turn, at most once a day", async () => {
		const root = mkdtempSync(join(tmpdir(), "bal-updates-"));
		try {
			const registry = makeLayout(root, REGISTRY);
			const urls: string[] = [];
			vi.stubGlobal("fetch", vi.fn(async (url: string) => {
				urls.push(url);
				const body = url.includes("/tools/discover") ? { version: "0.1.1" } : { major: "2201.14.2", minor: "2201.14.2", patch: "2201.14.2" };
				return new Response(JSON.stringify(body), { status: 200 });
			}));
			const ran: string[] = [];
			const session = async () => {
				const ctx = createFakeCtx({ hasUI: true, mode: "tui" });
				const select = vi.fn(async (_title: string, options: string[]) => options.find((option) => option.startsWith("Not now")));
				(ctx.ui as { select: unknown }).select = select;
				const loaded = await start(async (_command, args) => {
					ran.push(args.join(" "));
					writeFileSync(registry, REGISTRY.replace('version = "0.1.0"', 'version = "0.1.1"'));
					return ok("tool 'discover:0.1.1' successfully set as the active version.\n");
				});
				await loaded.fake.fire("session_start", {}, ctx);
				await settle();
				await loaded.fake.fire("agent_end", {}, ctx);
				await settle();
				return { reminders: loaded.reminders, notices: await notified(ctx), asked: select.mock.calls.map((call) => call[1]) };
			};
			const first = await session();
			expect(urls).toHaveLength(2);
			expect(ran).toEqual(["tool update discover"]);
			expect(first.notices).toEqual(["Updated the bal tool `discover` from 0.1.0 to 0.1.1."]);
			// The model hears nothing about the distribution: the dialog asks the user.
			expect(first.reminders).toEqual([]);
			expect(first.asked).toEqual([["Update to 2201.14.2 (a patch of 2201.14)", "Not now (ask again tomorrow)", "Skip 2201.14.2"]]);
			// The same day: no request to Central, no update, no second offer.
			const second = await session();
			expect(urls).toHaveLength(2);
			expect(ran).toEqual(["tool update discover"]);
			expect(second).toEqual({ reminders: [], notices: [], asked: [] });
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it("stays silent when the session ended before the answer came", async () => {
		let release: (() => void) | undefined;
		const late = await start(
			() =>
				new Promise((_resolve, reject) => {
					release = () => reject(new Error("spawn bal ENOENT"));
				}),
		);
		await late.fake.fire("session_start", {});
		await late.fake.fire("session_shutdown", {});
		release?.();
		await settle();
		expect(late.reminders).toEqual([]);
	});
});

describe("every bundled skill", () => {
	const skills = join(import.meta.dirname, "..", "skills");

	it("has a description the frontmatter parser accepts, so it stays in the model's listing", () => {
		for (const name of readdirSync(skills)) {
			const text = readFileSync(join(skills, name, "SKILL.md"), "utf8");
			expect(text, name).toMatch(new RegExp(`^---\\nname: ${name}\\n`));
			// A colon followed by a space inside an unquoted description breaks the parser, and the skill silently goes unlisted.
			expect(/^description: (.*)$/m.exec(text)?.[1], name).not.toMatch(/: /);
		}
	});
});

describe("the setup skill", () => {
	const skill = join(import.meta.dirname, "..", "skills", SETUP_SKILL, "SKILL.md");

	it("exists under the name the notice gives, asks before installing, and covers each required tool", () => {
		expect(existsSync(skill)).toBe(true);
		const text = readFileSync(skill, "utf8");
		expect(text).toMatch(new RegExp(`^---\\nname: ${SETUP_SKILL}\\n`));
		// A colon followed by a space inside an unquoted description breaks the frontmatter parser, and the skill then silently goes unlisted.
		expect(/^description: (.*)$/m.exec(text)?.[1]).not.toMatch(/: /);
		expect(text).toContain("ask_user_question");
		expect(text).toContain("Do not run an install or update command before the user has chosen");
		for (const tool of REQUIRED_TOOLS) expect(text).toContain(`bal tool pull ${tool}`);
	});
});
