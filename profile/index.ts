/**
 * The profile of Pipit (a code name): the coding agent for WSO2 Integrator,
 * built on the base harness in extensions/. This is the BI profile, for
 * WSO2 Integrator: BI projects written in Ballerina.
 *
 * Everything outside the product's own paths is the base, copied from one
 * commit of it by scripts/sync-base.mjs (.base-sync.json records which) and
 * never edited here. This folder is the product: the brand (brand.json), the
 * model-facing text (text/), the bundled agents, skills and themes, the
 * Ballerina extension (extensions/ballerina/) and the product's tests
 * (test/).
 *
 * The tool surface is deliberately small: the shell does everything it can,
 * and a product tool exists only where the shell cannot do the job.
 */

import type { Profile } from "../extensions/sdk/profile.ts";
import { askUserText } from "./text/ask-user/index.ts";
import { classifier } from "./text/auto-mode/classifier.ts";
import { autoModeSetup } from "./text/auto-mode/setup.ts";
import { backgroundText } from "./text/background/index.ts";
import { btw } from "./text/btw/index.ts";
import { compaction } from "./text/compaction/index.ts";
import { context } from "./text/context/index.ts";
import { effort } from "./text/effort/index.ts";
import { handback } from "./text/handback/index.ts";
import { init } from "./text/init/index.ts";
import { lsp } from "./text/lsp/index.ts";
import { mcp } from "./text/mcp/index.ts";
import { nativeWeb } from "./text/native-web/index.ts";
import { notifications } from "./text/notifications/index.ts";
import { permissionsText } from "./text/permissions/index.ts";
import { planModeText } from "./text/plan-mode/index.ts";
import { recap } from "./text/recap/index.ts";
import { sessionTitle } from "./text/session-title/index.ts";
import { shellText } from "./text/shell/index.ts";
import { skill } from "./text/skill/index.ts";
import { subagentModels } from "./text/subagent-models/index.ts";
import { subagentsText } from "./text/subagents/index.ts";
import { systemPromptText } from "./text/system-prompt/index.ts";
import { tasks } from "./text/tasks/index.ts";
import { toolSearchText } from "./text/tool-search/index.ts";
import { toolStyleText } from "./text/tool-style/index.ts";
import { webFetchText } from "./text/web-fetch/index.ts";
import { webSearch } from "./text/web-search/index.ts";

/** A tool the product does not offer: never registered, and a call to it is denied. */
const off = { enabled: false } as const;

export const profile: Profile = {
	// Not part of the product: notebooks, published pages, scripted fan-out, worktree sessions, the setup doctor.
	features: { notebook: false, artifacts: false, workflow: false, worktree: false, doctor: false },
	tools: {
		// Search goes through the shell on every tier: pi's own grep, find and ls tools are off.
		grep: off,
		find: off,
		ls: off,
		// Reads which configurable variables exist and which are set, never a value.
		config_status: { readOnly: true, autoAllow: true },
		// Scheduling and watching are not part of the product; background shells and their output are.
		cron_create: off,
		cron_list: off,
		cron_delete: off,
		schedule_wakeup: off,
		monitor: off,
	},
	childExtensions: ["extensions/ballerina/child.ts"],
	// Config.toml holds the values of an integration's configurable variables: the model never reads it.
	secretFiles: ["Config.toml"],
	// Library lookup is the shell: these read Ballerina Central and write nothing in the project.
	readOnlyCommands: {
		bal: {
			search: {},
			discover: { none: "-h --help --refresh", required: "-p --package --accessor --client --class --service --filter --module --output-format --page" },
			version: {},
		},
	},
	// The Ballerina language server of the installed distribution: diagnostics after each edit of a .bal file.
	languageServers: {
		ballerina: { command: "bal", args: ["start-language-server"], extensions: { ".bal": "ballerina" }, rootMarkers: ["Ballerina.toml"], startupTimeoutMs: 60_000 },
	},
	text: ({ live }) => ({
		systemPrompt: systemPromptText(live),
		askUser: askUserText(live),
		tasks,
		webFetch: webFetchText(live),
		webSearch,
		nativeWeb,
		sessionTitle,
		init,
		btw,
		recap,
		effort,
		planMode: planModeText(live),
		skill,
		mcp,
		lsp,
		background: backgroundText(live),
		toolStyle: toolStyleText(live),
		compaction,
		permissions: permissionsText(live),
		classifier,
		autoModeSetup,
		shell: shellText(live),
		notifications,
		context,
		toolSearch: toolSearchText(live),
		handback,
		subagentModels,
		subagents: subagentsText(live),
	}),
	globalAgentsFiles: ["~/.agents/AGENTS.md"],
};
