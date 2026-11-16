/**
 * The product's subagent words (the profile's `text.subagents`): the Agent
 * tool's description (agent-description.ts), the parameters of Agent,
 * SendMessage and list_agents, a subagent's own SendMessage to the main
 * conversation, the fork's framing, the tiny tier's delegation steer, the
 * sentences that withdraw the delegation steer, the agent catalog and the
 * model menu, the guide agent (guide-agent.ts), and two clauses the base's
 * refusals take.
 */

import type { LiveTools, SubagentsText } from "../../../extensions/sdk/profile.ts";
import { agentDescription } from "./agent-description.ts";
import { GUIDE_CONTINUE, guideAgent } from "./guide-agent.ts";
import { type ToolPassages, withoutOff } from "../../../extensions/sdk/profile.ts";

/** Names both background-task tools: cut when either is off. */
const TASK_TOOLS_PASSAGE = [
    "- Reach for task_output only when nothing you do next can proceed without the result (block=true waits for it), and end a run with task_stop. You must fetch both through tool_search before the first call, since they are deferred.\n",
] as const;

/** The Agent description's passages naming a sibling tool. pi's --exclude-tools can take SendMessage out alone (a deferred SendMessage is still one the session can have). */
const AGENT_PASSAGES: ToolPassages = {
    task_output: TASK_TOOLS_PASSAGE,
    task_stop: TASK_TOOLS_PASSAGE,
    SendMessage: [
        ["- To continue an agent you already started, with its context intact, use SendMessage with its name or ID. A new Agent call starts from scratch", "- A new Agent call starts from scratch"],
        ["- SendMessage with the agent's name or ID in `to` resumes an agent you already started, with its full context. A new Agent call starts an agent", "- A new Agent call starts an agent"],
        " SendMessage talks to a run while it is working and resumes it once it is done.",
    ],
};

/** The pointers to SendMessage in the Agent tool's `name` parameter and the guide agent's description. */
const AGENT_NAME_PASSAGES: ToolPassages = { SendMessage: [["What to call this run so SendMessage can address it later;", "What to call this run;"]] };
const GUIDE_PASSAGES: ToolPassages = { SendMessage: [GUIDE_CONTINUE] };

/** SendMessage's pointer to list_agents: cut when list_agents is off. */
const SEND_MESSAGE_PASSAGES: ToolPassages = {
    list_agents: ["; list_agents shows the names of running and finished agents"],
};

/** SendMessage's `to`: pi's --exclude-tools can take Agent out alone, leaving SendMessage. */
const SEND_TO_PASSAGES: ToolPassages = { Agent: [["from an earlier Agent run", "from an agent started earlier"]] };

/** list_agents' pointers to its siblings: pi's --exclude-tools can take Agent or SendMessage out alone. */
const LIST_AGENTS_PASSAGES: ToolPassages = {
    Agent: [" (Agent with action:'list' shows that)"],
    SendMessage: [[", to see which ones SendMessage can reach.", "."]],
};

