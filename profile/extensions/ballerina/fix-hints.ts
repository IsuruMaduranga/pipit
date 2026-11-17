/**
 * The compile-time errors the product gives advice for, one table (pure: no
 * pi imports, no file reads). The `ballerina` language server declares it as
 * its fix hints (`byCode`, `byMessage`), and the `# Ballerina` section lists
 * it in Common errors in every session (prompt.ts). A hint must hold for
 * every cause of its code or message, since the model follows it. A row is matched by its codes; by a message substring only
 * where its code is shared with unrelated errors (BCE0609 is every
 * "'<qualifier>' qualifier not allowed"). Every code, message and fix shape
 * was reproduced: working-docs/findings/02-language-server/diagnostic-codes.md.
 */

import type { ProductLanguageServer } from "../../../extensions/sdk/profile.ts";

/** The shape the base reads: `ProductLanguageServer.fixHints`. */
export type BallerinaFixHints = NonNullable<ProductLanguageServer["fixHints"]>;

export interface CompileError {
	/** What a diagnostic is matched by: its codes, or a substring of its message. */
	readonly match: { readonly codes: readonly string[] } | { readonly message: string };
	/** The messages as a reader is shown them, with placeholders. */
	readonly shown: readonly string[];
	/** One line of at most 200 characters (the base's limit). */
	readonly hint: string;
	/** Where the section lists it: with the general errors, or under the isolation lead-in. */
	readonly group: "general" | "isolation";
}

