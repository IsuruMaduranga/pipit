/**
 * The product's task_output and task_stop words (the profile's
 * `text.background.tasks`). A background task is addressed by its id.
 * This product turns task_output off (profile/index.ts), so its text is sent
 * only if a later version turns it on. index.ts rewords the list of task
 * kinds when monitor or bash is off, and cuts the agent sentence when Agent
 * is off.
 */

import type { TaskToolsText } from "../../../extensions/sdk/profile.ts";

/** The kinds of background task, as task_output's description lists them. */
export const TASK_KINDS = "(monitor, background subagent, or background bash)";

/** The sentence that keeps it off background agents, cut when Agent is off. */
export const TASK_OUTPUT_AGENT = " It never waits for a background subagent: an agent's report comes only as its notification.";

export const tasks: TaskToolsText = {
	outputDescription:
		`Get the output of a background task ${TASK_KINDS}, running or finished, by its task id. With block=true (the default) it waits up to \`timeout\` ms for the task to finish; with block=false it returns the current state at once.${TASK_OUTPUT_AGENT} You do not need it to learn that a task ended: a task notification tells you, and names the file with the output. Call it when your next step needs the result right away and you want to read the output itself, or to look at a task while it runs.`,
	outputParams: {
		taskId: "The id of the task whose output you want",
		block: "Wait for the task to finish (true by default)",
		timeout: "The longest wait in ms (30000 by default)",
	},
	stopDescription:
		"\n- Stops a background task that is still running\n- Takes the task's id as task_id\n- Reports whether the task was stopped\n- Use it to end a long-running task you no longer need\n",
	stopParams: { taskId: "Id of the running background task to end." },
};
