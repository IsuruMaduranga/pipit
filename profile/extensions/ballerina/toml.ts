/**
 * A small TOML reader for the two files the Ballerina extension reads:
 * `Ballerina.toml` (the package's org and name, a workspace's packages) and
 * `Config.toml` (which configurable variables are set, and the values to
 * redact). Pure: no pi imports, no file access.
 *
 * It keeps what those jobs need: every key path with its value, every
 * table header, and the line each sits on. Strings are decoded; any other
 * scalar (number, boolean, date) is kept as its raw text. It rejects what
 * Ballerina rejects and a reader would silently get wrong: a key or a table
 * defined twice, an unterminated string, a malformed line. The error names
 * the line, so the user can fix the file.
 */

export type TomlValue =
	| { kind: "string"; value: string }
	| { kind: "array"; items: TomlValue[] }
	| { kind: "table"; entries: Array<[string, TomlValue]> }
	| { kind: "other"; raw: string };

export interface TomlEntry {
	/** The full key path: the table header's keys, then the (dotted) key. */
	path: string[];
	/** How many leading keys of `path` came from the table header. */
	headerLength: number;
	value: TomlValue;
	/** 1-based. */
	line: number;
}

export interface TomlHeader {
	path: string[];
	/** `[[x]]`: one element of an array of tables. */
	arrayTable: boolean;
	line: number;
}

export interface TomlDocument {
	entries: TomlEntry[];
	headers: TomlHeader[];
}

export class TomlError extends Error {
	readonly line: number;
	readonly reason: string;
	constructor(line: number, reason: string) {
		super(`line ${line}: ${reason}`);
		this.line = line;
		this.reason = reason;
	}
}

const BARE_KEY = /[A-Za-z0-9_-]/;

class Reader {
	pos = 0;
	line = 1;
	readonly text: string;
	constructor(text: string) {
		this.text = text;
	}

	get done(): boolean {
		return this.pos >= this.text.length;
	}
	peek(offset = 0): string {
		return this.text[this.pos + offset] ?? "";
	}
	startsWith(token: string): boolean {
		return this.text.startsWith(token, this.pos);
	}
	next(): string {
		const ch = this.text[this.pos++] ?? "";
		if (ch === "\n") this.line++;
		return ch;
	}
	fail(reason: string): never {
		throw new TomlError(this.line, reason);
	}
	/** Spaces and tabs only. */
	skipBlank(): void {
		while (this.peek() === " " || this.peek() === "\t") this.pos++;
	}
	/** Blanks, newlines and comments: the gaps inside an array or a multi-line inline table. */
	skipGaps(): void {
		for (;;) {
			const ch = this.peek();
			if (ch === " " || ch === "\t" || ch === "\r" || ch === "\n") this.next();
			else if (ch === "#") this.skipComment();
			else return;
		}
	}
	skipComment(): void {
		while (!this.done && this.peek() !== "\n") this.pos++;
	}
	/** After a statement: blanks, an optional comment, then a newline or the end. */
	endLine(): void {
		this.skipBlank();
		if (this.peek() === "#") this.skipComment();
		if (this.peek() === "\r") this.pos++;
		if (this.done) return;
		if (this.peek() !== "\n") this.fail(`unexpected "${this.peek()}" after the value; one key = value per line`);
		this.next();
	}
}

function readKey(r: Reader): string[] {
	const parts: string[] = [];
	for (;;) {
		r.skipBlank();
		const ch = r.peek();
		if (ch === '"') parts.push(readBasicString(r));
		else if (ch === "'") parts.push(readLiteralString(r));
		else {
			const start = r.pos;
			while (BARE_KEY.test(r.peek())) r.pos++;
			if (r.pos === start) r.fail(ch ? `expected a key, found "${ch}"` : "expected a key");
			parts.push(r.text.slice(start, r.pos));
		}
		r.skipBlank();
		if (r.peek() !== ".") return parts;
		r.pos++;
	}
}

function readBasicString(r: Reader): string {
	r.pos++; // opening quote
	let out = "";
	for (;;) {
		const ch = r.peek();
		if (r.done || ch === "\n") r.fail("unterminated string");
		r.pos++;
		if (ch === '"') return out;
		if (ch === "\\") out += readEscape(r);
		else out += ch;
	}
}

