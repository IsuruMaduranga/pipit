/**
 * The Ballerina extension's main-session entry: the tools and secret
 * redaction every session gets (session.ts), the `# Ballerina` section of
 * the system prompt (prompt.ts), and one notice when Ballerina is missing or
 * out of date on this machine (environment.ts), which points the model at
 * the `ballerina-setup` skill. A child session loads child.ts instead.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { REMINDER_CHANNEL, type ReminderPayload, SYSTEM_PROMPT_SECTION_CHANNEL, type SystemPromptSection } from "../../../extensions/sdk/extension.ts";
import { probeBallerina, setupNotice } from "./environment.ts";
import { ballerinaSection } from "./prompt.ts";
import { registerBallerinaSession } from "./session.ts";

export const BALLERINA_SECTION_ID = "ballerina";
export const SETUP_REMINDER_KEY = "ballerina-setup";
/** `bal` starts a JVM: slow on a cold machine, and never worth holding a session for. */
const PROBE_TIMEOUT_MS = 30_000;

export default function ballerina(pi: ExtensionAPI) {
	registerBallerinaSession(pi);
	pi.events.emit(SYSTEM_PROMPT_SECTION_CHANNEL, { id: BALLERINA_SECTION_ID, place: "tail", render: ballerinaSection } satisfies SystemPromptSection);

	// The check runs beside the session, never in its way: the session starts
	// at once, and the notice joins the next request after the answer is in.
	// With Ballerina in place it says nothing, so the usual session pays nothing.
	let live = false;
	pi.on("session_start", () => {
		live = true;
		void probeBallerina((command, args) => pi.exec(command, args, { timeout: PROBE_TIMEOUT_MS })).then((status) => {
			const text = setupNotice(status);
			if (live && text) pi.events.emit(REMINDER_CHANNEL, { key: SETUP_REMINDER_KEY, text, placement: "last-append" } satisfies ReminderPayload);
		});
	});
	pi.on("session_shutdown", () => {
		live = false;
	});
}
