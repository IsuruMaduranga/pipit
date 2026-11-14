/**
 * The `configurable` scan of a Ballerina source file
 * (profile/extensions/ballerina/bal-source.ts): every module-level
 * declaration the compiler sees, and nothing a comment, a string or a
 * function body holds.
 */
import { describe, expect, it } from "vitest";
import { scanBal } from "../extensions/ballerina/bal-source.ts";

const declarations = (text: string) => scanBal(text).configurables.map(({ name, type, required, defaultValue, line }) => ({ name, type, required, defaultValue, line }));

describe("scanBal", () => {
	it("reads required and defaulted declarations with their types and lines", () => {
		const text = ["import ballerina/http;", "", "configurable string token = ?;", "configurable int port = 9090;", "public configurable string[] hosts = [\"a\", \"b\"];", "configurable decimal? limit = ();"].join("\n");
		expect(declarations(text)).toEqual([
			{ name: "token", type: "string", required: true, defaultValue: undefined, line: 3 },
			{ name: "port", type: "int", required: false, defaultValue: "9090", line: 4 },
			{ name: "hosts", type: "string[]", required: false, defaultValue: '["a", "b"]', line: 5 },
			{ name: "limit", type: "decimal?", required: false, defaultValue: "()", line: 6 },
		]);
	});

	it("reads a declaration spread over lines, after documentation and an annotation", () => {
		const text = [
			"# The database settings.",
			"# + user - who connects; never `configurable x = 1;`",
			'@display {label: "Database"}',
			"configurable record {|",
			"    string user;",
			'    string pass = "x;y";',
			"|} db = {",
			'    user: "admin", // the default user',
			'    pass: "p=1"',
			"};",
		].join("\n");
		expect(declarations(text)).toEqual([{ name: "db", type: "record {| string user; string pass = \"x;y\"; |}", required: false, defaultValue: '{ user: "admin", pass: "p=1" }', line: 4 }]);
	});

	it("ignores the keyword in comments, strings, templates, function bodies and longer names", () => {
		const text = [
			"// configurable string commented = ?;",
			'string s = "configurable string inString = ?;";',
			"string t = string `configurable string inTemplate = ?;`;",
			"function f() {",
			"    int configurable_count = 1;",
			"}",
			"int myconfigurable = 2;",
			"configurable string real = ?;",
		].join("\n");
		expect(declarations(text).map((d) => d.name)).toEqual(["real"]);
	});

	it("splits at the declaration's own =, not one inside the default", () => {
		expect(declarations("configurable boolean flag = 1 == 1;\nconfigurable Fn handler = isolated function() returns int => 1;")).toEqual([
			{ name: "flag", type: "boolean", required: false, defaultValue: "1 == 1", line: 1 },
			{ name: "handler", type: "Fn", required: false, defaultValue: "isolated function() returns int => 1", line: 2 },
		]);
	});

	it("unquotes a quoted identifier", () => {
		expect(declarations("configurable string 'type = ?;").map((d) => d.name)).toEqual(["type"]);
	});

	it("collects every string literal, decoded", () => {
		expect(scanBal('configurable string host = "localhost";\nstring q = "a\\"b\\u{41}";\n// "not a literal"').strings).toEqual(["localhost", 'a"bA']);
	});
});
