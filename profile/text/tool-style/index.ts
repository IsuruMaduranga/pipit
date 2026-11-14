/**
 * The product's tool-style text (the profile's `text.toolStyle`): the write
 * tool's description, short on frontier and workhorse models and long on
 * cheap and tiny ones (lib/profile/tool-variants.ts), and the rule appended
 * to pi's edit description. Overwriting a file that was not read is refused
 * by the file tracker (safety/file-tracker/tracker.ts), so both forms say so.
 * Read and edit otherwise keep pi's own descriptions.
 */

import type { LiveTools, ToolStyleText } from "../../../extensions/sdk/profile.ts";
import { type ToolPassages, withoutOff } from "../../../extensions/sdk/profile.ts";

export const WRITE_SHORT_DESCRIPTION = `Write a whole file to disk, replacing it if it exists.

Use it to create a file, or to rewrite one completely after reading it. Writing over an existing file you have not read is refused. For partial changes, use edit instead.`;

export const WRITE_LONG_DESCRIPTION = `Write a whole file to disk.

Rules:
- If a file already exists at the path, this replaces all of it.
- Read an existing file before writing over it. The write is refused if you have not read the file.
- To change part of an existing file, use the edit tool, which sends only the change. Keep this tool for new files and full rewrites.
- Do not create documentation files (*.md) or READMEs unless the user asked for them.
- Do not put emojis in files unless the user asked for them.`;

const WRITE_PASSAGES: ToolPassages = {
	edit: [" For partial changes, use edit instead.", "\n- To change part of an existing file, use the edit tool, which sends only the change. Keep this tool for new files and full rewrites."],
};

/** The group, for the tools this session can have (`live`): text naming a tool that is off leaves it out. */
export const toolStyleText = (live: LiveTools): ToolStyleText => ({
	writeDescription: (form) => withoutOff(form === "long" ? WRITE_LONG_DESCRIPTION : WRITE_SHORT_DESCRIPTION, live, WRITE_PASSAGES),
	/**
	 * pi's edit description plus the rule the file tracker enforces, which
	 * pi's own text does not state. Models that read with `cat` otherwise meet
	 * the refusal before they learn the rule.
	 */
	editDescription: ({ base }) =>
		`${base} You must have read the file earlier in this conversation, either with the read tool or with a shell command that printed all of it as it is on disk (cat, for example); otherwise the edit is refused. If the file has changed on disk since then, read it again first.`,
});
