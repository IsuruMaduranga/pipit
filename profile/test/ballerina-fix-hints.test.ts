/**
 * The fix hints the `ballerina` language server declares
 * (profile/extensions/ballerina/fix-hints.ts), run through the base's own
 * validator, matcher and `<new-diagnostics>` formatter. Each sample below is
 * a diagnostic as Ballerina 2201.14.0 sent it, the same from the stock server
 * and the BI jar (working-docs/findings/02-language-server/diagnostic-codes.md),
 * so every hint the table declares is matched by a diagnostic that was
 * reproduced, and no code in it went unchecked.
 */
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { languageServerProblems, MAX_FIX_HINT_LENGTH, resolveLanguageServers } from "../../extensions/lib/profile/language-servers.ts";
import { fixHintFor, withFixHints } from "../../extensions/tools/lsp/fix-hints.ts";
import type { LspDiagnostic } from "../../extensions/tools/lsp/format.ts";
import { formatNewDiagnostics } from "../../extensions/tools/lsp/watcher.ts";
import { BALLERINA_SERVER, ballerinaLanguageServer } from "../extensions/ballerina/bi-language-server.ts";
import { BALLERINA_FIX_HINTS, COMPILE_ERRORS } from "../extensions/ballerina/fix-hints.ts";
import { profile } from "../index.ts";
import { EM_DASH } from "./em-dash.ts";

/** Code, then message, as the servers sent them. */
const REPRODUCED: readonly (readonly [string, string])[] = [
	["BCE2066", "incompatible types: expected 'int', found 'string'"],
	["BCE2010", "undefined symbol 'y'"],
	["BCE2000", "undefined module 'io'"],
	["BCE2003", "cannot resolve module 'ballerinax/nosuchpackagexyz'"],
	["BCE2002", "unused module prefix 'io'"],
	["BCE0002", "missing semicolon token"],
	["BCE0005", "missing close parenthesis token"],
	["BCE0007", "missing close brace token"],
	["BCE0600", "invalid token 'limit'"],
	["BCE3943", "invalid access of mutable storage in an 'isolated' function"],
	["BCE3947", "invalid invocation of a non-isolated function in an 'isolated' function"],
	["BCE3961", "invalid invocation of a non-isolated function in a 'lock' statement with restricted variable usage"],
	["BCE3946", "incompatible types: expected an 'isolated' function"],
	["BCE3962", "invalid access of an 'isolated' variable outside a 'lock' statement"],
	["BCE3964", "cannot access more than one variable for which usage is restricted in a single 'lock' statement"],
	["BCE3959", "invalid attempt to transfer out a value from a 'lock' statement with restricted variable usage: expected an isolated expression"],
	["BCE3960", "invalid attempt to transfer a value into a 'lock' statement with restricted variable usage"],
	["BCE3956", "invalid non-private mutable field in an 'isolated' object"],
	["BCE3957", "invalid access of a mutable field of an 'isolated' object outside a 'lock' statement"],
	["BCE3958", "invalid initial value expression: expected an isolated expression"],
	["BCE3944", "invalid access of mutable storage in the default value of a record field"],
	["BCE3945", "invalid access of mutable storage in the initializer of an object field"],
	["BCE2081", "cannot use an async call inside a lock statement"],
	["BCE4042", "using send action within the lock statement is not allowed to prevent possible deadlocks"],
	["BCE4043", "using receive action within the lock statement is not allowed to prevent possible deadlocks"],
	["BCE0609", "'isolated' qualifier not allowed"],
];

/**
 * The same codes and messages from a second cause, which the hint must also
 * fit: a module-level declaration in a function (`configurable`, `public`,
 * `service`) gives BCE0007 with no brace open; `isolated` on a local
 * variable or a parameter; a call to a function-typed parameter; `self` and
 * an isolated variable in one lock.
 */
const SECOND_CAUSES: readonly (readonly [string, string, string])[] = [
	["BCE0007", "missing close brace token", "valid only at module level"],
	["BCE0609", "'isolated' qualifier not allowed", "on a local variable or a parameter, remove `isolated`"],
	["BCE3947", "invalid invocation of a non-isolated function in an 'isolated' function", "declare its type `isolated function`"],
	["BCE3964", "cannot access more than one variable for which usage is restricted in a single 'lock' statement", "or `self`"],
];

