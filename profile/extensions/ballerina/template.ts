/**
 * The templates of the `# Ballerina` section (prompt/*.md): plain text in
 * which a passage that names a tool is marked where it stands, so the
 * section reads top to bottom and still names only the tools the session
 * can have. A pure module: no pi imports, no file reads.
 *
 * The whole syntax:
 *
 *   {{#tool a}}…{{/tool}}              kept when the session can have `a`
 *   {{#tool a}}…{{else}}…{{/tool}}     the second part when it cannot
 *   {{#tool a b}}…{{/tool}}            kept when it can have every one of `a` and `b`
 *   {{#tool a|b}}…{{/tool}}            kept when it can have either of `a` and `b`
 *   {{#tool a|b c}}…{{/tool}}          both forms at once: (a or b) and c
 *   {{name}}                           the caller's value `name`, computed from
 *                                      the tools the session can have
 *   \{{                                a literal `{{`
 *
 * Blocks nest. A block tag (`{{#tool …}}`, `{{else}}`, `{{/tool}}`) alone on
 * its line takes that line's newline with it, so a block can wrap whole
 * lines without leaving a blank one; a `{{name}}` alone on its line keeps
 * the newline. Nothing else is special; any other `{{` is an error.
 *
 * `parseTemplate` runs at load and throws on a tool name outside the given
 * set, a value name outside the given set, an unclosed block, a stray
 * `{{else}}` or `{{/tool}}`, a second `{{else}}` and an unknown tag, naming
 * the template and the line, so a typo cannot ship. `render` is then a pure
 * function of the parsed template, the tools the session can have and the
 * values the caller computed from them: the same input gives the same bytes.
 */

import type { LiveTools } from "../../../extensions/sdk/profile.ts";

/** Every term must hold; a term holds when the session can have any of its tools. */
type Condition = readonly (readonly string[])[];

type Block = { readonly when: Condition; readonly then: Node[]; readonly otherwise: Node[] };
/** A place for the caller's value of this name. */
type Value = { readonly value: string };
type Node = string | Block | Value;

/** A parsed template, ready for `render`. */
export type Template = readonly Node[];

/** A tag, or the escape `\{{` for a literal `{{` (the first group is then undefined). */
const TAG = /\\\{\{|\{\{(.*?)\}\}/g;

/** The values `render` fills in, by name. */
export type Values = Readonly<Record<string, string>>;

/** Parses `source` (named `name` in errors), allowing only tool names in `tools` and value names in `values`. */
export function parseTemplate(source: string, tools: ReadonlySet<string>, name: string, values: ReadonlySet<string> = new Set()): Template {
	const lineOf = (index: number) => source.slice(0, index).split("\n").length;
	const fail = (index: number, problem: string): never => {
		throw new Error(`The template ${name}, line ${lineOf(index)}: ${problem}.`);
	};
	const root: Node[] = [];
	// The open blocks, innermost last, each with where it opened and whether its {{else}} was seen.
	const open: { block: Block; at: number; inElse: boolean }[] = [];
	const target = () => {
		const top = open.at(-1);
		return top ? (top.inElse ? top.block.otherwise : top.block.then) : root;
	};
	const text = (start: number, end: number) => {
		if (end <= start) return;
		const piece = source.slice(start, end);
		// A `{{` with no `}}` after it on the way: a tag cut short.
		if (piece.includes("{{")) fail(start + piece.indexOf("{{"), "an unclosed tag");
		target().push(piece);
	};
	let from = 0;
	for (const match of source.matchAll(TAG)) {
		const at = match.index;
		const end = at + match[0].length;
		text(from, at);
		const tag = match[1];
		if (tag === undefined) {
			target().push("{{");
			from = end;
			continue;
		}
		// A block tag alone on its line: the line goes, newline and all.
		const opens = /^#tool(\s|$)/.test(tag);
		const isBlockTag = opens || tag === "else" || tag === "/tool";
		const alone = (at === 0 || source[at - 1] === "\n") && (end === source.length || source[end] === "\n");
		from = isBlockTag && alone ? Math.min(end + 1, source.length) : end;
		if (opens) {
			const terms = tag.slice("#tool".length).trim().split(/\s+/).filter(Boolean);
			if (terms.length === 0) fail(at, `{{${tag}}} names no tool`);
			const when = terms.map((term) => term.split("|"));
			for (const tool of when.flat()) if (!tools.has(tool)) fail(at, `{{${tag}}} names \`${tool}\`, which is not a tool this section may name`);
			const block: Block = { when, then: [], otherwise: [] };
			target().push(block);
			open.push({ block, at, inElse: false });
		} else if (tag === "else") {
			const top = open.at(-1);
			if (!top) fail(at, "{{else}} outside a {{#tool}} block");
			else if (top.inElse) fail(at, "a second {{else}} in one block");
			else top.inElse = true;
		} else if (tag === "/tool") {
			if (!open.pop()) fail(at, "{{/tool}} with no open {{#tool}} block");
		} else if (/^\w+$/.test(tag)) {
			if (!values.has(tag)) fail(at, `{{${tag}}} is not a value this section may use`);
			target().push({ value: tag });
		} else {
			fail(at, `unknown tag {{${tag}}}`);
		}
	}
	const unclosed = open.at(-1);
	if (unclosed) fail(unclosed.at, "a {{#tool}} block is never closed");
	text(from, source.length);
	return root;
}

const holds = (when: Condition, live: LiveTools) => when.every((term) => term.some((tool) => live.has(tool)));

const isValue = (node: Node): node is Value => typeof node !== "string" && "value" in node;

/** The text of `template` for a session that can have the tools in `live`, with `values` computed from them. */
export function render(template: Template, live: LiveTools, values: Values = {}): string {
	let out = "";
	for (const node of template) {
		if (typeof node === "string") out += node;
		else if (isValue(node)) {
			const value = values[node.value];
			if (value === undefined) throw new Error(`No value given for {{${node.value}}}.`);
			out += value;
		} else out += render(holds(node.when, live) ? node.then : node.otherwise, live, values);
	}
	return out;
}