export const COMPILE_ERRORS: readonly CompileError[] = [
	{
		match: { codes: ["BCE2066"] },
		shown: ["incompatible types: expected 'X', found 'Y'"],
		hint: "Compare the value with the declared type of the variable or function at the reported line, and fix whichever is wrong.",
		group: "general",
	},
	{
		match: { codes: ["BCE2010", "BCE2000"] },
		shown: ["undefined symbol 'X'", "undefined module 'x'"],
		hint: "Add the missing `import`, or fix the name. For a library's name the error does not correct, look it up (see When to look a library up); never try a second guessed name.",
		group: "general",
	},
	{
		match: { codes: ["BCE2003"] },
		shown: ["cannot resolve module '<org>/<name>'"],
		hint: "Run `bal build` to pull it. If the error stays, check the name with `bal search`, or delete `Dependencies.toml` and build again.",
		group: "general",
	},
	{ match: { codes: ["BCE2002"] }, shown: ["unused module prefix 'x'"], hint: "Remove the import.", group: "general" },
	{
		match: { codes: ["BCE0002"] },
		shown: ["missing semicolon token"],
		hint: "Add the `;` that ends the statement before the reported position; if it is there, look above for an unclosed bracket, parenthesis or string.",
		group: "general",
	},
	{
		match: { codes: ["BCE0005"] },
		shown: ["missing close parenthesis token"],
		hint: "A `(` before the reported position is never closed; add the `)` where its expression ends.",
		group: "general",
	},
	{
		// Also what a module-level declaration inside a function gives, with no brace left open.
		match: { codes: ["BCE0007"] },
		shown: ["missing close brace token"],
		hint: "Close a `{` left open above the reported position. If none is, the statement there is valid only at module level (`configurable`, `public`, `service`); move it out of the function.",
		group: "general",
	},
	{
		match: { codes: ["BCE0600"] },
		shown: ["invalid token '<word>'"],
		hint: "When the token is a reserved word used as a name, quote it (`'limit`) or rename it.",
		group: "general",
	},
	{
		match: { codes: ["BCE3943"] },
		shown: ["invalid access of mutable storage in an 'isolated' function"],
		hint: "Make a module variable that never changes `final` with a `readonly` type, or make shared state `isolated` and use it only inside `lock { }`. Never remove `isolated` to silence this.",
		group: "isolation",
	},
	{
		match: { codes: ["BCE3947"] },
		shown: ["invalid invocation of a non-isolated function in an 'isolated' function"],
		hint: "Mark the called function `isolated` (its body must then follow the same rules); to call a function value, declare its type `isolated function`.",
		group: "isolation",
	},
	{
		match: { codes: ["BCE3961"] },
		shown: ["invalid invocation of a non-isolated function in a 'lock' statement with restricted variable usage"],
		hint: "Mark the called function `isolated` (its body must then follow the same rules), or call it outside the lock.",
		group: "isolation",
	},
	{
		match: { codes: ["BCE3946"] },
		shown: ["incompatible types: expected an 'isolated' function"],
		hint: "A function value passed from an isolated context (to `map`, `filter`, `forEach`) must be `isolated` too, as in `nums.map(isolated function (int n) returns int => n * 2)`.",
		group: "isolation",
	},
	{
		match: { codes: ["BCE3962"] },
		shown: ["invalid access of an 'isolated' variable outside a 'lock' statement"],
		hint: "Wrap each access to the variable in `lock { }`.",
		group: "isolation",
	},
	{
		match: { codes: ["BCE3964"] },
		shown: ["cannot access more than one variable for which usage is restricted in a single 'lock' statement"],
		hint: "Use one `lock` per isolated variable or `self`, and carry values through a local (`int v; lock { v = other; } lock { total = v; }`). Keep state that changes together in one record behind one variable.",
		group: "isolation",
	},
	{
		match: { codes: ["BCE3959"] },
		shown: ["invalid attempt to transfer out a value from a 'lock' statement ..."],
		hint: "A mutable value crosses the lock boundary; copy it (`return store.clone();`, `store = incoming.clone();`), or take the parameter as `readonly` (`map<int> & readonly incoming`).",
		group: "isolation",
	},
	{
		match: { codes: ["BCE3960"] },
		shown: ["invalid attempt to transfer a value into a 'lock' statement ..."],
		hint: "A mutable value enters the lock; store a copy (`store = incoming.clone();`), or take the parameter as `readonly` (`map<int> & readonly incoming`).",
		group: "isolation",
	},
	{
		match: { codes: ["BCE3956"] },
		shown: ["invalid non-private mutable field in an 'isolated' object"],
		hint: "Make the field `private`, or `final` with an immutable type.",
		group: "isolation",
	},
	{
		match: { codes: ["BCE3957"] },
		shown: ["invalid access of a mutable field of an 'isolated' object outside a 'lock' statement"],
		hint: "Wrap the `self` access in `lock { }`, and clone a mutable value that leaves the lock.",
		group: "isolation",
	},
	{
		match: { codes: ["BCE3958"] },
		shown: ["invalid initial value expression: expected an isolated expression"],
		hint: "In an isolated class's `init`, store a copy of a mutable argument (`self.data = data.clone();`); in a field's initializer, use a literal.",
		group: "isolation",
	},
	{
		match: { codes: ["BCE3944"] },
		shown: ["invalid access of mutable storage in the default value of a record field"],
		hint: "Use a literal as the default, or set the value when you build the record.",
		group: "isolation",
	},
	{
		match: { codes: ["BCE3945"] },
		shown: ["invalid access of mutable storage in the initializer of an object field"],
		hint: "Use a literal as the initializer, or assign the value in the object's `init`.",
		group: "isolation",
	},
	{
		match: { codes: ["BCE2081", "BCE4042", "BCE4043"] },
		shown: [
			"cannot use an async call inside a lock statement",
			"using send action within the lock statement is not allowed",
			"using receive action within the lock statement is not allowed",
		],
		hint: "Copy what you need into a local inside the lock, and do the `start`, send or receive after the lock ends.",
		group: "isolation",
	},
	{
		match: { message: "'isolated' qualifier not allowed" },
		shown: ["'isolated' qualifier not allowed"],
		hint: "On a module variable, add an initializer (`isolated int[] requests = [];`); on a local variable or a parameter, remove `isolated`.",
		group: "isolation",
	},
];

export const BALLERINA_FIX_HINTS: BallerinaFixHints = {
	byCode: Object.fromEntries(COMPILE_ERRORS.flatMap(({ match, hint }) => ("codes" in match ? match.codes.map((code) => [code, hint]) : []))),
	byMessage: COMPILE_ERRORS.flatMap(({ match, hint }) => ("message" in match ? [[match.message, hint] as const] : [])),
};
