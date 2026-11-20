/**
 * The product's system prompt (the profile's `text.systemPrompt`): three
 * registers of text, chosen by model tier. The base places the computed
 * blocks around and inside these sections
 * (extensions/request/system-prompt/template.ts).
 */

import type { LiveTools, PromptTier, SystemPromptText } from "../../../extensions/sdk/profile.ts";
import type { PromptBundle } from "./common.ts";
import { frontierBundle } from "./frontier.ts";
import { lowBundle } from "./low.ts";
import { memoryPromptSection } from "./memory.ts";
import { midBundle } from "./mid.ts";
import { type ToolPassages, withoutOff } from "../../../extensions/sdk/profile.ts";
import { PLAN_APPROVAL_BULLET, TYPED_SKILL_BULLET, USER_COMMUNICATION } from "./common.ts";
import { DELEGATE_STRICT } from "./low.ts";
import { DELEGATING_WORK, FORK_BULLET } from "./mid.ts";

/**
 * Four tiers, three register texts. `workhorse` and `cheap` share the long
 * register (`midBundle`) and differ only in their tool descriptions. `tiny`
 * is the long register plus the weak-model scaffolding (`lowBundle`).
 */
const BUNDLES: Record<PromptTier, PromptBundle> = {
    frontier: frontierBundle,
    workhorse: midBundle,
    cheap: midBundle,
    tiny: lowBundle,
};

/**
 * The tiny tier's pointer to the grep, find and ls tools, and what it says
 * with any of them off: search in the shell. Listed after Agent, whose
 * passage cuts the whole delegation section the second one sits in.
 */
const SHELL_SEARCH = [
    [
        ", and the grep, find and ls tools for finding files or text (not the shell's find, grep, or ls). Keep the shell for commands that really need it.",
        ". Find files and text in the shell (grep, find, ls). Beyond that, keep the shell for commands that really need it.",
    ],
    ["use the search tools yourself.", "search in the shell yourself (grep, find)."],
] as const;

/** Per tool, the passages of the prompt that name it, cut when it is off. */
const PROMPT_PASSAGES: ToolPassages = {
    // Before edit: its passages are matched as written, with edit still named.
    bash: [" - For work on files, reach for the file tools (read, edit, write) first; use bash only for what needs a shell.\n", ["; commands run only when you call the bash tool", ""]],
    skill: [`\n${TYPED_SKILL_BULLET}`, "\n - When a skill matches the task, run it with the skill tool instead of doing the same work by hand. Skills exist on purpose: pick the matching one rather than improvising."],
    Agent: [DELEGATING_WORK, DELEGATE_STRICT, `\n${FORK_BULLET}`],
    grep: SHELL_SEARCH,
    find: SHELL_SEARCH,
    ls: SHELL_SEARCH,
    // Before exit_plan_mode: the whole section is matched with its plan bullet still in it.
    ask_user_question: [USER_COMMUNICATION],
    exit_plan_mode: [PLAN_APPROVAL_BULLET],
    edit: [["(read, edit, write)", "(read, write)"], ["call the edit or write tool", "call the write tool"], [" edit for changing them (not sed or awk),", ""], ["the edit/write tools", "the write tool"]],
};

/** The sections without the passages of tools that are off; a section left empty is dropped. */
const liveSections = (sections: readonly string[], live: LiveTools): string[] =>
    sections.map((section) => withoutOff(section, live, PROMPT_PASSAGES)).filter((section) => section.trim() !== "");

/** The group, for the tools this session can have (`live`): text naming a tool that is off leaves it out. */
export const systemPromptText = (live: LiveTools): SystemPromptText => ({
    lead({ tier, taskTools, tools }) {
        const bundle = BUNDLES[tier];
        return liveSections(bundle.leadFor?.({ taskTools, tools }) ?? (taskTools ? bundle.lead : (bundle.leadWithoutTaskTools ?? bundle.lead)), live);
    },
    tail: ({ tier }) => liveSections(BUNDLES[tier].tail, live),
    // Workhorse, cheap and tiny use the long memory spec.
    memory: (dir, { tier, taskTools }) => memoryPromptSection(dir, BUNDLES[tier].verboseMemory, taskTools),
});
