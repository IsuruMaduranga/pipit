/**
 * The product's language-server words (the profile's `text.lsp`): the
 * lsp_diagnostics tool's description and parameters.
 */

import type { LspText } from "../../../extensions/sdk/profile.ts";

export const lsp: LspText = {
	description:
		"Get a file's diagnostics (errors and warnings) from its language server, for the file as it is on disk now. Ballerina (.bal) files are checked by the Ballerina language server of the installed distribution. TypeScript, JavaScript, Python, Go, Rust and Java files are checked when the matching server is installed, and so is any language a plugin's .lsp.json sets up.",
	params: {
		path: "The file to check, absolute or relative to the workspace",
		severity: "The lowest severity to report (all when left out)",
	},
};
