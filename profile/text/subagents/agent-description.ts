/**
 * The Agent tool's model-facing description (pure).
 *
 * The short form goes to frontier and workhorse models; the long form, with
 * usage notes, the fork guidance, the briefing section and worked examples,
 * goes to cheap and tiny ones (lib/profile/tool-variants.ts). Both end with
 * `## While an agent runs`: waiting with `yield`, ending a run with
 * `task_stop`, the one-shot print session, self-contained tasks, run names
 * and `action: "list"`. There is no output tool: a background agent's report
 * arrives only as its notification. A fork
 * rejects a `model` override. Agent definitions are named by the folder the
 * base passes (`configDir`).
 */

import type { DescriptionForm } from "../../../extensions/sdk/profile.ts";
import brand from "../../brand.json" with { type: "json" };

/** Where agent definitions live, as the text names them before `agentDescription` puts in the session's folder. */
const AGENT_FILES = `\`${brand.stateDir}/agents/*.md\``;

export const AGENT_SHORT_DESCRIPTION = `Hand a task to a specialist agent that works in a context window of its own and reports back when it is done. Each agent type comes with its own capabilities and tools; the available types are listed in <system-reminder> messages in this conversation.

Choose the agent with subagent_type. \`"fork"\` makes a copy of you that inherits this whole conversation and always uses your model (a call that sets \`model\` for it is rejected). Any other type, or none (which means general-purpose), starts a fresh agent that knows nothing of this conversation.

## When to delegate

Delegate when the task fits one of the agent types, when independent pieces of work can run side by side, or when answering would mean reading through several files: the agent hands you its conclusion and the file contents stay out of your context. When you already know which file, symbol, or value holds the answer, look it up yourself; that is quicker. Once you have delegated a search, leave it to the agent and wait for its result.

Agents run in the background, and a notification tells you when one finishes; a fork's tool output also stays out of your context. If that fork is you, carry out the task yourself rather than delegating it again. Never invent or predict what a pending agent will report: the notification comes from the harness, never from you, and if the user asks before it arrives, tell them the agent is still running.

- The user does not see the agent's final report: relay what matters from it.
- To continue an agent you already started, with its context intact, use SendMessage with its name or ID. A new Agent call starts from scratch (a fork is the exception: it inherits your context).
- Each agent type takes its model, reasoning effort, and tools from the frontmatter of its definition file (${AGENT_FILES}).
- \`isolation: "worktree"\` runs the agent in a git worktree of its own, removed afterwards if the agent changed nothing.`;

