/**
 * What `config_status` reports for a project on disk, and which Config.toml
 * values it registers as secret (profile/extensions/ballerina/config-status.ts).
 * The section rules were checked against `bal run` on 2201.14.0; each case
 * here is one of them.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { configReport, configSecrets, formatReport, placeholder, projectSecrets, reportCounts } from "../extensions/ballerina/config-status.ts";

let roots: string[] = [];
afterEach(() => {
	for (const root of roots) rmSync(root, { recursive: true, force: true });
	roots = [];
});

/** A folder holding `files` (relative path to text). */
function project(files: Record<string, string>): string {
	const root = mkdtempSync(join(tmpdir(), "bal-project-"));
	roots.push(root);
	for (const [path, text] of Object.entries(files)) {
		mkdirSync(dirname(join(root, path)), { recursive: true });
		writeFileSync(join(root, path), text);
	}
	return root;
}

const PACKAGE = '[package]\norg = "acme"\nname = "app"\nversion = "0.1.0"\n';
const SOURCES = {
	"Ballerina.toml": PACKAGE,
	"main.bal": 'configurable string a = ?;\nconfigurable R r = ?;\nconfigurable int n = 3;\npublic function main() {}\n',
	"modules/sub/sub.bal": "public configurable string b = ?;\n",
};

/** Each variable's state, as `module.name: state`. */
function states(root: string): Record<string, string> {
	const report = configReport(root);
	if (!report) throw new Error("no project");
	return Object.fromEntries(report.packages.flatMap((pkg) => pkg.modules.flatMap((module) => module.variables.map((v) => [`${module.module}.${v.name}`, v.state]))));
}

describe("config_status's report", () => {
	it("says which variables are set, in every place bal run takes them from", () => {
		const forms = [
			'a = "x"\n[r]\nuser = "u"\n[acme.app.sub]\nb = "y"\n',
			'[acme.app]\na = "x"\nr = { user = "u" }\n[app.sub]\nb = "y"\n',
			'[app]\na = "x"\nr.user = "u"\n[acme.app]\nsub.b = "y"\n',
			'a = "x"\nr = { user = "u" }\nacme.app.sub.b = "y"\n',
		];
		for (const config of forms) {
			expect(states(project({ ...SOURCES, "Config.toml": config })), config).toEqual({ "app.a": "set", "app.r": "set", "app.n": "not set", "app.sub.b": "set" });
		}
	});

	it("reports a value given twice and a key no variable declares, which stop bal run", () => {
		const root = project({ ...SOURCES, "Config.toml": 'a = "x"\nzzz = "q"\nr = { user = "u" }\n[acme.app]\na = "dup"\nold = 1\n[wso2.icp.bridge]\nenv = "dev"\n' });
		expect(states(root)["app.a"]).toBe("set twice");
		const [pkg] = configReport(root)?.packages ?? [];
		expect(pkg.unusedKeys).toEqual(["zzz", "acme.app.old"]);
		expect(pkg.otherSections).toEqual(["[wso2.icp.bridge]"]);
		const text = formatReport(configReport(root) as never);
		expect(text).toContain("SET TWICE");
		expect(text).toContain("unused configuration value");
		expect(text).toContain("[wso2.icp.bridge]");
	});

	it("puts a module's lines under its existing section, or a new [org.module] one", () => {
		const root = project({ ...SOURCES, "Config.toml": '[app]\nn = 4\n' });
		const report = configReport(root);
		expect(report?.packages[0].modules.map((m) => [m.module, m.section.join("."), m.sectionExists])).toEqual([
			["app", "app", true],
			["app.sub", "acme.app.sub", false],
		]);
		const text = formatReport(report as never);
		expect(text).toContain("under the existing [app] section of Config.toml (do not add a second [app] header)");
		expect(text).toContain(['```toml', "# under the existing [app] section", 'a = "<string>"', "r = <R>", "", "[acme.app.sub]", 'b = "<string>"', "```"].join("\n"));
	});

	it("uses [package] sections when the package names no org", () => {
		const root = project({ "Ballerina.toml": '[package]\nname = "app"\n', "main.bal": "configurable string a = ?;\n", "modules/sub/s.bal": "configurable int b = ?;\n", "Config.toml": '[app.sub]\nb = 1\n' });
		expect(states(root)).toEqual({ "app.a": "not set", "app.sub.b": "set" });
		expect(configReport(root)?.packages[0].modules[0].section).toEqual(["app"]);
	});

	it("reads each workspace package's own Config.toml, from inside any of them", () => {
		const root = project({
			"Ballerina.toml": '[workspace]\npackages = ["one", "two"]\n',
			"one/Ballerina.toml": '[package]\norg = "o"\nname = "one"\n',
			"one/main.bal": "configurable string key = ?;\n",
			"one/Config.toml": 'key = "x"\n',
			"two/Ballerina.toml": '[package]\norg = "o"\nname = "two"\n',
			"two/main.bal": "configurable string key = ?;\n",
			"two/tests/t.bal": "configurable string testOnly = ?;\n",
		});
		for (const cwd of [root, join(root, "two"), join(root, "one")]) {
			const report = configReport(cwd);
			expect(report?.kind).toBe("workspace");
			expect(report?.packages.map((pkg) => [pkg.folder, pkg.configFile, pkg.configExists])).toEqual([
				["one", "one/Config.toml", true],
				["two", "two/Config.toml", false],
			]);
		}
		expect(states(root)).toEqual({ "one.key": "set", "two.key": "not set" });
	});

	it("names a workspace package that is missing, and an unreadable Config.toml, as problems", () => {
		const root = project({ "Ballerina.toml": '[workspace]\npackages = ["gone", "app"]\n', ...Object.fromEntries(Object.entries(SOURCES).map(([k, v]) => [`app/${k}`, v])), "app/Config.toml": "[acme.app]\na = unquoted\n" });
		const report = configReport(root);
		if (!report) throw new Error("no project");
		expect(report.problems).toEqual([expect.stringContaining("gone has no Ballerina.toml")]);
		expect(report.packages[0].configProblem).toContain('line 2: "unquoted" is not a TOML value');
		expect(new Set(Object.values(states(root)))).toEqual(new Set(["unknown"]));
		expect(reportCounts(report).problems).toBe(2);
	});

	it("finds the packages below a folder with no manifest, or an empty one", () => {
		const files = { "a/Ballerina.toml": '[package]\norg = "o"\nname = "a"\n', "a/main.bal": "configurable string x = ?;\n", "deep/b/Ballerina.toml": '[package]\norg = "o"\nname = "b"\n' };
		expect(configReport(project(files))?.packages.map((pkg) => pkg.folder)).toEqual(["a", "deep/b"]);
		expect(configReport(project({ ...files, "Ballerina.toml": "" }))?.kind).toBe("folder");
		expect(configReport(project({ "readme.md": "x" }))).toBeUndefined();
	});

	it("never carries a value from Config.toml", () => {
		const secret = "s3cret-value-0042";
		const root = project({ ...SOURCES, "Config.toml": `a = "${secret}"\nr = { user = "${secret}-user" }\n[acme.app.sub]\nb = '${secret}-b'\nzzz = "${secret}-zzz"\n` });
		expect(formatReport(configReport(root) as never)).not.toContain(secret);
	});
});

