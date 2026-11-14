/**
 * The product's part of the permission gate's words (the profile's
 * `text.permissions`): the note a session opening in auto mode gets, which
 * steers the model toward working through bash. The secret-file refusal names
 * the product's own route to a configuration value.
 */

import type { LiveTools, PermissionsText } from "../../../extensions/sdk/profile.ts";
import { type ToolPassages, withoutOff } from "../../../extensions/sdk/profile.ts";

/** For most models: bash where it is simpler, the file tools where a shell edit is fragile. */
const NOTE =
	"In auto mode:\n\n" +
	"The bash tool is often the shorter way to work. Search with grep and find, read with cat, head or sed -n, and make small mechanical changes with sed, heredocs or short scripts, in place of the read, edit and write tools. " +
	"Use your judgment: reach for edit or write when a shell change would be brittle, such as an exact or multi-line replacement, or sed and awk options that behave differently on GNU and on BSD or macOS.";

/** For models that need firmer steering: bash for everything it can do. */
const FIRM_NOTE =
	"In auto mode:\n\n" +
	"Use the bash tool for everything it can do. Search with grep and find, read with cat, head or sed -n, and change files with sed, heredocs or short scripts, in place of the read, edit and write tools. " +
	"Switch to one of those tools only when bash really cannot do what is needed.";

const NOTE_PASSAGES: ToolPassages = {
	edit: [["the read, edit and write tools", "the read and write tools"], ["reach for edit or write when", "reach for write when"]],
};

/** The group, for the tools this session can have (`live`): text naming a tool that is off leaves it out. */
export const permissionsText = (live: LiveTools): PermissionsText => ({
	// The note is about working through bash: a session without it gets none.
	autoModeNote: ({ firm }) => (live.has("bash") ? withoutOff(firm ? FIRM_NOTE : NOTE, live, NOTE_PASSAGES) : ""),
	// Config.toml is the one secret file: the user sets its values, and config_status says which are set.
	secretFileRefusal:
		"Config.toml holds the values of the integration's configurable variables, which the user manages, so it cannot be read, written or named in a command here. " +
		"Call config_status to see which variables exist and which are set; it never shows a value. " +
		"When a value is missing, give the user the snippet to add to Config.toml in their own editor, then check again with config_status. Never ask for the value in the chat.",
});
