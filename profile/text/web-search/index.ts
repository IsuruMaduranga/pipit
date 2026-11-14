/**
 * The product's web_search words (the profile's `text.webSearch`): the
 * descriptions (description.ts) and the parameters.
 */

import { type WebSearchText } from "../../../extensions/sdk/profile.ts";
import { webSearchDescription } from "./description.ts";

export const webSearch: WebSearchText = {
	description: webSearchDescription,
	params: {
		query: "What to search for",
		allowed_domains: "Return results from these domains only",
		blocked_domains: "Leave out results from these domains",
	},
	searchKeywords: ["web", "search", "internet", "google", "news", "lookup", "online", "current"],
};
