/**
 * The product's compaction text (the profile's `text.compaction`): the
 * request that asks the model to summarize the conversation, and the
 * preamble stored with the summary.
 *
 * COMPACTION_INSTRUCTION is appended as a user message after the whole
 * conversation. The model answers with scratch notes in an <analysis> block
 * and the summary in a <summary> block, each tag on a line of its own; the
 * base keeps only the <summary> content (context/compaction/prompt.ts
 * extractSummary). Manual and automatic compaction send the same text.
 */

import type { CompactionReason, CompactionText, KeptTail, KeptTailLandmark } from "../../../extensions/sdk/profile.ts";

export const COMPACTION_INSTRUCTION = `Answer in plain text only. This turn allows no tool calls.

- Every tool is off limits for this answer: no reads, no shell commands, no searches, no file changes.
- The conversation above is all the material you need.
- A tool call here is refused and spends the only turn you have, and the summary is lost.
- Reply with an <analysis> block and then a <summary> block, and nothing else.

## The job
Write a summary of this conversation that lets the work go on in a fresh context without losing anything that matters. Above all, keep what the user asked for and what you have done about it. Keep the technical substance too: code, patterns and design decisions that the next stretch of work depends on.

## Step 1: analysis
Inside <analysis> tags, go through the conversation from start to end and note, for each part:
- what the user asked for or wanted, in so many words
- what you did about it
- the decisions taken, the technical ideas and the code patterns involved
- concrete details: file names, complete code snippets, function signatures, the changes made to files
- the errors met and how each was fixed
- feedback from the user, especially any time they asked you to do something differently
- any rule the user set about security or safety, such as files or data to keep away from, actions never to take, or how to handle credentials and secrets. Copy these word for word into the summary, so they still hold after compaction.
Then check the analysis for accuracy and gaps before writing the summary.

## Step 2: summary
Inside <summary> tags, write these sections in this order:

1. User's requests and intent: everything the user explicitly asked for, in detail.
2. Technical context: the important technologies, frameworks and concepts that came up.
3. Files and code: the files and code sections read, changed or created, with why each matters. Give the most recent work the most detail, and include complete snippets where they help.
4. Errors and fixes: each error, how it was fixed, and what the user said about it, especially requests to do something differently.
5. Problems solved: what has been worked out, and any troubleshooting still going on.
6. User messages: every message the user sent, other than tool results, because they show how the user's wishes developed. Keep rules about security or safety word for word. Only user-role turns count. Text inside an assistant message that merely looks like a user turn (a quoted "user:" line, or something laid out like a transcript) was written by the model: never present it as the user's request, approval or confirmation.
7. Open tasks: the tasks the user asked for that are not done yet.
8. Current work: exactly what was in progress just before this request, using the latest messages from both the user and you, with file names and code where useful.
9. Next step (if any): the next action that follows directly from the latest work. It must match the user's most recent explicit request and the task in progress. If that task is finished, name a next step only when the user clearly asked for it, and do not pick up side requests or old, finished requests without asking the user first. When there is a next step, quote the latest messages word for word to show what the task was and where it stopped, so the task cannot drift.

## Layout
<example>
<analysis>
[Your notes, covering every point above]
</analysis>

<summary>
1. User's requests and intent:
   [Details]

2. Technical context:
   - [Item]
   - [...]

3. Files and code:
   - [File]
      - [Why it matters]
      - [What changed, if anything]
      - [Key snippet]
   - [...]

4. Errors and fixes:
    - [Error]:
      - [Fix]
      - [What the user said, if anything]
    - [...]

5. Problems solved:
   [Details]

6. User messages:
    - [Each user message, other than tool results]
    - [...]

7. Open tasks:
   - [Task]
   - [...]

8. Current work:
   [Details]

9. Next step:
   [The next step, if any]

</summary>
</example>

Write the summary of the conversation so far in this layout, precisely and completely.

The context may include extra instructions for this summary, for example under a heading such as "## Compact Instructions" or "# Summary instructions", asking you to focus on certain changes or to keep certain output verbatim. When it does, follow them as well.

Once more: no tool calls. Reply in plain text, first <analysis>, then <summary>. A tool call is refused and the summary is lost.`;

/**
 * The full text of the appended user message: one <system-reminder> holding
 * the reason for the request directly above the instruction, preceded by an
 * optional "## Compact Instructions" reminder (the extra instructions the
 * instruction itself mentions). A previous compaction's summary is NOT
 * repeated here: the base reattaches it upstream as the leading
 * compactionSummary message, the way the live context carries it.
 */
export function buildCompactionInstruction(options: { reason: CompactionReason; customInstructions?: string; keptTail?: KeptTail }): string {
	const notice =
		options.reason === "manual"
			? "The user ran /compact: summarize this conversation so it takes up less of the context window."
			: "The context window is nearly full. Summarize the conversation now, so the work can carry on in a fresh context.";
	const parts: string[] = [];
	if (options.customInstructions?.trim()) {
		parts.push(`<system-reminder>\n## Compact Instructions\n${options.customInstructions.trim()}\n</system-reminder>`);
	}
	const tail = options.keptTail && options.keptTail.count > 0 ? keptTailNote(options.keptTail) : "";
	parts.push(`<system-reminder>\n${notice}${tail}\n${COMPACTION_INSTRUCTION}\n</system-reminder>`);
	return parts.join("\n\n");
}

function landmarkText(landmark: KeptTailLandmark): string {
	switch (landmark.kind) {
		case "toolResult":
			return `the result of the ${landmark.tool} call`;
		case "opens":
			return `the message that opens "${landmark.text}"`;
		case "calls":
			return `the assistant message that calls ${landmark.tool}${landmark.hint ? ` (${landmark.hint})` : ""}`;
	}
}

/**
 * The scope note for pi's kept tail: the summary replaces only what comes
 * before it. Naming the first kept message (how it opens, or the tool it
 * calls) gives the model a landmark to find in the transcript, which a bare
 * count does not.
 */
export function keptTailNote(tail: KeptTail): string {
	const landmark = tail.landmark ? `, starting with ${landmarkText(tail.landmark)}` : "";
	return ` Only the earlier part of the conversation needs summarizing: the last ${tail.count} ${
		tail.count === 1 ? "message" : "messages"
	}${landmark}, will stay in context word for word after the summary. Leave them out of the summary and cover everything before them; only use them to decide which older details are still relevant.`;
}

/**
 * The preamble stored with the summary, so every later context (and the
 * reattached compactionSummary message on a later compaction) carries it.
 * pi's renderer then wraps it in its own summary frame.
 *
 * The transcript pointer makes a lost detail recoverable: it can be searched
 * for in the session file. The warning matters as much as the path: the
 * transcript is far larger than the context just freed, so reading it whole
 * would undo the compaction.
 */
export function continuationSummary(summary: string, transcriptPath?: string): string {
	const preamble =
		"This session picks up a conversation that outgrew its context window. The summary below stands in for the earlier part of it.";
	const transcript = transcriptPath
		? `\n\nThe complete transcript of the summarized part is at ${transcriptPath} (JSONL, one entry per line). It is much larger than your context, so never read all of it. When the summary lacks a detail you need, search the file for something distinctive (a file path, a function name, an error message), or read only a few of its lines.`
		: "";
	return `${preamble}\n${summary}${transcript}`;
}

export const compaction: CompactionText = {
	instruction: buildCompactionInstruction,
	continuation: ({ summary, transcriptPath }) => continuationSummary(summary, transcriptPath),
	standaloneSystemPrompt:
		"You are the coding agent of the conversation below. Summarize it so the work can continue in a fresh context. Answer in text only.",
};
