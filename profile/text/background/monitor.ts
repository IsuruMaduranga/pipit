/**
 * The product's monitor words (the profile's `text.background.monitor`): the
 * tool's description and parameters. This product turns monitor off
 * (profile/index.ts), so the text is sent only if a later version turns it
 * on. index.ts cuts the passages that name bash when bash is off.
 */

import type { MonitorText } from "../../../extensions/sdk/profile.ts";

/** The sentence that sends a single command's completion to bash. */
export const MONITOR_BASH_ALTERNATIVE = "; to learn only when one command finishes, run it with bash and run_in_background: true instead, since its completion is reported anyway";

export const monitor: MonitorText = {
	description:
		`Watch a long-running command in the background and hear about each event it reports. Every line the command prints reaches the conversation as a notification while you go on working, and the watch ends when the command exits. It suits "tell me whenever X happens", such as tail -f on a log or an until-loop that waits for a condition${MONITOR_BASH_ALTERNATIVE}. ` +
		"The result is a task id: stop the watch with task_stop and look at it with task_output (both are deferred: load them through tool_search first). A WebSocket can be watched too: give its URL as `ws` in place of a command, and every text frame counts as an event.",
	params: ({ defaultTimeoutMs, maxTimeoutMs }) => ({
		command: "The shell command to watch; each line it prints is an event, and its exit ends the watch",
		description: "A short description of what is watched, shown in notifications",
		persistent: "Keep watching for the rest of the session, with no deadline; stop it with task_stop",
		timeoutMs: `Stop the watch after this many milliseconds (${defaultTimeoutMs} by default, at most ${maxTimeoutMs}); ignored when persistent`,
		ws: "A WebSocket URL to watch in place of a command; every text frame counts as an event, and the watch ends when the socket closes",
	}),
};