function readEscape(r: Reader): string {
	const ch = r.next();
	switch (ch) {
		case "b":
			return "\b";
		case "t":
			return "\t";
		case "n":
			return "\n";
		case "f":
			return "\f";
		case "r":
			return "\r";
		case "e":
			return "\x1b";
		case '"':
			return '"';
		case "\\":
			return "\\";
		case "u":
		case "U": {
			const length = ch === "u" ? 4 : 8;
			const hex = r.text.slice(r.pos, r.pos + length);
			if (!/^[0-9A-Fa-f]+$/.test(hex) || hex.length !== length) r.fail(`invalid \\${ch} escape`);
			r.pos += length;
			const code = Number.parseInt(hex, 16);
			if (code > 0x10ffff) r.fail(`invalid \\${ch} escape`);
			return String.fromCodePoint(code);
		}
		default:
			return r.fail(`invalid escape "\\${ch}"`);
	}
}

function readLiteralString(r: Reader): string {
	r.pos++;
	const end = r.text.indexOf("'", r.pos);
	const newline = r.text.indexOf("\n", r.pos);
	if (end === -1 || (newline !== -1 && newline < end)) r.fail("unterminated string");
	const value = r.text.slice(r.pos, end);
	r.pos = end + 1;
	return value;
}

function readMultilineString(r: Reader, quote: '"""' | "'''"): string {
	r.pos += 3;
	// A newline right after the opening delimiter is trimmed.
	if (r.startsWith("\r\n")) r.pos += 2;
	if (r.peek() === "\n") r.next();
	let out = "";
	for (;;) {
		if (r.done) r.fail("unterminated multi-line string");
		if (r.startsWith(quote)) {
			// Up to two quotes may sit right before the closing delimiter.
			let extra = 0;
			while (extra < 2 && r.text.startsWith(quote[0], r.pos + 3 + extra)) extra++;
			out += quote[0].repeat(extra);
			r.pos += 3 + extra;
			return out;
		}
		const ch = r.next();
		if (quote === '"""' && ch === "\\") {
			// A line-ending backslash trims the newline and the whitespace after it.
			const rest = /^[ \t]*\r?\n/.exec(r.text.slice(r.pos));
			if (rest) {
				while (/[ \t\r\n]/.test(r.peek())) r.next();
				continue;
			}
			out += readEscape(r);
		} else out += ch;
	}
}

function readValue(r: Reader): TomlValue {
	r.skipBlank();
	if (r.startsWith('"""')) return { kind: "string", value: readMultilineString(r, '"""') };
	if (r.startsWith("'''")) return { kind: "string", value: readMultilineString(r, "'''") };
	const ch = r.peek();
	if (ch === '"') return { kind: "string", value: readBasicString(r) };
	if (ch === "'") return { kind: "string", value: readLiteralString(r) };
	if (ch === "[") return readArray(r);
	if (ch === "{") return readInlineTable(r);
	const start = r.pos;
	// A scalar runs to the next delimiter; a date-time may hold one space ("1979-05-27 07:32:00").
	while (!r.done && !/[,\]}#\r\n]/.test(r.peek())) {
		if (r.peek() === " " && !/^ \d{2}:/.test(r.text.slice(r.pos, r.pos + 4))) break;
		r.pos++;
	}
	const raw = r.text.slice(start, r.pos).trim();
	if (!raw) r.fail(ch ? `expected a value, found "${ch}"` : "expected a value");
	if (!/^(true|false|[+-]?(inf|nan)|[+-]?[0-9][0-9A-Za-z_.:+-]*|\d{4}-\d{2}-\d{2} \d{2}:[0-9A-Za-z_.:+-]*)$/.test(raw)) {
		r.fail(`"${raw}" is not a TOML value; a text value needs quotes ("${raw}")`);
	}
	return { kind: "other", raw };
}

function readArray(r: Reader): TomlValue {
	r.pos++;
	const items: TomlValue[] = [];
	for (;;) {
		r.skipGaps();
		if (r.peek() === "]") {
			r.pos++;
			return { kind: "array", items };
		}
		if (r.done) r.fail("unterminated array");
		items.push(readValue(r));
		r.skipGaps();
		if (r.done) r.fail("unterminated array");
		if (r.peek() === ",") r.pos++;
		else if (r.peek() !== "]") r.fail(`expected "," or "]" in the array, found "${r.peek()}"`);
	}
}

function readInlineTable(r: Reader): TomlValue {
	r.pos++;
	const table: { kind: "table"; entries: Array<[string, TomlValue]> } = { kind: "table", entries: [] };
	const seen = new Set<string>();
	for (;;) {
		r.skipGaps();
		if (r.peek() === "}") {
			r.pos++;
			return table;
		}
		if (r.done) r.fail("unterminated inline table");
		const key = readKey(r);
		if (r.peek() !== "=") r.fail(`expected "=" after the key ${key.join(".")}`);
		r.pos++;
		const value = readValue(r);
		const id = JSON.stringify(key);
		if (seen.has(id)) r.fail(`the key ${key.join(".")} is set twice in one inline table`);
		seen.add(id);
		setNested(table, key, value);
		r.skipGaps();
		if (r.done) r.fail("unterminated inline table");
		if (r.peek() === ",") r.pos++;
		else if (r.peek() !== "}") r.fail(`expected "," or "}" in the inline table, found "${r.peek()}"`);
	}
}