describe("placeholders", () => {
	it.each([
		["string", '"<string>"'],
		["string?", '"<string>"'],
		["int", "<integer>"],
		["int:Signed32", "<integer>"],
		["decimal", "<number>"],
		["boolean", "<true or false>"],
		["string[]", '["<string>"]'],
		["int[3]", "[<integer>]"],
		["Creds", "<Creds>"],
		["map<string>", "<map<string>>"],
	])("for %s is %s", (type, expected) => expect(placeholder(type)).toBe(expected));
});

describe("the secret values", () => {
	const values = (text: string, sourceStrings: string[] = []) => configSecrets([{ text }], new Set(sourceStrings), 6).map((s) => `${s.name}=${s.value}`);

	it("are every string value long enough, wherever it sits", () => {
		expect(values('token = "ghp_abcdef"\n[acme.app.db]\ncreds = { user = "dbadmin", pass = "pw-123456" }\nhosts = ["replica-1"]\nkey = """\n-----BEGIN KEY-----\nabc\n"""\n')).toEqual([
			"token=ghp_abcdef",
			"creds.user=dbadmin",
			"creds.pass=pw-123456",
			"hosts=replica-1",
			"key=-----BEGIN KEY-----\nabc\n",
		]);
	});

	it("leave out short values, numbers, booleans, dates and bare endpoint URLs", () => {
		expect(values('env = "dev"\nport = 543210\non = true\nwhen = 2024-01-01\nurl = "https://api.example.com:8443/"\nws = "ws://[::1]:9090"')).toEqual([]);
	});

	it("keep a URL with a path, a query or user info: a webhook URL is a credential", () => {
		expect(values('hook = "https://hooks.slack.com/services/T0/B0/XYZ"\nq = "https://x.io?key=abc"\nu = "postgres://me:pw@db:5432"')).toHaveLength(3);
	});

	it("leave out a value the project's sources hold as a literal: hiding it would block edits of that line", () => {
		expect(values('path = "./summary.csv"\ntoken = "ghp_abcdef"', ["./summary.csv"])).toEqual(["token=ghp_abcdef"]);
	});

	it("are still found in a Config.toml that is not valid TOML", () => {
		expect(values('a = "quoted-one"\nb = unquoted-two\n[oops')).toEqual(["a=quoted-one", "b=unquoted-two"]);
	});

	it("come from every Config.toml of the project, tests' included, keyed by the project root", () => {
		const root = project({
			"Ballerina.toml": '[workspace]\npackages = ["one"]\n',
			"one/Ballerina.toml": '[package]\norg = "o"\nname = "one"\n',
			"one/main.bal": 'configurable string path = "./out.csv";\n',
			"one/Config.toml": 'token = "tok-123456"\npath = "./out.csv"\n',
			"one/tests/Config.toml": 'testToken = "test-tok-999"\n',
			"one/target/Config.toml": 'built = "never-read-0"\n',
		});
		const found = projectSecrets(join(root, "one"), 6);
		expect(found.source).toBe(`ballerina-config:${root}`);
		expect(found.secrets.map((s) => s.value).sort()).toEqual(["test-tok-999", "tok-123456"]);
	});
});
