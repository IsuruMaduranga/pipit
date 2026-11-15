/**
 * The deferred-tool listing as the model reads it: each tool the product's
 * sessions defer gets one line on when to load it, an MCP server's tool keeps
 * its bare name, and the closing paragraph follows the names.
 */
import { describe, expect, it } from "vitest";
import { deferredReminderText } from "../../extensions/lib/request/deferred.ts";
import { ALL_LIVE } from "../../test/unit/helpers/live.ts";
import { profile } from "../index.ts";

/**
 * The tools a main session of this product defers (seen in a live request,
 * 2026-11-15), plus the MCP resource tools. A hint is keyed by tool name, so
 * a tool the base renames or starts deferring would lose its line silently:
 * this list is the guard, and a failure here means updating both.
 */
const DEFERRED = ["task_output", "task_stop", "SendMessage", "task_create", "task_get", "task_list", "task_update", "enter_plan_mode", "exit_plan_mode", "web_search", "web_fetch", "lsp_diagnostics", "list_mcp_resources", "read_mcp_resource", "read_mcp_resource_dir"];

describe("the deferred-tool listing", () => {
	const words = profile.text({ live: ALL_LIVE }).toolSearch as NonNullable<ReturnType<typeof profile.text>["toolSearch"]>;

	it("gives every tool this product defers a line, and only those tools", () => {
		expect(Object.keys(words.listingHints ?? {}).sort()).toEqual([...DEFERRED].sort());
	});

	it("writes each line as `name: hint` on one line, and a server's tool by its bare name, then the close", () => {
		const text = deferredReminderText([{ name: "web_fetch" }, { name: "mcp__crm__query" }], words);
		const lines = text.split("\n");
		expect(lines).toContain(`web_fetch: ${words.listingHints?.web_fetch}`);
		expect(lines).toContain("mcp__crm__query");
		expect(text.endsWith(`\n\n${words.listingClose}`)).toBe(true);
		for (const hint of Object.values(words.listingHints ?? {})) expect(hint).not.toMatch(/\n/);
	});
});
