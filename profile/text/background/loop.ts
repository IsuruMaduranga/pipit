/**
 * The product's /loop text (the profile's `text.background.loop`): the body
 * of the /loop skill for each form of its arguments, and the short notes a
 * fired loop marker delivers. The base sorts the arguments into a form and
 * decides which note goes out (extensions/tools/background/loop-skill.ts,
 * loop-fire.ts); the markers are the base's (loop-sentinels.ts).
 *
 * This product does not ship /loop and turns cron_create, schedule_wakeup
 * and monitor off, so this text is sent only if a later version turns them
 * on. It is kept complete for that day, and names the task_output tool (not
 * task_list, the to-do list) for finding a running monitor.
 */

import { AUTONOMOUS_LOOP, AUTONOMOUS_LOOP_DYNAMIC, LOOP_FILE_DYNAMIC_SENTINEL, LOOP_FILE_SENTINEL, type LoopFile, type LoopText, type LoopTick } from "../../../extensions/sdk/profile.ts";
import { AUTONOMOUS_PREAMBLE, AUTONOMOUS_PREAMBLE_PERSISTENT } from "./loop-preamble.ts";

const WAKEUP = "schedule_wakeup";
const CRON_CREATE = "cron_create";
const CRON_DELETE = "cron_delete";
const MONITOR = "monitor";
const TASK_STOP = "task_stop";
const TASK_OUTPUT = "task_output";

/** The self-paced forms report in visible text after arming the wake-up, and say how a stopped loop ended. */
const VISIBLE_UPDATE = "Write it as normal reply text, since the user cannot see your reasoning, and end the turn with it.";
const STOP_OUTCOME = "Then tell the user, in normal reply text, how the loop ended: a stopped loop has no later turn to say it.";

/** A loop-tasks file as the model reads it, with a warning when it was cut. */
function fileText(file: LoopFile): string {
	return file.truncatedAt === undefined ? file.content : `${file.content}\n\n> WARNING: loop.md was cut to ${file.truncatedAt} bytes. Keep the task list short.`;
}

const INTERVAL_TABLE = `| Interval          | Cron expression   | Meaning                                          |
|-------------------|-------------------|--------------------------------------------------|
| \`Nm\`, N up to 59  | \`*/N * * * *\`     | every N minutes                                  |
| \`Nm\`, N 60 or more | \`0 */H * * *\`   | whole hours (H = N/60, and H must divide 24)     |
| \`Nh\`, N up to 23  | \`0 */N * * *\`     | N hours apart                                    |
| \`Nd\`              | \`0 0 */N * *\`     | N days apart, at local midnight                  |
| \`Ns\`              | as \`ceil(N/60)m\`  | cron cannot go below one minute                  |

**When the interval does not divide its unit evenly** (\`7m\` as \`*/7 * * * *\` leaves an uneven gap from :56 to :00; \`90m\` is 1.5 hours, which cron cannot express), take the nearest even interval, and say which one you rounded to before you schedule it.`;

const ARM_MONITOR = "start one now with `persistent: true`";

function rearmNote(turns: "iterations" | "turns"): string {
	return `Start it once; on later ${turns}, look with ${TASK_OUTPUT} for a ${MONITOR} already running for it, and skip this step if there is one.`;
}

