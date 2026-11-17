/**
 * The notice for the user when they raise the thinking level above the
 * product's default (pure: index.ts wires it to `thinking_level_select`, skips
 * the levels at or below the default before asking, and shows the text with
 * `queueNotice`). It is for the user only and never enters the request. The
 * product starts every model at the default (thinking.ts, `defaultThinkingLevels`
 * in profile/index.ts) because integration tasks rarely need more.
 *
 * pi announces a level it fitted to the model the same way as a level the
 * user picked, so the decision asks the model's levels (the SDK's
 * `thinkingLevelsFor`) and stays quiet for a level the user did not choose:
 * the one the default becomes on a model without it (pi fits upward, so this
 * is also a model's lowest level when that sits above the default), and the
 * level pi fitted from the previous one when the model changed under it.
 *
 * Once per session, keyed by the session id, like the tier notice
 * (tier-notice.ts).
 */

import type { ThinkingLevels } from "../../../extensions/sdk/extension.ts";
import type { ThinkingLevelName } from "../../../extensions/sdk/profile.ts";
import { DEFAULT_LEVEL } from "../../thinking.ts";

/** The notice for a user who raised the level to `level`, in the product's own words. */
export function reasoningNoticeText(level: ThinkingLevelName): string {
	return `Reasoning is set to ${level}. Integration tasks rarely need more than ${DEFAULT_LEVEL}: a higher level is slower and costs more, and the model may overthink simple changes.`;
}

export interface ReasoningNotices {
	/**
	 * The notice for `level` (above the default) in `session`, or undefined: it
	 * is the level pi fits the default or the `previous` level to on this
	 * model (the user chose nothing), or this session was told already.
	 * `levels` is `thinkingLevelsFor` of the event context's model.
	 */
	noticeFor(session: string, level: ThinkingLevelName, previous: ThinkingLevelName, levels: ThinkingLevels): string | undefined;
}

export function createReasoningNotices(): ReasoningNotices {
	const told = new Set<string>();
	return {
		noticeFor(session, level, previous, levels) {
			if (level === levels.settle(DEFAULT_LEVEL) || level === levels.settle(previous)) return undefined;
			if (told.has(session)) return undefined;
			told.add(session);
			return reasoningNoticeText(level);
		},
	};
}