/** Diagnostics the servers sent beside the ones above that carry no hint, on purpose. */
const UNHINTED: readonly (readonly [string, string])[] = [
	// The same code as `'isolated' qualifier not allowed`, for an unrelated qualifier.
	["BCE0609", "'final' qualifier not allowed"],
	["BCE0400", "missing identifier"],
	["BCE2011", "undefined function 'println'"],
	["BCE0411", "missing double quote"],
	["BCE0012", "missing binary operator"],
];

const diag = (code: string | undefined, message: string, line = 0): LspDiagnostic => ({
	message,
	severity: 1,
	range: { start: { line, character: 0 } },
	...(code === undefined ? {} : { code }),
});

const [resolved] = resolveLanguageServers({ [BALLERINA_SERVER]: ballerinaLanguageServer() }, "/profile");
const hints = resolved.fixHints!;

describe("the ballerina server's fix hints", () => {
	it("load: the base finds no problem in them, on every platform's declaration", () => {
		for (const platform of ["darwin", "linux", "win32"] as const) {
			expect(languageServerProblems({ [BALLERINA_SERVER]: ballerinaLanguageServer(platform) })).toEqual([]);
			expect(ballerinaLanguageServer(platform).fixHints).toBe(BALLERINA_FIX_HINTS);
		}
		expect(profile.languageServers?.[BALLERINA_SERVER]?.fixHints).toBe(BALLERINA_FIX_HINTS);
	});

	it("are each one trimmed line of at most the base's length, with no em dash", () => {
		for (const { shown, hint } of COMPILE_ERRORS) {
			expect(hint.length, shown[0]).toBeLessThanOrEqual(MAX_FIX_HINT_LENGTH);
			expect(hint, shown[0]).not.toMatch(/[\r\n]/);
			expect(hint.trim(), shown[0]).toBe(hint);
			expect(hint.includes(EM_DASH), shown[0]).toBe(false);
		}
	});

	it("give each code one row: the derived byCode would keep only the last", () => {
		const codes = COMPILE_ERRORS.flatMap(({ match }) => ("codes" in match ? match.codes : []));
		expect(new Set(codes).size).toBe(codes.length);
		expect(Object.keys(BALLERINA_FIX_HINTS.byCode ?? {})).toHaveLength(codes.length);
	});

	it("match each reproduced diagnostic by its code, or by its message where the code is shared", () => {
		for (const [code, message] of REPRODUCED) {
			const hint = fixHintFor(diag(code, message), hints);
			expect(hint, `${code} ${message}`).toBeDefined();
			if (code === "BCE0609") expect(hint).toEqual({ key: "'isolated' qualifier not allowed", hint: BALLERINA_FIX_HINTS.byMessage?.[0][1] });
			else expect(hint).toEqual({ key: code, hint: BALLERINA_FIX_HINTS.byCode?.[code] });
		}
	});

	it("fit the second cause of a code or message, not only the first", () => {
		for (const [code, message, part] of SECOND_CAUSES) expect(fixHintFor(diag(code, message), hints)?.hint, `${code} ${message}`).toContain(part);
	});

	it("declare no code that no reproduced diagnostic carries", () => {
		const reproduced = new Set(REPRODUCED.map(([code]) => code));
		for (const code of Object.keys(BALLERINA_FIX_HINTS.byCode ?? {})) expect(reproduced.has(code), code).toBe(true);
		for (const [substring] of BALLERINA_FIX_HINTS.byMessage ?? []) expect(REPRODUCED.some(([, message]) => message.includes(substring)), substring).toBe(true);
	});

	it("leave the other diagnostics without a hint", () => {
		for (const [code, message] of UNHINTED) expect(fixHintFor(diag(code, message), hints), `${code} ${message}`).toBeUndefined();
	});

	it("follow the <new-diagnostics> block the model gets after an edit, in the base's frame", () => {
		const project = resolve("/project");
		const uri = pathToFileURL(join(project, "main.bal")).href;
		const delta = new Map([
			[
				uri,
				withFixHints(
					[
						diag("BCE3943", "invalid access of mutable storage in an 'isolated' function", 3),
						diag("BCE0609", "'isolated' qualifier not allowed", 0),
						diag("BCE2011", "undefined function 'println'", 5),
					],
					hints,
				),
			],
		]);
		const block = formatNewDiagnostics(delta, project) ?? "";
		expect(block).toContain("invalid access of mutable storage in an 'isolated' function [BCE3943]");
		expect(block).toContain(
			`\n\nFix hints:\nBCE3943: ${BALLERINA_FIX_HINTS.byCode?.BCE3943}\n'isolated' qualifier not allowed: ${BALLERINA_FIX_HINTS.byMessage?.[0][1]}\n</new-diagnostics>`,
		);
	});
});
