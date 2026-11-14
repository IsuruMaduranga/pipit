/**
 * The product's recap text (the profile's `text.recap`): the instruction for
 * the short line shown when the user comes back to a session after a break.
 */

import type { RecapText } from "../../../extensions/sdk/profile.ts";

export const RECAP_PROMPT =
	"The user has been away and is about to pick this session up again. Help them get their bearings in one or two short plain-text sentences, 40 words at most, without markdown. Start with what the session is trying to achieve and what is being worked on now, then give the single next step. Leave out how a problem was diagnosed, implementation detail, side tasks and asides.";

export const recap: RecapText = {
	prompt: RECAP_PROMPT,
};
