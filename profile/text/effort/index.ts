/** The product's `/effort` text (the profile's `text.effort`): the ultracode reminders. */

import type { EffortText } from "../../../extensions/sdk/profile.ts";

export const effort: EffortText = {
	/**
	 * Standing while ultracode is on: orchestration becomes the default for
	 * real work, with small edits and conversation left out so the mode does
	 * not start a fan-out for a one-line change. The base sends it only when
	 * the workflow tool is live (ui/effort/index.ts), so with this product's
	 * workflow feature off, ultracode is only its reasoning level.
	 */
	ultracodeOn:
		"Ultracode is on: the user has asked for multi-agent orchestration for the rest of the session. " +
		"Treat a workflow as the normal way to do any task of substance, and have independent agents check what you find. " +
		"Split large work into phases (study, design, build, review) and run one workflow per phase, so you can read each phase's result before starting the next. " +
		"Thoroughness and a correct result matter more than the tokens spent. " +
		"Do the work yourself only for plain conversation and small mechanical edits.",
	/**
	 * Said once after the model read the standing reminder: the earlier
	 * messages still carry it, so without this the model would keep treating
	 * the opt-in as live.
	 */
	ultracodeOff:
		"Ultracode is off again, so the user's request for multi-agent orchestration no longer stands. Start a workflow only when a task needs one or the user asks for it.",
};
