/**
 * The template renderer of the `# Ballerina` section
 * (profile/extensions/ballerina/template.ts): what each block form keeps,
 * how a block tag alone on its line takes the line, the escape for a literal
 * `{{`, and the load-time errors that stop a typo from shipping.
 */
import { describe, expect, it } from "vitest";
import type { LiveTools } from "../../extensions/sdk/profile.ts";
import { parseTemplate, render } from "../extensions/ballerina/template.ts";
import { blockTools } from "./block-tools.ts";

const TOOLS = new Set(["a", "b", "c"]);
const has = (...on: string[]): LiveTools => ({ has: (tool) => on.includes(tool) });
const parse = (source: string) => parseTemplate(source, TOOLS, "t.md");
const out = (source: string, live: LiveTools) => render(parse(source), live);

describe("the section's template renderer", () => {
	it("keeps a block when the session can have its tool, and the {{else}} part when it cannot", () => {
		const source = "x{{#tool a}} A{{else}} not A{{/tool}}.";
		expect(out(source, has("a"))).toBe("x A.");
		expect(out(source, has())).toBe("x not A.");
		expect(out("x{{#tool a}} A{{/tool}}.", has())).toBe("x.");
	});

	it("reads spaces as every one and bars as any one", () => {
		const all = "{{#tool a b}}both{{/tool}}";
		expect(out(all, has("a", "b"))).toBe("both");
		expect(out(all, has("a"))).toBe("");
		const any = "{{#tool a|b}}either{{/tool}}";
		expect(out(any, has("b"))).toBe("either");
		expect(out(any, has("c"))).toBe("");
		const mixed = "{{#tool a|b c}}yes{{/tool}}";
		expect(out(mixed, has("a", "c"))).toBe("yes");
		expect(out(mixed, has("a", "b"))).toBe("");
	});

	it("nests blocks", () => {
		const source = "{{#tool a|b}}with {{#tool a}}`a`{{/tool}}{{#tool a b}} and {{/tool}}{{#tool b}}`b`{{/tool}}{{/tool}}";
		expect(out(source, has("a", "b"))).toBe("with `a` and `b`");
		expect(out(source, has("b"))).toBe("with `b`");
		expect(out(source, has())).toBe("");
	});

	it("drops the line of a tag that stands alone on it", () => {
		const source = "one\n{{#tool a}}\n- two\n{{else}}\n- three\n{{/tool}}\nfour";
		expect(out(source, has("a"))).toBe("one\n- two\nfour");
		expect(out(source, has())).toBe("one\n- three\nfour");
		// A tag inside a line keeps the line's newline.
		expect(out("one{{#tool a}} two{{/tool}}\nthree", has())).toBe("one\nthree");
	});

	it("renders the escape \\{{ as a literal {{, inside a block too", () => {
		expect(out("a \\{{b}} c", has())).toBe("a {{b}} c");
		expect(out("{{#tool a}}x \\{{y{{/tool}}", has("a"))).toBe("x {{y");
		expect(out("\\{{\n{{#tool a}}\nz\n{{/tool}}", has())).toBe("{{\n");
		expect(() => parse("a {{ b")).toThrow("an unclosed tag");
	});

	it("gives the same bytes for the same input", () => {
		const template = parse("p {{#tool a}}q{{else}}r{{/tool}} s");
		expect(render(template, has("a"))).toBe(render(template, has("a")));
	});

	it("lists the tools its blocks name", () => {
		expect([...blockTools(parse("{{#tool a|b}}{{#tool c}}x{{/tool}}{{/tool}}"))].sort()).toEqual(["a", "b", "c"]);
	});

	it("fills in a named value from the caller's map", () => {
		const template = parseTemplate("with {{list}}{{#tool a}}, {{list}} again{{/tool}}.", TOOLS, "t.md", new Set(["list"]));
		expect(render(template, has("a"), { list: "`a` and `b`" })).toBe("with `a` and `b`, `a` and `b` again.");
		expect(render(template, has(), { list: "`b`" })).toBe("with `b`.");
		// A value alone on its line keeps the line's newline: only a block tag takes it.
		expect(render(parseTemplate("one\n{{list}}\ntwo", TOOLS, "t.md", new Set(["list"])), has(), { list: "x" })).toBe("one\nx\ntwo");
		expect(render(parseTemplate("one\n{{list}}", TOOLS, "t.md", new Set(["list"])), has(), { list: "x" })).toBe("one\nx");
		expect(() => render(template, has(), {})).toThrow("No value given for {{list}}.");
	});

	it("fails at load on a value name outside the declared set, with the line", () => {
		expect(() => parse("ok\n{{list}}")).toThrow("The template t.md, line 2: {{list}} is not a value this section may use.");
		expect(() => parseTemplate("{{lists}}", TOOLS, "t.md", new Set(["list"]))).toThrow("{{lists}} is not a value this section may use");
	});

	it("fails at load on a tool it may not name, a broken block or an unknown tag, with the line", () => {
		expect(() => parse("ok\n{{#tool d}}x{{/tool}}")).toThrow("The template t.md, line 2: {{#tool d}} names `d`, which is not a tool this section may name.");
		expect(() => parse("{{#tool a|SendMessage}}x{{/tool}}")).toThrow("names `SendMessage`");
		expect(() => parse("{{#tool a}}x")).toThrow("line 1: a {{#tool}} block is never closed");
		expect(() => parse("x{{/tool}}")).toThrow("{{/tool}} with no open {{#tool}} block");
		expect(() => parse("x{{else}}y")).toThrow("{{else}} outside a {{#tool}} block");
		expect(() => parse("{{#tool a}}x{{else}}y{{else}}z{{/tool}}")).toThrow("a second {{else}} in one block");
		expect(() => parse("{{#tool}}x{{/tool}}")).toThrow("names no tool");
		expect(() => parse("{{#tools a}}x{{/tool}}")).toThrow("unknown tag {{#tools a}}");
		expect(() => parse("{{#if a}}x{{/if}}")).toThrow("unknown tag {{#if a}}");
		expect(() => parse("x {{#tool a}")).toThrow("an unclosed tag");
	});
});
