/**
 * The product's plan-mode words (the profile's `text.planMode`): the
 * enter_plan_mode and exit_plan_mode descriptions (texts.ts) and the
 * plan-mode instructions (reminder.ts). Passages that name a tool which is
 * off are cut or reworded here.
 */

import type { LiveTools, PlanModeText } from "../../../extensions/sdk/profile.ts";
import {
	ANY_TIME_ASK,
	ASK_ONLY_FOR,
	buildPlanModeReminder,
	END_OF_TURN,
	END_OF_TURN_NO_ASK,
	NO_TEXT,
	NO_TEXT_OR_ASK,
	PLAN_FILE_EDIT,
	PLAN_FILE_NO_EDIT,
	REVIEW_ASK_STEP,
} from "./reminder.ts";
import {
	ENTER_AGENT_CLAUSE,
	ENTER_ASK_LINE,
	ENTER_ASK_STEP,
	enterPlanModeDescription,
	EXIT_ASK_EXAMPLE,
	EXIT_ASK_LINE,
	EXIT_ASK_WARNING,
	EXIT_PLAN_MODE_DESCRIPTION,
} from "./texts.ts";
import { type ToolPassages, withoutOff } from "../../../extensions/sdk/profile.ts";

const ENTER_PASSAGES: ToolPassages = {
	ask_user_question: [ENTER_ASK_LINE, ENTER_ASK_STEP],
	Agent: [ENTER_AGENT_CLAUSE],
};
const EXIT_PASSAGES: ToolPassages = {
	ask_user_question: [EXIT_ASK_LINE, EXIT_ASK_WARNING, EXIT_ASK_EXAMPLE],
};
const REMINDER_PASSAGES: ToolPassages = {
	edit: [[PLAN_FILE_EDIT, PLAN_FILE_NO_EDIT]],
	ask_user_question: [REVIEW_ASK_STEP, [END_OF_TURN, END_OF_TURN_NO_ASK], ASK_ONLY_FOR, [NO_TEXT_OR_ASK, NO_TEXT], [ANY_TIME_ASK, "."]],
};

/** The group, for the tools this session can have (`live`): text naming a tool that is off leaves it out. */
export const planModeText = (live: LiveTools): PlanModeText => ({
	descriptions: {
		enter_plan_mode: (form) => withoutOff(enterPlanModeDescription(form), live, ENTER_PASSAGES),
		exit_plan_mode: withoutOff(EXIT_PLAN_MODE_DESCRIPTION, live, EXIT_PASSAGES),
	},
	reminder: ({ planFile, planExists }) => withoutOff(buildPlanModeReminder(planFile, planExists), live, REMINDER_PASSAGES),
});