/** The self-paced steps shared by both self-paced forms. `marker` is what `prompt` carries; `confirm` what the update reports. */
function selfPacedSteps(p: { firstStep: string; marker: string; markerNote: string; confirm: string; turns: "iterations" | "turns"; delayHint: string }): string {
	return `1. ${p.firstStep}
2. **When the next run should wait for an event** (a CI run finishing, a log line, a changed file, a review comment) and no ${MONITOR} is watching for it yet: ${ARM_MONITOR}. Each event comes in as a \`<task-notification>\` message and wakes the loop at once, without waiting for the ${WAKEUP} delay. ${rearmNote(p.turns)}
3. **Decide whether the loop goes on.** If another run is worth it, call ${WAKEUP} with:
   - \`delaySeconds\`: with a ${MONITOR} running, this is only the fallback in case no event comes (prefer 1200 to 1800 seconds; turns more frequent than the task needs are waste). ${p.delayHint} The tool's description has advice on delays and caching.
   - \`reason\`: a sentence saying why this delay.
   - \`prompt\`: ${p.markerNote}
   - \`noop\`: \`true\` when this turn changed nothing ("still waiting"), \`false\` when it did something worth keeping. Runs of \`noop: true\` turns are folded together in the user's view.
   If no further run is needed, stop instead (see the last step). Going on is decided each turn; it is not the default.
4. **Once the wake-up is set, report briefly**: ${p.confirm}, whether a ${MONITOR} is what will wake the loop, and the fallback delay you chose. ${VISIBLE_UPDATE}
5. **When a \`<task-notification>\` woke you** instead of the loop prompt, deal with the event as part of the loop's task, then decide in the same way. To go on, call ${WAKEUP} again with ${p.marker} and the same 1200 to 1800 second delay (the ${MONITOR} still wakes the loop; the wake-up is only the fallback), then write the same short update. When the event means the work is done, stop as the next step says.
6. **Stopping**: when the task is done, more runs cannot help, or the user asked, call ${WAKEUP} with \`stop: true\` and nothing else, and ${TASK_STOP} every ${MONITOR} you started (if its task id has scrolled out of view, ${TASK_OUTPUT} lists it). ${STOP_OUTCOME} Stopping is how a loop normally ends; the user can start it again with /loop.`;
}

/** `/loop <input>`: the model parses out an interval, or paces itself. */
function explicitPrompt(input: string, maxAgeDays: number): string {
	const dynamic = selfPacedSteps({
		firstStep: "**Run the prompt now.** If it is a slash command, run it with the skill tool; otherwise do what it says.",
		marker: "the same `prompt`",
		markerNote:
			"the whole original /loop input, word for word and starting with `/loop `, so the next run comes back to this skill. For `/loop watch the staging rollout`, the prompt is `/loop watch the staging rollout`.",
		confirm: "that you are pacing the loop yourself, that you ran the task now",
		turns: "iterations",
		delayHint: "Without one, the delay is the pace: choose it from what you saw.",
	});
	return `# /loop: run a prompt on a schedule, or at your own pace

Read the input at the end as \`[interval] <prompt>\`, then schedule it.

## Reading the input (first rule that applies)

1. **Interval first**: if the first word matches \`^\\d+[smhd]$\` (such as \`5m\` or \`2h\`), it is the interval and the rest is the prompt.
2. **"every" at the end**: if the input ends in \`every <N><unit>\` or \`every <N> <unit word>\` (such as \`every 15m\`, \`every 10 minutes\` or \`every 3 hours\`), that is the interval; remove it from the prompt. It counts only when a time follows "every": \`look at every PR\` has none.
3. **Otherwise**: the whole input is the prompt, and you pace the loop yourself (see "Self-paced" below).

If the prompt comes out empty, reply with the usage line \`/loop [interval] <prompt>\` and go no further.

Some inputs and how they read:
- \`10m /review-open-prs\`: rule 1 gives the interval \`10m\` and the prompt \`/review-open-prs\`
- \`watch the staging rollout every 15m\`: rule 2 gives \`15m\` and \`watch the staging rollout\`
- \`rerun the flaky suite every 10 minutes\`: rule 2 gives \`10m\` and \`rerun the flaky suite\`
- \`watch the staging rollout\`: rule 3, self-paced, with the whole input as the prompt
- \`look at every open PR\`: rule 3 as well, because no time follows "every"
- \`5m\`: the prompt is empty, so reply with the usage line

## Fixed interval (rules 1 and 2)

Turn the interval into a cron expression:

${INTERVAL_TABLE}

Then:
1. Call ${CRON_CREATE}: \`recurring: true\`, the cron expression as \`cron\`, and the prompt, word for word, as \`prompt\`.
2. Report briefly: what is scheduled, the cron expression, the pace in plain words, that repeating jobs expire after ${maxAgeDays} days, and that the user can cancel earlier with ${CRON_DELETE} (give the job id).
3. **Then run the prompt right away** instead of waiting for the first scheduled run. If it is a slash command, run it with the skill tool; otherwise do what it says.

## Self-paced (rule 3)

Here the pace is yours to set. Decide what makes the next run worthwhile: time passing, or something you can observe happening.

${dynamic}

## Input

${input}`;
}

