/**
 * The notice for the user when the session model's capability sits below the
 * tier the product's Ballerina knowledge works best on (pure: index.ts wires
 * it to `session_start` and `model_select`, judges the model with the SDK's
 * `modelCapability` and shows the text with `queueNotice`). The notice is for
 * the user only and never enters the request.
 *
 * The basis is the capability tier the base rates the model at (`tier`),
 * compared with the SDK's `tiersBelow`, and only when the rating is known:
 * a rule that knows the model decided it (the user's `modelTiers` entry, a
 * vendor's frontier rule, a catalog entry). A guess (no model, one the
 * catalogs lack, a custom provider, no price) says nothing, because a model
 * the base cannot judge may be a strong one. The capability tier is not the
 * prompt register, which `PIPIT_PROMPT_TIER` and a few model families move:
 * Haiku 5.5 runs the frontier register but is rated `cheap`, so it warns.
 *
 * Once per model in a session: a switch back to a model already named says
 * nothing again. Keyed by the session too, so pi's duplicate `session_start`
 * (RPC mode, on a new, switched or forked session) shows nothing twice.
 *
 * The user can silence it with the `tierNotice` setting (settings.ts), which
 * index.ts reads at each boundary.
 */

import { type ModelCapability, tiersBelow } from "../../../extensions/sdk/extension.ts";
import type { PromptTier } from "../../../extensions/sdk/profile.ts";

/** A session model below this tier gets the notice: `cheap` and `tiny` do, `workhorse` and `frontier` do not. */
export const TIER_FLOOR: PromptTier = "workhorse";

/** The notice for `model`, in the product's own words. */
export function tierNoticeText(model: string): string {
	return `${model} is not one of the models this product does its best work with, so Ballerina integrations may need more rounds of correction. A provider's largest models (its frontier models) give the best results.`;
}

/** The session model as the notice names it. */
interface NoticeModel {
	provider: string;
	id: string;
}

/** Which models each session has been told about. */
export interface TierNotices {
	/**
	 * The notice for `model` in `session` when its `capability` (the SDK's
	 * `modelCapability` of the model) is known and sits below `TIER_FLOOR`,
	 * or undefined: at or above the floor, a guessed rating, no model, or this
	 * model named in this session already.
	 */
	noticeFor(session: string, model: NoticeModel | undefined, capability: ModelCapability): string | undefined;
}

export function createTierNotices(): TierNotices {
	const told = new Set<string>();
	return {
		noticeFor(session, model, { tier, known }) {
			if (!model || !known || tiersBelow(tier, TIER_FLOOR) <= 0) return undefined;
			const key = JSON.stringify([session, model.provider, model.id]);
			if (told.has(key)) return undefined;
			told.add(key);
			return tierNoticeText(model.id);
		},
	};
}
