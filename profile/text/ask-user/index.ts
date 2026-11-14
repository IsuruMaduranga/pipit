/**
 * The product's ask_user_question words (the profile's `text.askUser`): the
 * tool description and parameter texts live in description.ts.
 */

import type { AskUserText, LiveTools } from "../../../extensions/sdk/profile.ts";
import { ASK_PARAMS, ASK_PLAN_MODE_NOTE, askDescription } from "./description.ts";
import { type ToolPassages, withoutOff } from "../../../extensions/sdk/profile.ts";

/** Names both plan-mode tools: cut when either is off. */
const PLAN_MODE_PASSAGE = [ASK_PLAN_MODE_NOTE] as const;

const ASK_PASSAGES: ToolPassages = {
	enter_plan_mode: PLAN_MODE_PASSAGE,
	exit_plan_mode: PLAN_MODE_PASSAGE,
};

/** The group, for the tools this session can have (`live`): text naming a tool that is off leaves it out. */
export const askUserText = (live: LiveTools): AskUserText => ({
	description: (form) => withoutOff(askDescription(form), live, ASK_PASSAGES),
	promptSnippet: "Put a blocking decision that belongs to the user to them, with options",
	params: ASK_PARAMS,
});