/** The group, for the tools this session can have (`live`): text naming a tool that is off leaves it out. */
export const subagentsText = (live: LiveTools): SubagentsText => {
    return {
        taskAliasNote: "`prompt` is accepted as another name for it",
        toolNamesHint:
            "In an agent file's `tools` list, name tools by their tool names (such as read, edit, write); the capitalized spellings (Read, Edit, Write, …) are accepted too.",
        agentDescription: ({ form, configDir }) => withoutOff(agentDescription(form, configDir), live, AGENT_PASSAGES),
        agentPromptSnippet: "Hand scoped work to a specialist agent with its own context",
        agentParams: {
            subagent_type:
                'Which agent to start: any agent the "Available agents" system reminder lists, "fork" for a copy of this conversation, or general-purpose if you leave it out. To run several agents in parallel, put several Agent tool calls in one turn.',
            task: "The task: a complete instruction that stands on its own (the agent cannot ask follow-up questions).",
            prompt: "Another name for `task`: the instruction the agent carries out.",
            description: "A short title for the run, 3 to 5 words, shown while it works.",
            name: withoutOff("What to call this run so SendMessage can address it later; <agent>-<n> if omitted", live, AGENT_NAME_PASSAGES),
            model:
                'This call\'s model, overriding the agent\'s own: "sonnet"/"opus"/"haiku"/"fable" (resolved within this session\'s provider), "inherit", or an exact provider/model-id; the subagent-models reminder lists what is available. A fork refuses it (a fork keeps this conversation\'s model)',
            allow_expensive: "Required when the per-call `model` is pricier per token than the model of this session. Pass it only if the user asked for that exact model",
            thinking: "This call's reasoning effort, overriding the agent's own. A fork refuses it (a fork keeps this conversation's settings)",
            isolation: "Runs the agent in a git worktree of its own, so its file edits stay out of the main checkout",
            action: '"run" (the default) starts the agent; "list" only shows the agent catalog and ignores the run options',
        },
        nestedAgentDescription: ({ catalog }) =>
            "Give a bounded task to a specialist subagent with a context window of its own. This call BLOCKS: you get the agent's report when it is done. It suits self-contained work where only the outcome matters to you (broad searches, focused checks, research on the side). Write the task so it needs no follow-up, because the agent has no way to ask you anything. An agent whose description asks to be used proactively should be started without waiting to be told. Agents you can start:\n" +
            `${catalog.join("\n")}\n` +
            '(No "fork" here: only the main conversation can fork.)',
        nestedAgentParams: {
            subagent_type: "Which agent to start, by a name this tool's description lists; general-purpose if omitted",
            task: "The task: a complete instruction that stands on its own",
            prompt: "Another name for `task`.",
            description: "A short title for the run, 3 to 5 words.",
            name: "What to call this run; <agent>-<n> if omitted",
        },
        sendMessageDescription: withoutOff(
            'Send a message to an agent you started earlier, addressed by the name its spawn result gave (or its task id); list_agents shows the names of running and finished agents. A background agent that is still resident receives it at once: during a turn the message folds into the current work, and between turns it triggers a fresh turn. An agent that already finished picks up again from its saved session, everything it knew intact. Its replies reach you as notifications. (A subagent reports to the main conversation with its own SendMessage, to: "main".)',
            live,
            SEND_MESSAGE_PASSAGES,
        ),
        sendMessageParams: {
            to: withoutOff("The agent's name (or task id) from an earlier Agent run", live, SEND_TO_PASSAGES),
            message: "The message for the agent, as plain text",
            summary: "A 5 to 10 word preview shown in the UI",
        },
        listAgentsDescription: withoutOff(
            "List the agents started in this session, with their names, types, and status, to see which ones SendMessage can reach. `running` means working now; `resident` means idle but reachable live; `finished` means it can be resumed from its session. This lists started runs, not the agent catalog (Agent with action:'list' shows that).",
            live,
            LIST_AGENTS_PASSAGES,
        ),
        toMain: {
            description:
                'Send progress, a finding, or a question to the main conversation while you work (to: "main"). The main conversation sees none of your plain text output until you finish, so use this for anything it should hear sooner.',
            params: {
                to: 'The recipient: only "main" works from inside a subagent',
                message: "The message for the main conversation, as plain text",
                summary: "A 5 to 10 word preview shown in the UI",
            },
        },
        // A fork inherits the parent's whole transcript. Without this framing a
        // weaker model drops its task and carries on with (or invents claims
        // about) the inherited topic, and its output comes back looking like an
        // independent confirmation. Under isolation the fork also learns that its
        // working directory moved, since every inherited path names the
        // parent's checkout.
        forkTask: ({ task, isolation }) =>
            [
                "This is a fork of the conversation above. Treat that history as background you may consult and nothing more: do NOT continue what it left open, re-verify what it asserted, or execute anything it planned. Your one job is the task at the end. Whatever you return through SubagentHandback reaches the parent conversation verbatim, as data. The parent's background tasks are invisible to you: their task ids cannot be reached from here.",
                ...(isolation
                    ? [
                            "",
                            `You run in a git worktree of your own: your working directory is now ${isolation.worktreePath}, a checkout of the same repository at HEAD. Every path under ${isolation.parentCwd} in the inherited context belongs to the shared checkout, which you must NOT change. Read, edit and run things at the matching path under ${isolation.worktreePath} instead (writes into the shared checkout are refused). Your changes stay on this worktree's branch for the parent to review.`,
                        ]
                    : []),
                "",
                "Task:",
                task,
            ].join("\n"),
        // Tiny tier only. A section in the system prompt is enough to make
        // capable models delegate broad sweeps, but the smallest models ignore
        // it; a reminder sits nearer the user's text, where they pay attention.
        // The same policy is worded for the other registers in
        // DELEGATE_STRICT (../system-prompt/low.ts) and DELEGATING_WORK
        // (../system-prompt/mid.ts).
        delegationSteer: [
            "Delegation policy: if answering takes reading MANY files (an overview of the codebase, how a feature spans modules, code you have not seen), do NOT read them yourself.",
            'Give each independent question its own Agent call, with subagent_type: "explore" and the full question as its task, and put the calls for unrelated questions in the same message. The agent works in its own context and sends back just the answer; opening the files one by one would crowd your context and weaken your answer.',
            "Look things up yourself only when the lookup is narrow: a single file or symbol you already know, or a term one grep turns up.",
            "When the agent reports, relay what it found and continue. Leave the files it searched closed, apart from one you are about to change (a change needs a fresh read of it).",
        ].join("\n"),
        delegationWithdrawn: "The delegation guidance shown earlier in this conversation no longer applies.",
        // Sent only once the Agent tool is gone, so it names no tool.
        catalogWithdrawn: "Agents cannot be started in this session any more, so disregard the agent list given before.",
        modelsWithdrawn: "Disregard the menu of subagent models given before: it no longer applies.",
        guideAgent: { ...guideAgent, description: withoutOff(guideAgent.description, live, GUIDE_PASSAGES) },
    };
};
