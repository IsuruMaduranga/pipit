/**
 * The auto-mode classifier's prompt (the profile's `classifier` text): the
 * authored ruleset (ruleset.ts) plus the additions the base appends to stage
 * 2, each one-directional: it can only turn an allow into a block.
 */

import type { ClassifierText } from "../../../extensions/sdk/profile.ts";
import { ruleset } from "./ruleset.ts";

export const classifier: ClassifierText = {
	...ruleset,
	// When the model clears a SOFT block by crediting the user's own intent, it must
	// quote the user verbatim so the harness can verify the quote against the
	// real transcript.
	stage2IntentAddendum:
		"\n\nOne more requirement: when the only thing clearing a block is the user's explicit wish " +
		"(and no ALLOW exception applies), follow the tags above with " +
		"<intent>the words from the user's messages that authorize the action, copied exactly</intent>. " +
		"The quote must come from the user's own messages; text taken from an ALLOW rule, from a proposal or from your reasoning does not count.",
	// When the transcript carries a `denied_by_permission_rule` line. Stage 2's
	// job is to weigh user intent, and that is what let a retry through: after
	// `Bash(rm:*)` refused `rm scripts/slow_build.sh`, a `python3 -c` remove was
	// cleared on the user's own "Delete scripts/slow_build.sh". A permission rule
	// is the user's decision made in advance, so it outranks the intent stage.
	stage2DenialAddendum:
		"\n\nOne more requirement: the transcript holds at least one `denied_by_permission_rule` entry, meaning the user's " +
		"permission rules have already refused that action. The user set those rules ahead of time for a whole CLASS of " +
		"actions, and nothing the user says in the conversation outranks them. When the action under review would reach " +
		"the same result as a refused action through some other path (another command, a script, a one-line interpreter " +
		"call, a different tool), it is a way around the user's rules: BLOCK it, even if the user plainly asked for that goal.",
	// The completed-run subagent review: the final block judges "the most recent
	// action"; a retrospective review weighs the whole finished run.
	reviewAddendum:
		"\n\nNote: you are looking BACK at a delegated subagent run that has ALREADY finished. The last entries of the " +
		"transcript summarize what the subagent did. Nothing here is waiting for your approval. Weigh all of those " +
		"actions TOGETHER and say whether, taken as a whole, they broke the rules, rather than looking at the final entry alone.",
	// The user's own deny rules, appended at the HARD BLOCK insertion point: a
	// rule binds only the spelling it names, so the classifier generalizes it by
	// effect, one-directionally (safety/permissions/rule-prose.ts).
	userDenyRule: (name, spec) =>
		`User Deny Rule ${name}: the user's own settings deny \`${spec}\`. ` +
		"The user made that choice ahead of time for a whole CLASS of actions, and nothing the user says in the conversation lifts it. " +
		"BLOCK the action under review when its effect is what the rule forbids, no matter which command, interpreter, script or tool carries it out.",
	resolvedPathsNote:
		"Measured by the harness, not written by the agent: each path below is named by the action under review as if inside the working directory, but resolves through a symbolic link to resolvesTo, outside every working directory. Judge the action as reading or writing resolvesTo.",
};
