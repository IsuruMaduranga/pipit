/**
 * The settings the product declares for its own extensions (`settings` in
 * index.ts), by key. A leaf with only a type import, at the profile's root so
 * both index.ts and the Ballerina extension can import it (the profile may
 * not import an extension's folder). The extension reads a value with
 * `productSetting(key, cwd)` (extensions/ballerina/index.ts).
 */

import type { ProductSetting } from "../extensions/sdk/profile.ts";

/** `false` keeps the notice about a raised thinking level quiet (reasoning-notice.ts). */
export const REASONING_NOTICE_SETTING = "reasoningNotice";

/** `false` keeps the notice about a session model below the product's tier floor quiet (tier-notice.ts). */
export const TIER_NOTICE_SETTING = "tierNotice";

export const BALLERINA_SETTINGS: Readonly<Record<string, ProductSetting>> = {
	[TIER_NOTICE_SETTING]: {
		type: "boolean",
		// A user can silence it for one project. The project file sits in that user's own state folder, so it never reaches another user, and a repository cannot set it.
		project: true,
		description: "Set to false to hide the notice shown when the session model is below the tier this product works best on",
	},
	[REASONING_NOTICE_SETTING]: {
		type: "boolean",
		// Per project, like the tier notice: a user's own choice for the work in one project.
		project: true,
		description: "Set to false to hide the notice shown when you raise the thinking level above low",
	},
};
