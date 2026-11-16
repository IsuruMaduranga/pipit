/**
 * The notice for the user when the session model sits below the tier the
 * product's Ballerina knowledge works best on, compared with the SDK's
 * `tiersBelow` (pure: index.ts wires it to `session_start` and
 * `model_select`, reads the tier with the SDK's `sessionModelTier` and
 * shows the text with `queueNotice`). The notice is for the user only and
 * never enters the request.
 *
 * The tier is the prompt register the base picks for the session (the one
 * the system prompt and tool descriptions use), not a measure of the
 * model's capability: a model outside the base's catalogs, on a custom
 * provider or without a price lands in a lower register too, and
 * `PIPIT_PROMPT_TIER` moves it. So the wording claims only that the model is
 * not among those the product works best with. A capability tier for this
 * needs a base seam (asked of One Code).
 *
 * Once per model in a session: a switch back to a model already named says
 * nothing again. Keyed by the session too, so pi's duplicate `session_start`
 * (RPC mode, on a new, switched or forked session) shows nothing twice.
 *
 * Nothing silences it yet: a product extension has no seam to read a user
 * setting or an environment knob; index.ts marks where the switch goes.
 */

import { tiersBelow } from "../../../extensions/sdk/extension.ts";
import type { PromptTier } from "../../../extensions/sdk/profile.ts";

/** A session model below this tier gets the notice: `cheap` and `tiny` do, `workhorse` and `frontier` do not. */
export const TIER_FLOOR: PromptTier = "workhorse";

/** The notice for `model`, in the product's own words. */
export function tierNoticeText(model: string): string {
	return `${model} is not one of the models this product does its best work with, so Ballerina integrations may need more rounds of correction. A provider's largest models (its frontier models) give the best results.`;
}

/** The session model as the notice names it. */
export interface NoticeModel {
	provider: string;
	id: string;
}

/** Which models each session has been told about. */
export interface TierNotices {
	/**
	 * The notice for `model` in `session` when its `tier` sits below
	 * `TIER_FLOOR`, or undefined: at or above the floor, no model, or this
	 * model named in this session already.
	 */
	noticeFor(session: string, model: NoticeModel | undefined, tier: PromptTier): string | undefined;
}

export function createTierNotices(): TierNotices {
	const told = new Set<string>();
	return {
		noticeFor(session, model, tier) {
			if (!model || tiersBelow(tier, TIER_FLOOR) <= 0) return undefined;
			const key = JSON.stringify([session, model.provider, model.id]);
			if (told.has(key)) return undefined;
			told.add(key);
			return tierNoticeText(model.id);
		},
	};
}
