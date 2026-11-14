/**
 * web_search's model-facing description (pure), in two forms.
 *
 * The short form, for frontier and workhorse models, names which backend
 * answers and how the domain filters work on each. The long form, for cheap
 * and tiny models (lib/profile/tool-variants.ts), adds firm rules on citing
 * sources and on using the current year in queries.
 */

import type { DescriptionForm } from "../../../extensions/sdk/profile.ts";

const BACKENDS =
	"If the model's provider has a search of its own, that search answers. If not, a search API you configured answers (Brave or Tavily), or, with no key set, a free endpoint with a rate limit. The result names the one that answered";

export const WEB_SEARCH_SHORT_DESCRIPTION =
	"Search the web. You get back result blocks, each with a title and a URL.\n\n" +
	"- `allowed_domains` and `blocked_domains` narrow the results. Anthropic's server-side search, Brave, Tavily and Exa apply them strictly; with another provider's own search they are added to the query as `site:` operators, which is best effort.\n" +
	'- When you answer from the results, finish with "Sources:" and, as markdown links, the URLs you relied on.\n' +
	`- ${BACKENDS}.`;

export const WEB_SEARCH_LONG_DESCRIPTION = `
- Searches the web so your answer can draw on what is published there
- Gives you current information: recent events, new releases, data newer than your training
- Returns the results as blocks, with their links as markdown links
- Reach for it whenever the question needs facts past your knowledge cutoff
- One call runs the whole search

YOU MUST CITE YOUR SOURCES:
  - Every answer based on search results ends with a "Sources:" section
  - List each URL you used from the results there as a markdown link: [Title](URL)
  - Never leave this section out
  - Like this:

    [The answer]

    Sources:
    - [First page title](https://example.com/a)
    - [Second page title](https://example.com/b)

How to use it:
  - allowed_domains keeps results to the listed sites; blocked_domains removes the listed sites
  - ${BACKENDS}

IMPORTANT - put the right year in your queries:
  - Today's date is given earlier in the conversation. When you look for recent information, documentation or news, search with that date's year.
  - For example, for "the latest Ballerina release notes", search for the release notes with the current year in the query, not last year.
`;

export function webSearchDescription(form: DescriptionForm): string {
	return form === "long" ? WEB_SEARCH_LONG_DESCRIPTION : WEB_SEARCH_SHORT_DESCRIPTION;
}
