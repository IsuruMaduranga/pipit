/**
 * The product's `/btw` text (the profile's `text.btw`): the reminder that
 * frames a side question, followed by the user's question.
 *
 * The side question replays the session's request, so the tool list is still
 * declared (it is part of the cached prefix), but only as stubs: nothing the
 * answer writes is run, and the exchange never reaches the main conversation.
 * The reminder says so, so the model answers once from what it already knows
 * instead of trying to act.
 */

import type { BtwText } from "../../../extensions/sdk/profile.ts";

/** The side-question frame, sent ahead of the user's question. */
export const SIDE_QUESTION_REMINDER = `<system-reminder>The user has asked a quick question on the side. Answer it now, in one reply.

Where this answer sits:
- The work in the main conversation goes on without you. Nothing was paused, so do not talk about being interrupted or about what you were in the middle of.
- You can see the same conversation, but you are a separate, short-lived instance that only answers this question.

What you can and cannot do:
- No tool runs here. You cannot open files, run commands or search, and writing a tool call or its output as text does nothing.
- There is no next turn. Do not promise to check something or say what you will do next.
- Answer from what the conversation already shows. When the answer needs a file read, a command or a search, say that a side question cannot check it and suggest the user raise it in the main conversation.
- If you do not know, say so plainly.</system-reminder>`;

export const btw: BtwText = {
	// The reminder, a blank line, then the user's question as typed.
	question: (question) => `${SIDE_QUESTION_REMINDER}\n\n${question}`,
};
