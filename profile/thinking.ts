/**
 * The product's default thinking level, in one place: the level every model
 * starts at (`defaultThinkingLevels` in index.ts), and which levels are at or
 * below it, so they need no warning (reasoning-notice.ts) and get no note
 * under the effort slider (text/effort/index.ts). A leaf with type imports
 * only, so the profile can load it without any extension's graph.
 */

import type { ThinkingLevelName } from "../extensions/sdk/profile.ts";

/** Integration tasks rarely need more reasoning than this. */
export const DEFAULT_LEVEL = "low" satisfies ThinkingLevelName;

/**
 * pi's levels, lowest first. The SDK door exports the level names as a type
 * only, so the order is written out here; the check below fails the typecheck
 * when a level pi adds is missing from it.
 */
const LEVEL_ORDER = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const satisfies readonly ThinkingLevelName[];
const everyLevelListed: [Exclude<ThinkingLevelName, (typeof LEVEL_ORDER)[number]>] extends [never] ? true : never = true;
void everyLevelListed;

/** The levels at or below the default, lowest first. */
export const LEVELS_AT_OR_BELOW_DEFAULT: readonly ThinkingLevelName[] = LEVEL_ORDER.slice(0, LEVEL_ORDER.indexOf(DEFAULT_LEVEL) + 1);

/** Whether `level` (a thinking level, or another effort stop such as ultracode, which is not one) is at or below the default. */
export const isAtOrBelowDefault = (level: string): boolean => (LEVELS_AT_OR_BELOW_DEFAULT as readonly string[]).includes(level);
