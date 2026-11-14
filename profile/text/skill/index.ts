/**
 * The product's skill words (the profile's `text.skill`): the skill tool's
 * description, prompt snippet and parameters.
 */

import type { SkillText } from "../../../extensions/sdk/profile.ts";

export const skill: SkillText = {
	description:
		"Run a skill: load its instructions into this turn and follow them.\n\n" +
		"Skills are instruction sets the user, the project or a plugin provides for one kind of job, such as a release procedure, a checklist or a project convention. The skills you can use are listed, each with a one-line summary, in a system reminder. Before starting a task that a listed skill is for, call this tool, and then let the skill's instructions guide the work instead of your usual approach. When the user names a skill, for example by typing `/<name>` or asking for a slash command, they want it run.\n\n" +
		"- `skill`: the name exactly as the listing shows it, without a leading slash. A plugin's skill is named `<plugin>:<skill>`.\n" +
		"- `args`: optional text passed to the skill.\n" +
		"- `list`: true returns the available skills instead of running one.\n\n" +
		"Only names in the listing, or names the user typed, exist. The harness's own commands, such as `/help` or `/clear`, are not skills.",
	promptSnippet: "Run a listed skill to load its instructions for the task at hand",
	params: {
		skill: "The skill's name as listed, without a leading slash",
		args: "Optional text handed to the skill",
		list: "True to see the available skills instead of running one",
	},
};