export const AGENT_LONG_DESCRIPTION = `Hand a task to a specialist agent that works in a context window of its own and reports back when it is done. Each agent type comes with its own capabilities and tools; the available types are listed in <system-reminder> messages in this conversation.

Choose the agent with subagent_type. \`"fork"\` makes a copy of you that inherits this whole conversation and always uses your model (a call that sets \`model\` for it is rejected). Any other type, or none (which means general-purpose), starts a fresh agent that knows nothing of this conversation.

## Usage notes

- Give every call a short description of what the agent will do.
- The user never sees the agent's final report. To share the result, write the user a short summary of it yourself.
- An agent's summary says what it meant to do, which is not always what it did. When an agent wrote or changed code, look at the actual changes before you report the work as done.
- SendMessage with the agent's name or ID in \`to\` resumes an agent you already started, with its full context. A new Agent call starts an agent with no memory of earlier runs (a fork aside), so its prompt has to stand on its own.
- The frontmatter of an agent's definition file (${AGENT_FILES}) sets its model, reasoning effort, and tool access; \`model\` on the call overrides the file for that one run.
- Tell a fresh agent plainly whether it should write code or only research (search, read files, fetch pages): it does not know what the user intends.
- When an agent's description says to use it proactively, use it without waiting for the user to ask.
- When the user asks for agents "in parallel", put all the Agent calls in one message. For example, to start a build checker and a test runner side by side, send one message that holds both calls.
- With \`isolation: "worktree"\`, a worktree the agent left unchanged is removed; otherwise the result gives its path and branch.

## When to fork

Fork (\`subagent_type: "fork"\`) when the tool output along the way is not worth keeping in your context. The test is whether you will need that output again, not how big the task is. Open-ended questions suit a fork, and research that splits into independent questions suits several forks started in one message. A fork does this better than a fresh agent: it inherits your context and reuses your prompt cache, which also makes it cheap.

**Don't peek.** The run writes its transcript to a file as it goes; don't read or tail it. Wait for the completion notification and trust it: reading the transcript mid-run pulls the fork's tool output into your context, which is what forking was meant to avoid.

**Don't guess the result.** The moment the fork starts, you have learned nothing about its findings. Never write its findings in advance, in any form: not as prose, a summary, or structured output. The result arrives later as a notification in a user-role message; it is never something you write. If the user asks before it lands, say the fork is still running.

**Writing a fork prompt.** The fork already knows the conversation, so its prompt is an instruction, not a briefing: say what to do and set the scope (what is in, what is out, what another agent covers). Don't repeat the background.

## Writing the prompt

Every agent except a fork starts with an empty context. Brief it like a capable colleague who has just joined: they haven't seen this conversation, don't know what you tried, and don't know why the task matters.
- Say what you are trying to achieve, and why.
- Say what you already found or ruled out.
- Share enough of the wider problem for the agent to weigh tradeoffs itself instead of following one narrow instruction.
- If you want a short answer, say so ("under 200 words").
- For a lookup, give the exact command. For an investigation, give the question: steps you prescribe become dead weight when your premise turns out wrong.

A terse, command-style prompt gets shallow, generic work from a fresh agent.

**Do the understanding yourself.** Don't write "based on what you find, fix the bug" or "implement it based on the research": that hands the synthesis to the agent. Write a prompt that shows you understood the problem: file paths, line numbers, what exactly to change.

Examples:

<example>
user: "Is anything still blocking the release of this integration?"
assistant: <thinking>A survey question, so I'll fork it: the blocker list is what I need, and the git and build output can stay out of my context.</thinking>
Agent({
  name: "release-check",
  description: "Release blocker check",
  subagent_type: "fork",
  prompt: "Check what still blocks releasing this branch: uncommitted changes, commits not on main, whether the new connector has tests, whether the endpoint URL is configurable instead of hard-coded, and whether the build passes. Report a list of done and missing items in under 200 words."
})
assistant: Started a release check; I'll report when it's back.
<commentary>
The turn ends here. Nothing about the result is known yet. The notification arrives in a later turn, as a user-role message from the harness; the assistant does not write it.
</commentary>
[later turn: the notification arrives as a user message]
assistant: The release check is back. Two blockers: the connector has no tests, and the endpoint URL is hard-coded in main.bal. Everything else is in place.
</example>

<example>
user: "did it find tests for the connector?"
<commentary>
The user asks while the fork is still running, about exactly what it is checking. The assistant does not know yet, so it gives status, not a guess.
</commentary>
assistant: Not yet: the release check is still running, and the connector's tests are on its list. I'll tell you as soon as it reports.
</example>

<example>
user: "Can someone else check whether this schema migration is safe?"
assistant: <thinking>A fresh agent won't see my analysis, so its read will be independent.</thinking>
<commentary>
A named agent type starts fresh, so the prompt carries the whole context: the question and the reasoning behind it.
</commentary>
Agent({
  name: "schema-check",
  description: "Second opinion on migration",
  subagent_type: "general-purpose",
  prompt: "Review db/migrations/0042_orders.sql for safety. It adds a NOT NULL column to the orders table (about 50M rows), with a default to fill existing rows. I checked the locking behavior and want an independent opinion on whether the backfill stays safe while the order service keeps writing. Say whether it is safe, and if not, exactly what breaks."
})
</example>
`;

/** The closing section of both forms. */
export const AGENT_HOW_AGENTS_RUN = `## While an agent runs

- When nothing else is left for you to do until an agent reports, call yield to wait for it.
- End a run you no longer need with task_stop. It is deferred, so fetch it through tool_search before the first call.
- One-shot print sessions differ: there the call waits and hands back the report directly, with no notification afterwards.
- Write the task so it needs no follow-up: the agent has no way to ask you anything.
- Each run is named. SendMessage talks to a run while it is working and resumes it once it is done. \`action: "list"\` shows the agent catalog once more.`;

/** The Agent description for a form, naming the session's agent folder (`configDir`). */
export function agentDescription(form: DescriptionForm, configDir: string = brand.stateDir): string {
    const base = form === "long" ? AGENT_LONG_DESCRIPTION : AGENT_SHORT_DESCRIPTION;
    return `${base.trimEnd()}\n\n${AGENT_HOW_AGENTS_RUN}`.replaceAll(AGENT_FILES, `\`${configDir}/agents/*.md\``);
}
