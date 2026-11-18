/**
 * The product's monitor words (the profile's `text.background.monitor`): the
 * tool's description and parameters. This product turns monitor off
 * (profile/index.ts), so the text is sent only if a later version turns it
 * on. Every watch has a deadline (`timeout_ms`): at it the last batch of
 * events says the watch expired, and the model starts it again if it still
 * needs it. index.ts cuts the passages that name bash, read or yield when
 * one is off.
 */

import type { MonitorText } from "../../../extensions/sdk/profile.ts";

/** The sentence that sends a single command's completion to bash. */
export const MONITOR_BASH_ALTERNATIVE = "; to learn only when one command finishes, run it with bash and run_in_background: true instead, since its completion is reported anyway";

/** Where stderr goes, cut when read is off. */
export const MONITOR_STDERR = " Lines on stderr are not events; they go to the watch's output file, which read opens.";

/** The sentence that tells watching apart from waiting, cut when yield is off. */
export const MONITOR_YIELD = " The watch only reports events; to wait for one when you have nothing else to do, call yield.";

export const monitor: MonitorText = {
	description:
		`Watch a long-running command in the background and hear about each event it reports. Every line the command prints reaches the conversation as a notification while you go on working, and the watch ends when the command exits. It suits "tell me whenever X happens", such as tail -f on a log or an until-loop that waits for a condition${MONITOR_BASH_ALTERNATIVE}.${MONITOR_YIELD} ` +
		`Every watch has a deadline, \`timeout_ms\`: when it passes, the watch stops and its last notification says so and how many events it delivered; start it again if you still need it. The result is a task id: stop the watch early with task_stop (deferred: load it through tool_search first).${MONITOR_STDERR} A WebSocket can be watched too: give its URL as \`ws\` in place of a command, and every text frame counts as an event.`,
	params: ({ defaultTimeoutMs, maxTimeoutMs }) => ({
		command: "The shell command to watch; each line it prints is an event, and its exit ends the watch",
		description: "A short description of what is watched, shown in notifications",
		timeoutMs: `Stop the watch after this many milliseconds (${defaultTimeoutMs} by default; a longer deadline is cut to ${maxTimeoutMs}). You are told when it expires, and can start it again`,
		ws: "A WebSocket URL to watch in place of a command; every text frame counts as an event (a binary frame shows only its size), and the watch ends when the socket closes",
	}),
};
