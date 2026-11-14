/**
 * The plan-mode tools' model-facing texts (pure): the enter_plan_mode
 * description in its two forms and the exit_plan_mode description. The plan
 * is a file the model writes (decisions/modes.md, "Plan mode is file-based");
 * exit_plan_mode reads it and shows it to the user for approval.
 *
 * The sentences that name ask_user_question or the Agent tool are exported so
 * index.ts can cut them, by the same strings, when those tools are off.
 */

import type { DescriptionForm } from "../../../extensions/sdk/profile.ts";

/** enter_plan_mode's lines naming ask_user_question. */
export const ENTER_ASK_LINE = "   - If you were about to ask the user with ask_user_question how to approach the work, enter plan mode instead\n";
export const ENTER_ASK_STEP = "- Ask the user with ask_user_question when a choice between approaches is theirs\n";
/** enter_plan_mode's clause naming the Agent tool. */
export const ENTER_AGENT_CLAUSE = " (delegate those to a subagent through the Agent tool)";

/**
 * The enter_plan_mode description for frontier and workhorse models: plan
 * first for implementation work that is more than a small change.
 */
export const ENTER_PLAN_MODE_DESCRIPTION = [
	"Switch to plan mode before starting implementation work that is more than a small change. In plan mode you investigate the project and write an approach for the user to approve before any code changes, which saves rework when your first idea is not what they want.",
	"",
	"## When to plan",
	"",
	"Plan first for implementation work unless it is clearly simple. Any one of these is reason enough:",
	"",
	"1. **New behavior**: the task adds a real feature.",
	"   - \"Add retry handling to the order service\": which errors are retried, how often, and what happens after the last attempt?",
	"   - \"Expose the inventory data over GraphQL\": which fields, and who may query them?",
	"",
	"2. **Several reasonable designs**: the task can be done in clearly different ways.",
	"   - \"Cache the currency rates\": in memory, in a database, or behind the connector's own cache?",
	"   - \"Make the sync job faster\": batching, parallel calls and fewer round trips are all candidates.",
	"",
	"3. **Changes to existing behavior**: the task alters how working code behaves or is organized.",
	"   - \"Change how invoices are matched to payments\": what exactly should be different?",
	"   - \"Split this service into modules\": what should the new layout be?",
	"",
	"4. **A choice of pattern or technology**: the task needs a decision first.",
	"   - \"Push stock updates to the storefront\": webhooks, a message broker or polling?",
	"   - \"Store the audit trail\": a table, a log stream or a file store?",
	"",
	"5. **Wide changes**: the work will probably touch more than two or three files.",
	"   - \"Move every connector to the new credentials setup\"",
	"   - \"Add a new endpoint with its tests\"",
	"",
	"6. **Unclear scope**: you need to investigate before you can say what the work is.",
	"   - \"The integration is slow\": first find where the time goes.",
	"   - \"Orders sometimes go missing\": first find the cause.",
	"",
	"7. **The user's preference decides it**: the work could sensibly go more than one way.",
	ENTER_ASK_LINE + "   - In plan mode you can look around first and then present the options with the facts behind them",
	"",
	"## When to skip it",
	"",
	"Go straight to the work only when it is simple:",
	"- A fix of a line or a few lines (a typo, an obvious bug, a small adjustment)",
	"- One new function whose requirements are clear",
	"- Work the user has already specified in detail",
	`- Pure research or exploration, with no change to plan${ENTER_AGENT_CLAUSE}`,
	"",
	"## What you do in plan mode",
	"",
	"- Investigate the project with `find`, `grep` and read",
	"- Learn the existing patterns and structure",
	"- Work out how to implement the change",
	"- Write the plan for the user to approve",
	ENTER_ASK_STEP + "- Call exit_plan_mode when the plan is ready to carry out",
	"",
	"## Examples",
	"",
	"### Plan first:",
	"User: \"Add OAuth2 authentication to the payment API\"",
	"- Needs design decisions: which grant type, where tokens are validated, how secrets are configured",
	"",
	"User: \"Reduce the database load of the reporting service\"",
	"- Several possible approaches, needs measuring first, large effect",
	"",
	"User: \"Add a dead-letter queue for failed messages\"",
	"- Sounds small but involves: where failures are caught, the queue setup, replay, monitoring",
	"",
	"User: \"Rework the error responses of the HTTP services\"",
	"- Touches many files, and the user should agree on the shape first",
	"",
	"### Do not plan:",
	"User: \"Correct the spelling mistake in the README\"",
	"- Direct and obvious",
	"",
	"User: \"Add a log line to this function so I can debug it\"",
	"- Small and obvious",
	"",
	"User: \"Which module handles the Salesforce sync?\"",
	"- A question to answer, not work to plan",
	"",
	"## Notes",
	"",
	"- When you are not sure, plan. Agreeing on the approach first costs less than redoing the work.",
	"- Users like being asked before large changes are made to their project.",
	"",
].join("\n");

