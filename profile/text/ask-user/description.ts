/**
 * ask_user_question's model-facing words: the tool description in its two
 * forms and the parameter texts (pure).
 *
 * The short form goes to frontier and workhorse models and adds a paragraph
 * on when not to ask; the long form, for cheap and tiny models, leaves that
 * paragraph out (lib/profile/tool-variants.ts). The plan-mode paragraph names
 * both plan-mode tools; index.ts cuts it when either is off.
 */

import type { DescriptionForm } from "../../../extensions/sdk/profile.ts";

/** The paragraph naming the plan-mode tools; index.ts cuts it when either tool is off. */
export const ASK_PLAN_MODE_NOTE = `

While planning: enter_plan_mode starts plan mode, not this tool. Inside plan mode, ask here to settle a requirement or to choose between two approaches before the plan is written down. The plan itself is approved through exit_plan_mode, so never use a question to ask whether the plan looks good or whether to go ahead.`;

const ASK_INTRO = `Put a question to the user when a decision blocks you and the decision belongs to them: nothing in the request, the project or a sensible default settles it. One call can carry up to four questions, which the user answers together in one dialog.

How the dialog works:
- A question without previews gets a free-text row automatically, so never add an "Other" option of your own. On a question with previews, the user can attach a note instead.
- Set multiSelect to true when the user may pick more than one option.
- To recommend an option, put it first and end its label with "(Recommended)".${ASK_PLAN_MODE_NOTE}`;

const ASK_RESERVE = `

Ask only when the answer changes what you do next. A choice with a conventional default, or a fact you can look up in the project yourself, is not a question: take the obvious path, say which one you took, and carry on.`;

const ASK_PREVIEWS = `

Previews:
An option can carry a \`preview\`, shown beside the option list while that option is focused. Use it when the user has to compare concrete things by eye, such as a text mockup of a screen, two versions of a code snippet, a diagram or a configuration file. The preview is shown as markdown in a fixed-width box and may span several lines. A question with previews is laid out in two columns, the options on the left and the preview on the right. Previews work on single-select questions only, and plain preference questions do not need them: a label and a description are enough there.
`;

export const ASK_SHORT_DESCRIPTION = `${ASK_INTRO}${ASK_RESERVE}${ASK_PREVIEWS}`;

export const ASK_LONG_DESCRIPTION = `${ASK_INTRO}${ASK_PREVIEWS}`;

export function askDescription(form: DescriptionForm): string {
	return form === "long" ? ASK_LONG_DESCRIPTION : ASK_SHORT_DESCRIPTION;
}

export const ASK_PARAMS = {
	questions: `The questions to put to the user, from one to four`,
	question: `The full question as the user reads it, ending in a question mark. Make it specific, for example "Which date library should the project use?". For a multiSelect question, word it so several answers make sense, for example "Which connectors should the integration include?"`,
	header: `A tag of a word or two (at most 12 characters) shown above the question, such as "Database" or "Auth".`,
	options: `Two to four choices for this question. Unless multiSelect is on, the choices exclude each other. Leave out any "Other" choice: the dialog adds a free-text row itself.`,
	multiSelect: `True lets the user pick several options instead of one. Use it when the choices can be combined.`,
	label: `The short text of the option that the user sees and picks, one to five words.`,
	optionDescription: `What picking this option means or leads to, such as its cost or trade-off.`,
	preview: `Optional content shown while this option is focused, such as a mockup, a code snippet or a side-by-side comparison. The tool description says how it is rendered.`,
} as const;