/** Put a dotted key's value into an inline table, making the intermediate tables. */
function setNested(table: { entries: Array<[string, TomlValue]> }, key: string[], value: TomlValue): void {
	let current = table;
	for (const part of key.slice(0, -1)) {
		let found = current.entries.find(([name]) => name === part)?.[1];
		if (!found) {
			found = { kind: "table", entries: [] };
			current.entries.push([part, found]);
		}
		if (found.kind !== "table") return;
		current = found;
	}
	current.entries.push([key[key.length - 1], value]);
}

/** Parse `text`; throws a `TomlError` naming the line of the first problem. */
export function parseToml(text: string): TomlDocument {
	const r = new Reader(text.replace(/^\uFEFF/, ""));
	const entries: TomlEntry[] = [];
	const headers: TomlHeader[] = [];
	const defined = new Map<string, "value" | "table">();
	let header: string[] = [];
	// Keys under an array-table element are scoped to that element.
	let scope = "";
	const id = (path: readonly string[]) => scope + JSON.stringify(path);

	for (;;) {
		r.skipGaps();
		if (r.done) return { entries, headers };
		const line = r.line;
		if (r.peek() === "[") {
			const arrayTable = r.startsWith("[[");
			r.pos += arrayTable ? 2 : 1;
			const path = readKey(r);
			if (!r.startsWith(arrayTable ? "]]" : "]")) r.fail(`expected "${arrayTable ? "]]" : "]"}" to close the section header`);
			r.pos += arrayTable ? 2 : 1;
			r.endLine();
			scope = arrayTable ? `${line}:` : "";
			const key = JSON.stringify(path);
			if (!arrayTable) {
				const before = defined.get(key);
				if (before === "table") throw new TomlError(line, `the section [${path.join(".")}] appears twice; TOML allows each section once, so add the keys under the first one`);
				if (before === "value") throw new TomlError(line, `[${path.join(".")}] is already set as a value`);
				defined.set(key, "table");
			}
			headers.push({ path, arrayTable, line });
			header = path;
			continue;
		}
		const key = readKey(r);
		if (r.peek() !== "=") r.fail(`expected "=" after the key ${key.join(".")}`);
		r.pos++;
		const value = readValue(r);
		r.endLine();
		const path = [...header, ...key];
		const at = id(path);
		if (defined.has(at)) throw new TomlError(line, `the key ${path.join(".")} is set twice`);
		defined.set(at, "value");
		entries.push({ path, headerLength: header.length, value, line });
	}
}

/** Every string a value holds, through arrays and inline tables, with the dotted key it sits under. */
export function stringsIn(value: TomlValue, key: string): Array<{ key: string; value: string }> {
	switch (value.kind) {
		case "string":
			return [{ key, value: value.value }];
		case "array":
			return value.items.flatMap((item) => stringsIn(item, key));
		case "table":
			return value.entries.flatMap(([name, item]) => stringsIn(item, `${key}.${name}`));
		default:
			return [];
	}
}

/**
 * The text values of a file `parseToml` rejects, so its secrets are still
 * redacted: every quoted string on any line, and the bare text after a
 * `key =` that is no number, boolean or date (a value the user forgot to
 * quote is the likeliest secret in a broken file). Never throws.
 */
export function looseStrings(text: string): Array<{ key: string; value: string }> {
	const found: Array<{ key: string; value: string }> = [];
	const multiline = /("""|''')([\s\S]*?)\1/g;
	const withoutMultiline = text.replace(multiline, (_all, _quote, body: string) => {
		found.push({ key: "", value: body.replace(/^\r?\n/, "") });
		return '""';
	});
	for (const line of withoutMultiline.split("\n")) {
		const key = /^\s*([A-Za-z0-9_.-]+)\s*=/.exec(line)?.[1] ?? "";
		for (const match of line.matchAll(/"((?:[^"\\]|\\.)*)"|'([^']*)'/g)) {
			const value = match[2] ?? match[1].replace(/\\(["\\])/g, "$1");
			if (value) found.push({ key, value });
		}
		const bare = /^\s*[A-Za-z0-9_.-]+\s*=\s*([^"'[{#\s][^#]*?)\s*(#.*)?$/.exec(line)?.[1];
		if (bare && !/^(true|false|[+-]?(inf|nan)|[+-]?[0-9][0-9A-Za-z_.:+ -]*)$/.test(bare)) found.push({ key, value: bare });
	}
	return found;
}
