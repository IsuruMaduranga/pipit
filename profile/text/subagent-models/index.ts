/**
 * The product's part of the subagent model words (the profile's
 * `text.subagentModels`): the model aliases (sonnet, opus, haiku) name model
 * tiers, and an alias no model in the session's provider family carries is
 * read as the tier it names.
 */

import type { SubagentModelsText } from "../../../extensions/sdk/profile.ts";

export const subagentModels: SubagentModelsText = {
    aliasTier: "taken as the model tier it names",
};
