/**
 * The `configurable` declarations of one Ballerina source file, and its
 * string literals. Pure: no pi imports, no file access.
 *
 * Not a Ballerina parser: a scanner that skips comments, documentation
 * lines, strings and templates, tracks bracket depth, and reads each
 * `configurable` keyword at module level up to the `;` that ends its
 * declaration (`[public] configurable <type> <name> = <default> | ?;`).
 * That is the whole grammar a configurable declaration has, so the scan
 * finds what the compiler finds without a running language server.
 */

export interface ConfigurableDeclaration {
	name: string;
	/** The declared type as written, whitespace collapsed (`string`, `int[]`, `Creds`, `record {| string user; |}`). */
	type: string;
	/** `= ?`: the program does not start without a value. */
	required: boolean;
	/** The default expression as written, whitespace collapsed; undefined when required. */
	defaultValue?: string;
	/** 1-based line of the `configurable` keyword. */
	line: number;
}

export interface BalScan {
	configurables: ConfigurableDeclaration[];
	/** The contents of every double-quoted string literal in the file. */
	strings: string[];
}

const IDENT = /[A-Za-z0-9_']/;
const OPEN = "{([";
const CLOSE = "})]";

/** Decode a Ballerina string literal's escapes (the common ones; anything else is kept as written). */
function unescape(body: string): string {
	return body.replace(/\\(u\{([0-9A-Fa-f]+)\}|.)/g, (all, escape: string, hex: string | undefined) => {
		if (hex) {
			const code = Number.parseInt(hex, 16);
			return code <= 0x10ffff ? String.fromCodePoint(code) : all;
		}
		return ({ n: "\n", t: "\t", r: "\r", '"': '"', "\\": "\\" } as Record<string, string>)[escape] ?? all;
	});
}

/** A code position past a string, comment or template starting at `i`, or undefined when none starts there. */
function skipOpaque(text: string, i: number, strings: string[]): number | undefined {
	const ch = text[i];
	if (ch === "/" && text[i + 1] === "/") {
		const end = text.indexOf("\n", i);
		return end === -1 ? text.length : end;
	}
	if (ch === "#") {
		// A documentation line: Ballerina has no `#` operator.
		const end = text.indexOf("\n", i);
		return end === -1 ? text.length : end;
	}
	if (ch === '"') {
		let j = i + 1;
		while (j < text.length && text[j] !== '"' && text[j] !== "\n") j += text[j] === "\\" ? 2 : 1;
		strings.push(unescape(text.slice(i + 1, j)));
		return j + 1;
	}
	if (ch === "`") {
		let j = i + 1;
		while (j < text.length && text[j] !== "`") j += text[j] === "\\" ? 2 : 1;
		return j + 1;
	}
	return undefined;
}

/** Scan one `.bal` file. */
export function scanBal(text: string): BalScan {
	const configurables: ConfigurableDeclaration[] = [];
	const strings: string[] = [];
	let depth = 0;
	let i = 0;
	while (i < text.length) {
		const skipped = skipOpaque(text, i, strings);
		if (skipped !== undefined) {
			i = skipped;
			continue;
		}
		const ch = text[i];
		if (OPEN.includes(ch)) depth++;
		else if (CLOSE.includes(ch)) depth = Math.max(0, depth - 1);
		else if (depth === 0 && text.startsWith("configurable", i) && !IDENT.test(text[i - 1] ?? "") && /\s/.test(text[i + 12] ?? "")) {
			const end = readDeclaration(text, i + 12, strings);
			const declaration = parseDeclaration(text.slice(i + 12, end.at), lineAt(text, i));
			if (declaration) configurables.push(declaration);
			i = end.next;
			continue;
		}
		i++;
	}
	return { configurables, strings };
}

/** Where the declaration that starts at `from` ends: its `;` at depth 0. */
function readDeclaration(text: string, from: number, strings: string[]): { at: number; next: number } {
	let depth = 0;
	let i = from;
	while (i < text.length) {
		const skipped = skipOpaque(text, i, strings);
		if (skipped !== undefined) {
			i = skipped;
			continue;
		}
		const ch = text[i];
		if (OPEN.includes(ch)) depth++;
		else if (CLOSE.includes(ch)) depth--;
		else if (ch === ";" && depth === 0) return { at: i, next: i + 1 };
		if (depth < 0) return { at: i, next: i };
		i++;
	}
	return { at: text.length, next: text.length };
}

/** `<type> <name> = <default>|?`, comments and documentation removed. */
function parseDeclaration(source: string, line: number): ConfigurableDeclaration | undefined {
	const code = stripComments(source);
	const split = topLevelAssign(code);
	if (split === -1) return undefined;
	const left = code.slice(0, split).trim();
	const right = code.slice(split + 1).replace(/\s+/g, " ").trim();
	const name = /(?:^|[^A-Za-z0-9_'\\])('?(?:[A-Za-z0-9_]|\\.)+)$/.exec(left)?.[1];
	if (!name || !right) return undefined;
	const type = left.slice(0, left.length - name.length).replace(/\s+/g, " ").trim();
	if (!type) return undefined;
	const plainName = name.replace(/^'/, "").replace(/\\(.)/g, "$1");
	return right === "?" ? { name: plainName, type, required: true, line } : { name: plainName, type, required: false, defaultValue: right, line };
}

/** `source` with comments and documentation lines blanked, strings kept. */
function stripComments(source: string): string {
	let out = "";
	let i = 0;
	while (i < source.length) {
		const ch = source[i];
		if ((ch === "/" && source[i + 1] === "/") || ch === "#") {
			const end = source.indexOf("\n", i);
			i = end === -1 ? source.length : end;
			continue;
		}
		const skipped = ch === '"' || ch === "`" ? skipOpaque(source, i, []) : undefined;
		if (skipped !== undefined) {
			out += source.slice(i, skipped);
			i = skipped;
			continue;
		}
		out += ch;
		i++;
	}
	return out;
}

/** The index of the declaration's `=` (not `==` or `=>`) outside brackets, strings and templates; -1 when none. */
function topLevelAssign(code: string): number {
	let depth = 0;
	let i = 0;
	while (i < code.length) {
		const ch = code[i];
		if (ch === '"' || ch === "`") {
			i = skipOpaque(code, i, []) ?? i + 1;
			continue;
		}
		if (OPEN.includes(ch)) depth++;
		else if (CLOSE.includes(ch)) depth--;
		else if (ch === "=" && depth === 0 && code[i + 1] !== "=" && code[i + 1] !== ">" && !"=!<>".includes(code[i - 1] ?? "")) return i;
		i++;
	}
	return -1;
}

function lineAt(text: string, index: number): number {
	let line = 1;
	for (let i = 0; i < index; i++) if (text[i] === "\n") line++;
	return line;
}
