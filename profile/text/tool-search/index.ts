/**
 * The product's tool_search words (the profile's `text.toolSearch`): the
 * tool's description, prompt snippet and parameters. The select example
 * names two web tools and falls back to placeholders when either is off.
 */

import type { LiveTools, ToolSearchText } from "../../../extensions/sdk/profile.ts";
import { type ToolPassages, withoutOff } from "../../../extensions/sdk/profile.ts";

const DESCRIPTION =
	"Loads deferred tools so you can call them.\n\n" +
	"Some tools are deferred: a <system-reminder> lists their names, but their parameter schemas have not been sent, so a direct call to one fails. Pass this tool a query. It finds the matching deferred tools and loads their full schemas, and from then on you call them like any other tool you were given.\n\n" +
	"Ways to query:\n" +
	"- `select:web_fetch,web_search` loads exactly the named tools\n" +
	"- `http request client` searches names and descriptions by keyword and returns up to max_results of the best matches\n" +
	"- `+mcp database query` keeps only tools whose name contains \"mcp\" and ranks them by the other words";

/** The example names both tools: placeholders when either is off. */
const EXAMPLE_SELECT = [["`select:web_fetch,web_search`", "`select:<name>,<name>`"]] as const;

const DESCRIPTION_PASSAGES: ToolPassages = {
	web_fetch: EXAMPLE_SELECT,
	web_search: EXAMPLE_SELECT,
};

/** The group, for the tools this session can have (`live`): text naming a tool that is off leaves it out. */
export const toolSearchText = (live: LiveTools): ToolSearchText => ({
	description: withoutOff(DESCRIPTION, live, DESCRIPTION_PASSAGES),
	promptSnippet: "Load the schemas of deferred tools when you need them",
	params: {
		query: "Exact tool names (`select:a,b`) or keywords for the capability you need",
		maxResults: "How many tools to load at most (5 when left out)",
	},
});