/**
 * The enter_plan_mode description for cheap and tiny models. Weak models read
 * a description that favours planning as standing policy and planned trivial
 * tasks (decisions/tools.md, "Weak-model steering"), so this one says most
 * tasks do not need it.
 */
export const ENTER_PLAN_MODE_DESCRIPTION_WEAK =
	"Switch to plan mode: a read-only stage for working out an approach before anything changes. Most tasks do not need it.\n" +
	"When a change is small or clearly defined, make it directly. Use plan mode only for work across several files whose design is really unclear, or at the user's request. While it lasts you have read-only tools, plus one file you may write: the plan file at the path you are given, where the plan grows step by step.";

/** The enter_plan_mode description for a description form. */
export function enterPlanModeDescription(form: DescriptionForm): string {
	return form === "long" ? ENTER_PLAN_MODE_DESCRIPTION_WEAK : ENTER_PLAN_MODE_DESCRIPTION;
}

/** exit_plan_mode's lines naming ask_user_question. */
export const EXIT_ASK_LINE = "- Settle open questions about requirements or approach with ask_user_question earlier in planning, not now\n";
export const EXIT_ASK_WARNING =
	"\n**Note:** Never use ask_user_question to ask whether the plan is acceptable or whether to start. Calling exit_plan_mode is that request: it puts the plan in front of the user for approval.\n";
export const EXIT_ASK_EXAMPLE =
	"3. Task: \"Add authentication to the partner API\". If the method is not settled (API keys, OAuth2, mutual TLS), ask with ask_user_question first, and call exit_plan_mode once the approach is clear.\n";

/** The exit_plan_mode description. */
export const EXIT_PLAN_MODE_DESCRIPTION = [
	"Call this in plan mode once the plan is written to the plan file and you want the user to approve it.",
	"",
	"## How it works",
	"- Write the plan to the plan file named in the plan-mode instructions before calling this",
	"- The tool takes no parameters: it reads the plan from that file",
	"- Calling it tells the user you have finished planning and asks them to review the plan",
	"- The user sees what the plan file contains",
	"",
	"## When to call it",
	"IMPORTANT: Call it only when you have planned how to implement a task that involves writing code. Do not call it after research, such as searching, reading files or explaining how something works.",
	"",
	"## Before calling it",
	"Make sure the plan is complete and leaves nothing open:",
	EXIT_ASK_LINE + "- When the plan is final, call this tool to ask for approval",
	EXIT_ASK_WARNING,
	"## Examples",
	"",
	"1. Task: \"Find out how the retry logic in the HTTP client works\". Do not call exit_plan_mode: this is research, not an implementation plan.",
	"2. Task: \"Add a retry policy to the HTTP client\". Call exit_plan_mode once the implementation steps are planned.",
	EXIT_ASK_EXAMPLE,
].join("\n");