/** `/loop` or `/loop <interval>` with no prompt: loop.md's tasks, or the autonomous instructions. */
function noPromptBody(file: LoopFile | null, selfPaced: boolean, interval: string, preamble: string, maxAgeDays: number): string {
	const heading = file ? `## Loop tasks (from ${file.path})` : "## Autonomous-loop instructions (for this run and every later one)";
	const body = file ? fileText(file) : preamble;
	const what = file ? "the loop.md tasks" : "the autonomous check";
	if (selfPaced) {
		const marker = file ? LOOP_FILE_DYNAMIC_SENTINEL : AUTONOMOUS_LOOP_DYNAMIC;
		const intro = file
			? `# /loop: loop.md tasks, self-paced

The user gave \`/loop\` neither a prompt nor an interval; a loop-tasks file exists at \`${file.path}\`. Run its tasks now, then set the next run yourself with ${WAKEUP}; no cron job.`
			: `# /loop: the autonomous loop, self-paced

The user gave \`/loop\` neither a prompt nor an interval. Run the autonomous check now, then set the next run yourself with ${WAKEUP}; no cron job.`;
		const steps = selfPacedSteps({
			firstStep: `**Run ${what} now**, following the instructions below.`,
			marker: `\`${marker}\``,
			markerNote: `the exact marker \`${marker}\`. When the wake-up fires, the marker is replaced by the full instructions (on the first run, the first run after a compaction, or when loop.md changed) or by a short reminder (on later runs). Do not pass the instructions themselves.`,
			confirm: file ? `that you are running the tasks in \`${file.path}\` at your own pace, that you ran the first round now` : "that this is the autonomous loop at your own pace, that you ran the check now",
			turns: "turns",
			delayHint: "Without one, choose from what you saw this turn: a quiet branch means a longer wait, a lot going on a shorter one.",
		});
		return `${intro}

## Steps

${steps}

${heading}

${body}`;
	}
	const marker = file ? LOOP_FILE_SENTINEL : AUTONOMOUS_LOOP;
	const intro = file
		? `# /loop: loop.md tasks on a schedule

The user ran \`/loop\` with no prompt (no input, or only the interval \`${interval}\`), and has a loop-tasks file at \`${file.path}\`. Schedule a repeating cron job that runs those tasks each time, then run the first round right away.`
		: `# /loop: the autonomous loop on a schedule

The user ran \`/loop\` with no prompt (no input, or only the interval \`${interval}\`). Schedule the autonomous loop, then run the first autonomous check right away.`;
	const expands = file
		? "when the job fires, the marker is replaced by the whole of loop.md the first time (and whenever loop.md has changed since the last run), and by a short reminder otherwise, so the long text stays in the cached part of the conversation."
		: "when the job fires, the marker is replaced by the full autonomous-loop instructions the first time and by a short reminder afterwards, so the long text stays in the cached part of the conversation.";
	const report = file
		? `what is scheduled, the cron expression, the pace in plain words, that it runs the tasks in \`${file.path}\`, that repeating jobs expire after ${maxAgeDays} days, and that the user can cancel earlier with ${CRON_DELETE} (give the job id).`
		: `what is scheduled, the cron expression, the pace in plain words, that repeating jobs expire after ${maxAgeDays} days, and that the user can cancel earlier with ${CRON_DELETE} (give the job id). Say that this is the autonomous loop and that its instructions are included.`;
	return `${intro}

## Steps

1. Turn \`${interval}\` into a five-field cron expression. Suffixes: \`s\` (rounded up to whole minutes), \`m\` (minutes), \`h\` (hours), \`d\` (days). For example \`5m\` is \`*/5 * * * *\`, \`1h\` is \`0 * * * *\` and \`1d\` is \`0 0 * * *\`. When the interval does not divide its unit evenly, round to the nearest even interval and tell the user.
2. Call ${CRON_CREATE}, passing \`recurring: true\`, the expression you built in step 1 as \`cron\`, and as \`prompt\` the exact marker \`${marker}\`; ${expands}
3. Report briefly: ${report}
4. **Then run ${what} right away**, following the instructions below, instead of waiting for the first scheduled run.

${heading}

${body}`;
}

