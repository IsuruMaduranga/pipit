/**
 * The Ballerina extension's wiring (profile/extensions/ballerina/): the main
 * session's entry registers `config_status`, refreshes the secret values each
 * turn and announces the prompt section; the child's entry does the same
 * without the section. The tool's text never carries a value, and its values
 * are redacted by the time it returns.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { redactSecretValues, setSecretValues } from "../../extensions/lib/profile/secrets.ts";
import { SYSTEM_PROMPT_SECTION_CHANNEL, type SystemPromptSection } from "../../extensions/sdk/extension.ts";
import { createFakeCtx, createFakePi } from "../../test/unit/helpers/fake-pi.ts";
import ballerinaChild from "../extensions/ballerina/child.ts";
import ballerina, { BALLERINA_SECTION_ID } from "../extensions/ballerina/index.ts";
import { ballerinaSection } from "../extensions/ballerina/prompt.ts";
import { CONFIG_STATUS_TOOL } from "../extensions/ballerina/session.ts";

let roots: string[] = [];
afterEach(() => {
	for (const root of roots) {
		setSecretValues(`ballerina-config:${root}`, []);
		rmSync(root, { recursive: true, force: true });
	}
	roots = [];
});

function project(files: Record<string, string>): string {
	const root = mkdtempSync(join(tmpdir(), "bal-ext-"));
	roots.push(root);
	for (const [path, text] of Object.entries(files)) {
		mkdirSync(dirname(join(root, path)), { recursive: true });
		writeFileSync(join(root, path), text);
	}
	return root;
}

const SECRET = "ghp_wiring-secret-77";
const FILES = { "Ballerina.toml": '[package]\norg = "acme"\nname = "app"\n', "main.bal": "configurable string token = ?;\nconfigurable string other = ?;\n" };

function load(entry: (pi: never) => void) {
	const fake = createFakePi();
	const sections: SystemPromptSection[] = [];
	fake.events.on(SYSTEM_PROMPT_SECTION_CHANNEL, (data) => sections.push(data as SystemPromptSection));
	entry(fake.pi as never);
	return { fake, sections };
}

async function callTool(fake: ReturnType<typeof createFakePi>, cwd: string, sessionDir?: string) {
	const ctx = createFakeCtx({ cwd, sessionManager: { getSessionDir: () => sessionDir } });
	return (await fake.tools.get(CONFIG_STATUS_TOOL)?.execute("toolu_test", {}, undefined, undefined, ctx)) as {
		content: Array<{ text: string }>;
		details?: { variables: number; missing: number };
		isError?: boolean;
	};
}

describe("the Ballerina extension", () => {
	it("registers config_status with the base's renderers and announces its prompt section in the main session", () => {
		const { fake, sections } = load(ballerina);
		const tool = fake.tools.get(CONFIG_STATUS_TOOL);
		expect(tool?.renderShell).toBe("self");
		expect(tool?.promptSnippet).toEqual(expect.any(String));
		const session = { tier: "frontier" as const, taskTools: true, tools: undefined };
		expect(sections.map((s) => [s.id, s.place, s.render(session)])).toEqual([[BALLERINA_SECTION_ID, "tail", ballerinaSection(session)]]);
	});

	it("gives a child session the tool and the refresh, and no prompt section", () => {
		const { fake, sections } = load(ballerinaChild);
		expect(fake.tools.has(CONFIG_STATUS_TOOL)).toBe(true);
		expect(fake.handlers.get("turn_start")).toHaveLength(1);
		expect(sections).toEqual([]);
	});

	it("registers a value the user just added at the start of the next turn", async () => {
		const root = project(FILES);
		const { fake } = load(ballerina);
		await fake.fire("turn_start", { type: "turn_start", turnIndex: 0, timestamp: 0 }, createFakeCtx({ cwd: root }));
		expect(redactSecretValues(`out ${SECRET}`)).toBe(`out ${SECRET}`);
		writeFileSync(join(root, "Config.toml"), `token = "${SECRET}"\n`);
		await fake.fire("turn_start", { type: "turn_start", turnIndex: 1, timestamp: 0 }, createFakeCtx({ cwd: root }));
		expect(redactSecretValues(`out ${SECRET}`)).toBe("out [secret:token]");
		// A value the user removed is no longer replaced.
		writeFileSync(join(root, "Config.toml"), "");
		await fake.fire("turn_start", { type: "turn_start", turnIndex: 2, timestamp: 0 }, createFakeCtx({ cwd: root }));
		expect(redactSecretValues(`out ${SECRET}`)).toBe(`out ${SECRET}`);
	});

	it("reports the variables without their values, registering the values on the call", async () => {
		const root = project({ ...FILES, "Config.toml": `token = "${SECRET}"\n` });
		const { fake } = load(ballerinaChild);
		const result = await callTool(fake, root);
		expect(result.isError).toBeUndefined();
		expect(result.details).toEqual({ integrations: 1, variables: 2, missing: 1, problems: 0 });
		expect(result.content[0].text).toContain("- token: string, required, set (main.bal:1)");
		expect(result.content[0].text).toContain('other = "<string>"');
		expect(result.content[0].text).not.toContain(SECRET);
		expect(redactSecretValues(SECRET)).toBe("[secret:token]");
	});

	it("fails loud with the fix named when there is no project", async () => {
		const { fake } = load(ballerina);
		const result = await callTool(fake, project({ "notes.txt": "x" }));
		expect(result.isError).toBe(true);
		expect(result.content[0].text).toContain("No Ballerina project here");
		expect(result.content[0].text).toContain("create_integration");
	});

	it("creates an integration through create_integration, in the main session and in a child, and refuses to overwrite one", async () => {
		for (const entry of [ballerina, ballerinaChild]) {
			const { fake } = load(entry);
			const cwd = project({});
			const ctx = createFakeCtx({ cwd });
			const run = async (params: object) => (await fake.tools.get("create_integration")?.execute("toolu_create", params, undefined, undefined, ctx)) as { content: Array<{ text: string }>; details?: { files: number }; isError?: boolean };
			const created = await run({ name: "Order Sync", org: "acme" });
			expect(created.isError).toBeUndefined();
			expect(created.content[0].text).toContain('first integration "order_sync" (org acme)');
			expect(readFileSync(join(cwd, "Ballerina.toml"), "utf8")).toContain('packages = ["order_sync"]');
			expect(readFileSync(join(cwd, "order_sync", "main.bal"), "utf8")).toBe("\n");
			const again = await run({ name: "order_sync" });
			expect(again.isError).toBe(true);
			expect(again.content[0].text).toContain("nothing is overwritten");
		}
	});

	it("marks a report with a problem as an error, keeping what it could read", async () => {
		const { fake } = load(ballerina);
		const result = await callTool(fake, project({ ...FILES, "Config.toml": "token = oops\n" }));
		expect(result.isError).toBe(true);
		expect(result.content[0].text).toContain("not valid TOML, line 1");
		expect(result.content[0].text).toContain("- token: string, required, unknown");
	});

	it("persists a report too large for the context, never cutting it", async () => {
		const declarations = Array.from({ length: 900 }, (_, i) => `configurable string variableNumber${i} = ?;`).join("\n");
		const root = project({ ...FILES, "main.bal": declarations });
		const sessionDir = join(root, ".session");
		const result = await callTool(load(ballerina).fake, root, sessionDir);
		expect(result.content[0].text).toContain("<persisted-output>");
		expect(result.content[0].text).toContain(join(sessionDir, "tool-results", "toolu_test.txt"));
	});
});
