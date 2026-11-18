/**
 * The product's shell words (the profile's `text.shell`): the bash and
 * PowerShell descriptions (bash-description.ts, powershell-description.ts),
 * their parameters, and the guideline for a machine where PowerShell is the
 * primary shell. Sentences naming a tool that is off are cut or reworded here.
 */

import type { LiveTools, ShellText } from "../../../extensions/sdk/profile.ts";
import { BASH_EDIT_LINE, BASH_MONITOR_SLEEP, BASH_MONITOR_STREAM, BASH_MONITOR_WAIT, BASH_PARAMS, BASH_YIELD_LINE, BASH_YIELD_WAIT, bashDescription } from "./bash-description.ts";
import { POWERSHELL_EDIT_LINE, POWERSHELL_MONITOR_CLAUSE, POWERSHELL_NO_TASK_TOOLS, POWERSHELL_TASK_TOOLS, POWERSHELL_YIELD_CLAUSE, powerShellToolDescription } from "./powershell-description.ts";
import { type ToolPassages, withoutOff } from "../../../extensions/sdk/profile.ts";


const BASH_PASSAGES: ToolPassages = {
	yield: [BASH_YIELD_WAIT, BASH_YIELD_LINE],
	monitor: [
		[BASH_MONITOR_WAIT, " A `sleep` in the foreground is blocked."],
		BASH_MONITOR_STREAM,
		[BASH_MONITOR_SLEEP, "  - A command that opens with a long `sleep` is blocked. Do not string short sleeps together to get past the block.\n"],
	],
	// The commit and pull request sections tell the model not to start an agent. They never name task_create: its tools are withheld unless a knob turns them on, which the text cannot see.
	Agent: ["- Do not call the Agent tool here\n"],
	edit: [BASH_EDIT_LINE],
};

const POWERSHELL_PASSAGES: ToolPassages = {
	yield: [POWERSHELL_YIELD_CLAUSE],
	task_stop: [[POWERSHELL_TASK_TOOLS, POWERSHELL_NO_TASK_TOOLS]],
	monitor: [POWERSHELL_MONITOR_CLAUSE],
	edit: [POWERSHELL_EDIT_LINE],
};

/** The group, for the tools this session can have (`live`): text naming a tool that is off leaves it out. */

export const shellText = (live: LiveTools): ShellText => ({
	powershellPrimary: "PowerShell is this machine's main shell: run terminal work (git, npm, build tools) through the powershell tool",
	bashDescription: ({ form, autoMode, searchTools }) => withoutOff(bashDescription(form, autoMode, searchTools), live, BASH_PASSAGES),
	bashParams: BASH_PARAMS,
	powershellDescription: ({ edition }) => withoutOff(powerShellToolDescription(edition), live, POWERSHELL_PASSAGES),
	powershellParams: {
		command: "The PowerShell command to run",
		timeout: "Optional limit in milliseconds (at most 600000)",
		description: "A short, plain description of what the command does, in the active voice.",
		run_in_background: "True to run the command in the background.",
	},
});
