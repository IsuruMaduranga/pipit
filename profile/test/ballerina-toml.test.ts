/**
 * The Ballerina extension's TOML reader (profile/extensions/ballerina/toml.ts):
 * the key paths and headers `config_status` matches variables against, the
 * strings it registers as secrets, and the files Ballerina rejects.
 */
import { describe, expect, it } from "vitest";
import { looseStrings, parseToml, stringsIn, TomlError } from "../extensions/ballerina/toml.ts";

const paths = (text: string) => parseToml(text).entries.map((entry) => entry.path.join("."));

describe("parseToml", () => {
	it("gives every key its full path under its section, dotted keys included", () => {
		const text = ['top = "a"', "", "[acme.app]", 'r = { user = "u", pass = "p" }', "sub.b = 1", "", "[acme.app.sub]", "c = true # comment"].join("\n");
		const doc = parseToml(text);
		expect(paths(text)).toEqual(["top", "acme.app.r", "acme.app.sub.b", "acme.app.sub.c"]);
		expect(doc.entries.map((entry) => entry.headerLength)).toEqual([0, 2, 2, 3]);
		expect(doc.headers.map((header) => [header.path.join("."), header.line])).toEqual([
			["acme.app", 3],
			["acme.app.sub", 7],
		]);
	});

	it("decodes basic, literal and multi-line strings", () => {
		const doc = parseToml(['a = "x\\"y\\u00e9\\n"', "b = 'C:\\path'", 'c = """', 'line one\\', '   still one"""', "d = '''", "raw\\n'''"].join("\n"));
		expect(doc.entries.map((entry) => entry.value)).toEqual([
			{ kind: "string", value: 'x"yé\n' },
			{ kind: "string", value: "C:\\path" },
			{ kind: "string", value: "line onestill one" },
			{ kind: "string", value: "raw\\n" },
		]);
	});

	it("reads quoted keys, multi-line arrays and arrays of tables", () => {
		const text = ['"my key" = 1', "list = [", '  "a", # first', '  "b",', "]", "[[emps]]", 'name = "x"', "[[emps]]", 'name = "y"'].join("\n");
		const doc = parseToml(text);
		expect(paths(text)).toEqual(["my key", "list", "emps.name", "emps.name"]);
		expect(doc.entries[1].value).toEqual({ kind: "array", items: [{ kind: "string", value: "a" }, { kind: "string", value: "b" }] });
		expect(doc.headers.every((header) => header.arrayTable)).toBe(true);
	});

	it("keeps numbers, booleans and dates as raw text", () => {
		const doc = parseToml(["port = 5432", "ratio = -2.5e3", "on = false", "when = 1979-05-27 07:32:00Z", "hex = 0xFF"].join("\n"));
		expect(doc.entries.map((entry) => entry.value)).toEqual(["5432", "-2.5e3", "false", "1979-05-27 07:32:00Z", "0xFF"].map((raw) => ({ kind: "other", raw })));
	});

	it.each([
		['a = "x"\na = "y"', 2, "set twice"],
		['[s]\na = 1\n[s]\nb = 2', 3, "appears twice"],
		["token = abc123", 1, 'needs quotes ("abc123")'],
		['a = "open', 1, "unterminated string"],
		['a = """never closed', 1, "unterminated multi-line string"],
		["a = [1, 2", 1, "unterminated array"],
		['a = "x" b = 1', 1, "one key = value per line"],
		["= 1", 1, "expected a key"],
	])("rejects %j at line %i", (text, line, reason) => {
		let error: unknown;
		try {
			parseToml(text);
		} catch (caught) {
			error = caught;
		}
		expect(error).toBeInstanceOf(TomlError);
		expect((error as TomlError).line).toBe(line);
		expect((error as TomlError).message).toContain(reason);
	});
});

describe("the strings a value holds", () => {
	it("are found through arrays and inline tables, each under its dotted key", () => {
		const [entry] = parseToml('creds = { user = "admin", keys = ["k1", 2], nested = { pass = "pw" } }').entries;
		expect(stringsIn(entry.value, "creds")).toEqual([
			{ key: "creds.user", value: "admin" },
			{ key: "creds.keys", value: "k1" },
			{ key: "creds.nested.pass", value: "pw" },
		]);
	});

	it("are still found in a file that is not valid TOML, an unquoted text value too", () => {
		const text = ['good = "quoted-secret"', "bad = unquoted-secret # oops", "port = 5432", "on = true", "[broken", 'multi = """', "line-1", 'line-2"""'].join("\n");
		expect(() => parseToml(text)).toThrow(TomlError);
		expect(looseStrings(text).map((found) => found.value)).toEqual(["line-1\nline-2", "quoted-secret", "unquoted-secret"]);
	});
});
