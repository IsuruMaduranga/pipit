/**
 * The Ballerina environment check: what `bal` reports becomes one notice
 * for the model, only when something is missing, and never an install.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { REMINDER_CHANNEL, type ReminderPayload } from "../../extensions/sdk/extension.ts";
import { createFakePi } from "../../test/unit/helpers/fake-pi.ts";
import { type CommandResult, compareDistributions, distributionOf, MIN_DISTRIBUTION, probeBallerina, REQUIRED_TOOLS, SETUP_SKILL, setupNotice, toolIds } from "../extensions/ballerina/environment.ts";
import ballerina, { SETUP_REMINDER_KEY } from "../extensions/ballerina/index.ts";

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
		expect(setupNotice(status)).toBeUndefined();
	});

	it("reports a missing bal, whether the command cannot start or the shell says so", async () => {
		expect(await probeBallerina(runner({}))).toEqual({ kind: "missing" });
		expect(await probeBallerina(runner({ version: { stdout: "", stderr: "bal: command not found", code: 127 } }))).toEqual({ kind: "missing" });
		const notice = setupNotice({ kind: "missing" });
		expect(notice).toContain("Ballerina is not installed");
		expect(notice).toContain(`\`${SETUP_SKILL}\` skill`);
		expect(notice).toContain("ask before installing");
	});

	it("reports an old distribution and a missing tool, and never guesses from an answer it cannot read", async () => {
		const status = await probeBallerina(runner({ version: ok(VERSION.replace("2201.14.0", "2201.12.3")), "tool list": ok("No tools found.") }));
		expect(status).toEqual({ kind: "installed", distribution: "2201.12.3", missingTools: [...REQUIRED_TOOLS] });
		const notice = setupNotice(status);
		expect(notice).toContain(`2201.12.3, older than ${MIN_DISTRIBUTION}`);
		expect(notice).toContain("`discover` is not installed");
		// A tool list that failed is not "no tools"; an unreadable version is not "missing".
		expect(await probeBallerina(runner({ version: ok(VERSION), "tool list": { stdout: "", stderr: "boom", code: 1 } }))).toEqual({ kind: "installed", distribution: "2201.14.0", missingTools: [] });
		expect(await probeBallerina(runner({ version: ok("something else") }))).toEqual({ kind: "unknown" });
		expect(setupNotice({ kind: "unknown" })).toBeUndefined();
	});
});

describe("the wiring", () => {
	const start = async (exec: (command: string, args: string[]) => Promise<unknown>) => {
		const fake = createFakePi();
		(fake.pi as { exec: unknown }).exec = exec;
		const reminders: ReminderPayload[] = [];
		fake.events.on(REMINDER_CHANNEL, (data) => reminders.push(data as ReminderPayload));
		ballerina(fake.pi as never);
		return { fake, reminders };
	};
	const settle = () => new Promise((resolve) => setTimeout(resolve, 10));

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