const MONITOR_NOTE = `

If a ${MONITOR} is running (check with ${TASK_OUTPUT}), keep \`delaySeconds\` at 1200 to 1800 seconds: the ${MONITOR} wakes the loop and the wake-up is only the fallback. If a \`<task-notification>\` woke you, deal with the event before deciding whether to go on. To stop the loop, call ${WAKEUP} with \`stop: true\` and ${TASK_STOP} the ${MONITOR} (if its task id has scrolled out of view, ${TASK_OUTPUT} lists it).`;

function keepAlive(marker: string, extra = ""): string {
	return `A ${WAKEUP} call (not a cron job) scheduled this run. To keep the loop going${extra}, call ${WAKEUP} again at the end of this turn with \`prompt\` set to the exact marker \`${marker}\`, and \`noop\` set to \`true\` if this run changed nothing or \`false\` if it did. Without that call the loop ends after this run.${MONITOR_NOTE}`;
}

const TICKS: Record<LoopTick, () => string> = {
	autonomous: () => `# Autonomous loop run

Run the autonomous check, following the loop instructions given earlier in this conversation. If you cannot find them, treat this run as having nothing to do. The cron job schedules the next run by itself, so do not call ${WAKEUP} now.`,
	autonomousDynamic: () => `# Autonomous loop run (self-paced)

Run the autonomous check, following the loop instructions given earlier in this conversation. If you cannot find them, treat this run as having nothing to do.

${keepAlive(AUTONOMOUS_LOOP_DYNAMIC)}`,
	loopFile: () => `# /loop run: loop.md tasks

Work through the tasks from loop.md, as given earlier in this conversation. If you cannot find them, treat this run as having nothing to do. The cron job schedules the next run by itself, so do not call ${WAKEUP} now.`,
	loopFileDynamic: () => `# /loop run: loop.md tasks (self-paced)

Work through the tasks from loop.md, as given earlier in this conversation. If you cannot find them, treat this run as having nothing to do.

${keepAlive(LOOP_FILE_DYNAMIC_SENTINEL)}`,
	loopFileAbsentDynamic: () => `# /loop run: loop.md is gone (self-paced)

There is no loop.md at the moment. Run the autonomous check, following the loop instructions given earlier in this conversation.

${keepAlive(LOOP_FILE_DYNAMIC_SENTINEL, ", and to pick loop.md up again if it comes back")}`,
};

const preamble = ({ persistent }: { persistent: boolean }) => (persistent ? AUTONOMOUS_PREAMBLE_PERSISTENT : AUTONOMOUS_PREAMBLE);

export const loop: LoopText = {
	skillBody: ({ form, loopFile, persistent, maxAgeDays }) =>
		form.kind === "prompt" ? explicitPrompt(form.input, maxAgeDays) : noPromptBody(loopFile, form.selfPaced, form.interval, preamble({ persistent }), maxAgeDays),
	tick: (tick) => TICKS[tick](),
	loopFileTick: ({ loopFile, tick }) => `# /loop run: tasks from ${loopFile.path}

The user set up a loop-tasks file. Work through the tasks below; they are the instructions for this run and every later one (the reminder on later runs points back to this message).

---

${fileText(loopFile)}

---

${tick}`,
	withPreamble: ({ persistent, tick }) => `${preamble({ persistent })}\n\n---\n\n${tick}`,
	foldNote: ({ streak }) => `[${streak} earlier /loop ${streak === 1 ? "run" : "runs"} found nothing to do; the loop is working.]`,
};
