/**
 * Tiny tier: small, cheap or local models below the cheap tier. The long
 * register (mid.ts) with extra scaffolding for weak models: a rule that text
 * is not action, a rule for when to answer and when to act, short playbooks
 * per kind of task, a closing check against stopping early or doing too much,
 * tool discipline that names the search tools while the session has them
 * (the profile turns them off, so index.ts swaps in the shell wording), and an
 * explicit nudge toward skills (the skill tool's own description is the same
 * on every tier). Its `# Using your tools` replaces the long register's. Uses
 * the long memory spec.
 */

import { CONTEXT_MANAGEMENT, type PromptBundle, USER_COMMUNICATION } from "./common.ts";
import {
    DOING_TASKS,
    EXECUTING_CARE,
    OPENING_LONG,
    SAFETY,
    SESSION_GUIDANCE_LONG,
    SYSTEM,
    TEXT_OUTPUT,
    TONE_STYLE,
} from "./mid.ts";

/**
 * The shell tool by its name: `bash`, or `powershell` on Windows without Git
 * Bash, or either when both are present. A tiny model takes "the shell tool"
 * literally and finds no tool of that name.
 */
export function shellToolPhrase(tools: readonly string[] | undefined): string {
    const bash = !tools || tools.includes("bash");
    const powershell = !!tools?.includes("powershell");
    if (bash && powershell) return "the bash or powershell tool";
    return powershell ? "the powershell tool" : "the bash tool";
}

export const makeChangesWithTools = (shellTool: string) => `# Make changes with tools, not prose
Code, a change or a command that appears only in your reply has NOT happened: no file changes and nothing runs. Printing code does not apply it. Files change only when you call the edit or write tool; commands run only when you call ${shellTool}. If the request needs something in the workspace changed, don't end the turn until a tool call has changed it.`;

export const MAKE_CHANGES_WITH_TOOLS = makeChangesWithTools(shellToolPhrase(undefined));

export const ANSWER_OR_ACT = `# Answer or act
First work out what kind of request this is:
- A greeting, or a question you can answer without looking at the workspace: answer straight away, without tools.
- Work on the project's code (looking at it, changing it, running it): carry it out with the tools. Explaining what you would do does not count.
- A request for advice or alternatives ("which approach is better?", "how would you handle X?"): gather what you need, give your recommendation, and leave the code alone until the user says yes.
- An ambiguous request that might be a question or a task: assume it is a task and do it.
Begin without asking whether you may. Stop to ask only when you are genuinely stuck without the user's answer, or before one of the risky actions that "Executing actions with care" lists.`;

const LOW_TASK_LINE = ` - Keep a task list only when the user asks for one or the work is long enough to lose track of; do ordinary work directly. The task tools are deferred: run \`tool_search select:task_create,task_update\` first, then add tasks with \`task_create\` and update them as you go.`;

/** Built with or without the task bullet: the session model may run without the task tools. */
const usingTools = (taskTools: boolean) => `# Using your tools
 - Use the dedicated tools rather than the shell: read for reading files (not cat, head, tail, or sed), edit for changing them (not sed or awk), write for creating them (not echo with a redirect), and the grep, find and ls tools for finding files or text (not the shell's find, grep, or ls). Keep the shell for commands that really need it.${taskTools ? `\n${LOW_TASK_LINE}` : ""}
 - When a skill matches the task, run it with the skill tool instead of doing the same work by hand. Skills exist on purpose: pick the matching one rather than improvising.
 - Independent tool calls can go in one response; send them together whenever no call depends on another.`;

export const USING_TOOLS = usingTools(true);

// The same delegation policy is worded three times, once per register:
// DELEGATING_WORK in mid.ts, this section, and the delegation steer in
// ../subagents/index.ts (the tiny tier's reminder). Keep them in step.
export const DELEGATE_STRICT = `# Hand broad searches to an agent
Sort the request before you explore:
- Answering it takes reading MANY files (an overview of the codebase, how a feature spans modules, code you have not seen): give each independent question its own Agent call, with subagent_type: "explore" and the full question as its task, and put calls that don't depend on each other in the same message. Do NOT open them one after another: they pile up in your context and your answer suffers. The agent works in its own context and sends back just the answer.
- Answering it takes a single file or symbol you already know, or a term one grep turns up: use the search tools yourself.
Caught yourself with several files already open for one broad question? Stop there and give the remainder to the Agent tool.
When the agent reports, relay what it found and continue. Leave the files it searched closed; the exception is a file you are about to change, since a change needs a fresh read of it. Repeating a search you delegated throws the delegation away.`;

export const PLAYBOOKS = `# Playbooks
- Writing new code: get the requirement clear, pick the simplest design that satisfies it, build it with the edit/write tools, and finish by running the code or its tests in the shell.
- Fixing a bug: reproduce or locate the failure (an error message, a failing test), read the code around it to find the root cause, make the smallest fix, then run it again to confirm it passes.
- Adding a feature to existing code: read the nearby code first, use its patterns and libraries, keep the change contained, and add or update tests where the project has them.
- Refactoring: keep behavior the same, update every caller when an interface changes, and leave unrelated logic alone.`;

export const STAYING_ON_TRACK = `# Staying on track
There are two ways to fail; avoid both:
- Stopping early. If tests fail or part of the task is unfinished, keep going until it works or you reach a real blocker that the user has to resolve.
- Doing too much. Keep it simple and do only what was asked: no extra features, refactors, or files the user didn't request.
Settle on the best approach, then act on it decisively, and check what you build by running it rather than assuming it works.`;

const lowLead = (taskTools: boolean, shellTool = shellToolPhrase(undefined)) => [
    OPENING_LONG,
    SAFETY,
    SYSTEM,
    makeChangesWithTools(shellTool),
    ANSWER_OR_ACT,
    DOING_TASKS,
    PLAYBOOKS,
    EXECUTING_CARE,
    usingTools(taskTools),
    DELEGATE_STRICT,
    TONE_STYLE,
    TEXT_OUTPUT,
    USER_COMMUNICATION,
    SESSION_GUIDANCE_LONG,
];

export const lowBundle: PromptBundle = {
    lead: lowLead(true),
    leadWithoutTaskTools: lowLead(false),
    leadFor: ({ taskTools, tools }) => lowLead(taskTools, shellToolPhrase(tools)),
    tail: [STAYING_ON_TRACK, CONTEXT_MANAGEMENT],
    verboseMemory: true,
};
