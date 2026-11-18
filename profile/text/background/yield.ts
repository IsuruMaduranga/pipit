/**
 * The product's yield words (the profile's `text.background.yield`): the
 * description of the tool that holds the turn until background work has
 * something to say. The base writes the tool's results and decides when the
 * wait ends (extensions/tools/background/index.ts, yield-wait.ts): a report
 * from a background task, a message from the user, a scheduled prompt that is
 * due, nothing left running that could report, or the wait's cap of an
 * hour (YIELD_CAP_MS); the base does not end it for the prompt cache.
 */

import type { YieldText } from "../../../extensions/sdk/profile.ts";

export const yieldTool: YieldText = {
	description:
		"Wait here until your background work has something to tell you. Use it only when nothing else is left for you to do. The wait ends when a background task reports or the user sends a message (it is placed right below the note under this call's result, before you reply again, except when that note says it will come after your turn ends), when a scheduled prompt falls due, at once when nothing you started in the background is still running, or after an hour with no report, in which case a line says how many tasks are still running and you may call it again to keep waiting. Only the first call in a reply waits.",
};
