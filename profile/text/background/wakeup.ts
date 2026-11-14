/**
 * The product's schedule_wakeup text (the profile's `text.background.wakeup`):
 * the description and parameters of the tool a self-paced /loop uses to set
 * its next turn.
 *
 * This product turns schedule_wakeup off (profile/index.ts), so the text is
 * sent only if a later version turns it on. The delay advice is written for
 * any provider: it assumes a prompt cache of a few minutes, and never names a
 * billing plan.
 */

import type { WakeupText } from "../../../extensions/sdk/profile.ts";

export const wakeup: WakeupText = {
	description: `Set when the next turn of a self-paced /loop runs. The user started /loop without an interval, so you decide the pace of a repeated task.

Do not use short wake-ups to check on background work you started yourself: when work the harness tracks ends, you are woken anyway, so polling only costs turns. Set a long fallback instead (1200 seconds or more), so the loop carries on even if that work hangs or never reports. Work the harness cannot see, such as a CI run, a deployment or a remote queue, is the exception: there, choose a delay that fits how fast its state really changes.

On every turn, pass the /loop prompt back in \`prompt\`, so the next turn repeats the task. For an autonomous /loop (started with no prompt), pass the exact marker \`<<autonomous-loop-dynamic>>\` as \`prompt\`; it is replaced by the autonomous-loop instructions when the turn fires. The similar \`<<autonomous-loop>>\` marker belongs to loops scheduled with cron_create; this tool always takes the \`-dynamic\` one. Ending the loop: call it with \`stop: true\` and no other fields. The loop ends at once and no more wake-ups fire.

Set \`noop: true\` when the turn found nothing new ("no change", "still waiting"). Set \`noop: false\` when something worth keeping happened: you changed a file, sent a message, moved the work on or found something. Runs of \`noop: true\` turns are folded together in the user's view and counted, so a long quiet stretch stays easy to read. Leave \`noop\` out when stopping.

## Choosing delaySeconds

The provider's prompt cache makes waking soon cheap: while the cached conversation is still alive, it is read back at a low price; after it expires, the whole conversation is read again at full price. Caches commonly live about five minutes, and some providers keep them up to an hour.

Never add wake-ups only to keep the cache alive; they cost more than the miss they prevent. Fit the delay to what you are waiting for. When you are checking something outside the harness, use the pace at which it changes. For idle turns with nothing in particular to watch, use **1200 to 1800 seconds** (20 to 30 minutes); the user can always step in sooner.

With a five-minute cache, two more points: below 300 seconds the cache stays warm, so when checking often, 270 seconds beats 300 (300 pays for the miss without gaining anything); and prefer one wait of 1200 seconds or more over several of about 300, so a single miss buys a long pause.

The delay is held between 60 and 3600 seconds for you.

## The reason

One short sentence on the delay you chose and why. The user sees it and uses it to follow what you are doing, so make it specific: "waiting for the nightly CI run" says more than "waiting".
`,
	params: {
		delaySeconds: "How many seconds from now to wake. Held between 60 and 3600. Required unless `stop` is true.",
		reason: "One short, specific sentence on why this delay. The user sees it. Required unless `stop` is true.",
		prompt:
			"The /loop input to run when the wake-up fires. Pass the same input every turn so the next turn re-enters the skill and the loop goes on. For an autonomous /loop (no prompt), pass the exact marker `<<autonomous-loop-dynamic>>`, not the cron marker `<<autonomous-loop>>`. Required unless `stop` is true.",
		stop: "True ends the self-paced loop now instead of scheduling another wake-up. Every other field is then ignored and no further wake-ups fire.",
		noop: "true: the turn found nothing new. false: something worth keeping happened (a file changed, a message went out, the work moved on, something was found). Runs of noop:true turns are folded together and counted in the user's view. Required unless `stop` is true.",
	},
};
