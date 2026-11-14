/**
 * web_fetch's model-facing description (pure), in two forms.
 *
 * The short form, for frontier and workhorse models, states what this fetch
 * does: markdown out, an optional `prompt` answered by a small model (or by
 * the provider's server-side fetch on an Anthropic API-key session), paging
 * with `offset`, a 15-minute cache, and cross-host redirects reported rather
 * than followed. The long form, for cheap and tiny models
 * (lib/profile/tool-variants.ts), spells the same facts out as rules, with the
 * private-URL warning first. Its two lines that send work to bash are cut by
 * index.ts when bash is off.
 */

import type { DescriptionForm } from "../../../extensions/sdk/profile.ts";

/** The long form's lines that name bash (index.ts cuts them when it is off). */
export const WEB_FETCH_LOCAL_SERVER_NOTE = "; to reach a local server, run curl in bash";
export const WEB_FETCH_GITHUB_NOTE = "\n  - For GitHub pages, the gh command in bash (gh api, gh issue view, gh pr view) usually works better.";

export const WEB_FETCH_SHORT_DESCRIPTION =
	"Get a web page as readable markdown, with menus and other page furniture removed. " +
	"With `prompt`, a small, fast model reads the whole page and returns only its answer to the prompt, which keeps long pages out of your context, so prefer it for them. When the session uses an Anthropic API key, the provider's server-side fetch gives the answer. " +
	"Without `prompt`, a long page comes back one window at a time, and `offset` reads the next window. " +
	"Pages are cached for 15 minutes. A redirect to a different host is not followed: the result names the new URL, and you fetch that URL in a second call.";

export const WEB_FETCH_LONG_DESCRIPTION = `IMPORTANT: web_fetch cannot open pages behind a login or on a private network. Before you call it, check whether the URL belongs to a service that needs signing in (Google Docs, Confluence, Jira, a private GitHub repository and the like). For those, look for an MCP tool that has access instead.

What it does:
- Downloads the page at a URL and turns its HTML into markdown
- Takes the URL and, optionally, a prompt
- With a prompt, a small, fast model reads the page and answers the prompt, and you get that answer
- Use it to read and pull information out of web pages

How to use it:
  - IMPORTANT: when an MCP server offers its own web fetch tool, use that one, since it may be allowed to reach more pages.
  - Give a complete, valid URL. An http URL is fetched over https.
  - localhost and host names without a dot are not supported${WEB_FETCH_LOCAL_SERVER_NOTE}.
  - Word the prompt as the information you want from the page.
  - The tool only reads. It changes no files.
  - A long page fetched without a prompt comes back in windows; use \`offset\` to get the next window.
  - Fetched pages are kept for 15 minutes, so fetching the same URL again within that time is fast.
  - When a URL redirects to another host, the result says so and gives the new URL. Fetch it with a new web_fetch call.${WEB_FETCH_GITHUB_NOTE}
`;

export function webFetchDescription(form: DescriptionForm): string {
	return form === "long" ? WEB_FETCH_LONG_DESCRIPTION : WEB_FETCH_SHORT_DESCRIPTION;
}
