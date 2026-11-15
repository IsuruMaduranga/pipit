/**
 * The product's tool_search words (the profile's `text.toolSearch`): the
 * tool's description, prompt snippet and parameters, and the deferred-tool
 * listing's line per tool and closing paragraph. The select example names
 * two web tools and falls back to placeholders when either is off. The
 * listing lines name no other tool, so none needs cutting: the base lists
 * only the tools a session defers, and a tool with no line here (an MCP
 * server's) keeps its bare name.
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

/**
 * When to load each tool the base can defer, shown after its name in the
 * listing. Cheaper models often work around a tool they would have to load
 * first; the line ties the tool to the step it is for.
 */
const LISTING_HINTS: Readonly<Record<string, string>> = {
	task_create: "Load it before work of three or more steps, or a list of requests, to keep a to-do list the user can follow.",
	task_update: "Load it to mark a to-do item started or done, or to change or link one.",
	task_get: "Load it to read one to-do item in full, with the items it blocks or waits on.",
	task_list: "Load it to see the whole to-do list and what is still open.",
	task_output: "Load it when your next step needs a background task's output before its notification arrives, or to look at one while it runs.",
	task_stop: "Load it to end a background shell or agent you no longer need.",
	SendMessage: "Load it to message another agent: to give one you started more instructions or pick up one that has finished, or, as a fork, to report to the session that started you.",
	enter_plan_mode: "Load it before a change across several files whose design is still open, or when the user wants a plan first.",
	exit_plan_mode: "Load it in plan mode once the plan file is complete, to ask the user to approve it.",
	web_search: "Load it to find current information on the web, such as a third-party API's documentation or a recent release.",
	web_fetch: "Load it to read a web page whose address you have, such as an API reference or an OpenAPI document the user linked.",
	lsp_diagnostics: "Load it to get a file's errors and warnings as it is on disk now, without building the package.",
	list_mcp_resources: "Load it to see which documents and data the connected MCP servers make readable.",
	read_mcp_resource: "Load it to read one MCP resource whose URI you know.",
	read_mcp_resource_dir: "Load it to list what one directory resource on an MCP server holds.",
};

const LISTING_CLOSE =
	"Each tool on this list exists for the step its line names. When your next step is one of those, load the tool with tool_search and call it, instead of reaching the same result another way.";

/** The group, for the tools this session can have (`live`): text naming a tool that is off leaves it out. */
export const toolSearchText = (live: LiveTools): ToolSearchText => ({
	description: withoutOff(DESCRIPTION, live, DESCRIPTION_PASSAGES),
	promptSnippet: "Load the schemas of deferred tools when you need them",
	params: {
		query: "Exact tool names (`select:a,b`) or keywords for the capability you need",
		maxResults: "How many tools to load at most (5 when left out)",
	},
	listingHints: LISTING_HINTS,
	listingClose: LISTING_CLOSE,
});
