/**
 * The product's background text (the profile's `text.background`): the cron
 * tools, schedule_wakeup, monitor, task_output, task_stop and /loop. Of
 * these, this product offers only task_output and task_stop (for background
 * shells and subagents); the others are off in profile/index.ts, and their
 * text is kept short and true for the day they are turned on.
 */

import type { BackgroundText, LiveTools } from "../../../extensions/sdk/profile.ts";
import { type ToolPassages, withoutOff } from "../../../extensions/sdk/profile.ts";
import { cron } from "./cron.ts";
import { loop } from "./loop.ts";
import { MONITOR_BASH_ALTERNATIVE, monitor } from "./monitor.ts";
import { TASK_KINDS, tasks } from "./tasks.ts";
import { wakeup } from "./wakeup.ts";

export const background: BackgroundText = { cron, wakeup, monitor, tasks, loop };

/** Per tool, the passages of the monitor and task_output descriptions that name it. */
const DESCRIPTION_PASSAGES: ToolPassages = {
	bash: [MONITOR_BASH_ALTERNATIVE, [TASK_KINDS, "(monitor or background subagent)"]],
	// After bash's: with both off, its replacement leaves the second form.
	monitor: [[TASK_KINDS, "(background subagent or background bash)"], ["(monitor or background subagent)", "(background subagent)"]],
};

/** The group, for the tools this session can have (`live`): text naming a tool that is off leaves it out. */
export const backgroundText = (live: LiveTools): BackgroundText => ({
	...background,
	monitor: { ...monitor, description: withoutOff(monitor.description, live, DESCRIPTION_PASSAGES) },
	tasks: { ...tasks, outputDescription: withoutOff(tasks.outputDescription, live, DESCRIPTION_PASSAGES) },
});
