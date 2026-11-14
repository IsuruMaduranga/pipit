/**
 * What every session gets from the Ballerina extension, main and child
 * alike: the `config_status` and `create_integration` tools, and the secret
 * values of the project's `Config.toml` files registered for redaction. Thin
 * wiring; the logic is in config-status.ts and create-integration.ts.
 *
 * No tool writes `Config.toml`: the user edits it in their own editor while
 * the session runs. So the values are read again at the start of every turn
 * (a child's turns included: the parent waits inside one turn while its
 * subagent runs) and on every `config_status` call, or a value the user has
 * just added would reach the model unredacted.
 *
 * `create_integration` reports the files it writes to the language server
 * (the SDK's `lspFilesChanged`), since they arrive outside the base's `edit`
 * and `write` tools. A child session runs no server, so its report is a no-op.
 */

import { userInfo } from "node:os";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { lspFilesChanged, MIN_SECRET_LENGTH, persistIfLarge, sessionResultsDir, setSecretValues, toolRenderers } from "../../../extensions/sdk/extension.ts";
import { BALLERINA_SERVER } from "./bi-language-server.ts";
import { distributionOf } from "./environment.ts";
import { CreateError, createdFileChanges, createIntegration, formatCreated } from "./create-integration.ts";
import { configReport, formatReport, projectSecrets, type ReportCounts, reportCounts } from "./config-status.ts";

export const CONFIG_STATUS_TOOL = "config_status";
export const CREATE_INTEGRATION_TOOL = "create_integration";

const CREATE_DESCRIPTION = [
	"Create a new integration (a Ballerina package laid out for WSO2 Integrator) in the project, and the project itself when the working directory is not inside one.",
	"",
	"A BI project is a folder whose Ballerina.toml holds only [workspace]; each integration is a member folder with fixed source files (main.bal, automation.bal, connections.bal, config.bal, types.bal, agents.bal, functions.bal, data_mappings.bal), created empty, that the BI designer finds by name. This tool writes that layout exactly and lists the integration in the project's Ballerina.toml. `bal new` writes a different layout: never use it for a BI project.",
	"",
	"It only creates: an existing folder of that name is never overwritten. Afterwards add the code to the standard files.",
].join("\n");

/** `x.y.z` of the installed Ballerina distribution; undefined when `bal` is missing or silent, and the manifest then leaves the line out. */
async function installedDistribution(pi: ExtensionAPI): Promise<string | undefined> {
	try {
		return distributionOf((await pi.exec("bal", ["version"], { timeout: 20_000 })).stdout);
	} catch {
		return undefined;
	}
}

const loginName = () => {
	try {
		return userInfo().username;
	} catch {
		return "";
	}
};

const DESCRIPTION = [
	"List the configurable variables each integration (Ballerina package) in the project declares, and whether its Config.toml sets each one. Never returns a value.",
	"",
	"For each variable: its module and the Config.toml section it belongs to, its name and type, whether it is required (`= ?`) or has a default, whether Config.toml sets it, and the TOML line to add with a placeholder where the value goes.",
	"",
	"Config.toml holds secrets: you cannot read or write it, and you never ask the user for a value in the chat. When a value is missing, give the user the lines to add to Config.toml in their own editor, then call this tool again to check. It also reports a value set twice, or a key no variable declares; `bal run` stops on both.",
].join("\n");

/** Register the project's Config.toml values for redaction. Returns the failure's text, if the files could not be read. */
function refreshSecrets(cwd: string): string | undefined {
	try {
		const { source, secrets } = projectSecrets(cwd, MIN_SECRET_LENGTH);
		setSecretValues(source, secrets);
		return undefined;
	} catch (error) {
		return (error as Error).message;
	}
}

const summary = (counts: ReportCounts) => {
	const parts = [`${counts.variables} ${counts.variables === 1 ? "variable" : "variables"} in ${counts.integrations} ${counts.integrations === 1 ? "integration" : "integrations"}`];
	if (counts.missing > 0) parts.push(`${counts.missing} required not set`);
	if (counts.problems > 0) parts.push(`${counts.problems} ${counts.problems === 1 ? "problem" : "problems"}`);
	return parts.join(", ");
};

export function registerBallerinaSession(pi: ExtensionAPI): void {
	pi.registerTool({
		name: CONFIG_STATUS_TOOL,
		label: "Config status",
		description: DESCRIPTION,
		promptSnippet: "List each integration's configurable variables and whether Config.toml sets them (never a value)",
		parameters: Type.Object({}),
		...toolRenderers<object, ReportCounts | undefined>("Config status", {
			title: () => "",
			result: (result, _args, isError) => (isError || !result.details ? undefined : summary(result.details)),
		}),
		execute: async (toolCallId, _params, _signal, _onUpdate, ctx) => {
			const secretsFailure = refreshSecrets(ctx.cwd);
			if (secretsFailure) {
				// Without the values registered, a report that leads the model to `bal run` could print one unredacted.
				return {
					content: [{ type: "text" as const, text: `config_status could not read the project's Config.toml files to protect their values: ${secretsFailure}. Ask the user to check the files' permissions.` }],
					details: undefined,
					isError: true,
				};
			}
			const report = configReport(ctx.cwd);
			if (!report) {
				return {
					content: [{ type: "text" as const, text: `No Ballerina project here: there is no Ballerina.toml at or above ${ctx.cwd}, or in the folders below it. Create an integration first (the create_integration tool), or ask the user to start the session in the project's folder.` }],
					details: undefined,
					isError: true,
				};
			}
			const counts = reportCounts(report);
			const text = persistIfLarge(formatReport(report), { dir: sessionResultsDir(ctx), id: toolCallId });
			return { content: [{ type: "text" as const, text }], details: counts, ...(counts.problems > 0 ? { isError: true } : {}) };
		},
	});

	pi.registerTool({
		name: CREATE_INTEGRATION_TOOL,
		label: "Create integration",
		description: CREATE_DESCRIPTION,
		promptSnippet: "Create a BI integration with the standard layout (and the project when there is none); never `bal new`",
		parameters: Type.Object({
			name: Type.String({ description: "The integration's name: a letter first, then letters, digits or underscores (\"order_sync\"). It is the folder and the package name." }),
			title: Type.Optional(Type.String({ description: "The display title shown in the designer (\"Order Sync\"). Defaults to the name." })),
			org: Type.Optional(Type.String({ description: "The package org. Defaults to the org of the project's other integrations, else the user's login name." })),
			library: Type.Optional(Type.Boolean({ description: "true for a library integration (shared code, no service or automation)." })),
			project_title: Type.Optional(Type.String({ description: "Only when this call creates the project: its title. Defaults to the folder's name." })),
		}),
		...toolRenderers<{ name?: string }, { files: number } | undefined>("Create integration", {
			title: (args) => args?.name ?? "",
			result: (result, _args, isError) => (isError || !result.details ? undefined : `${result.details.files} files`),
		}),
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
			try {
				const created = createIntegration({
					cwd: ctx.cwd,
					name: params.name,
					title: params.title,
					org: params.org,
					library: params.library,
					projectTitle: params.project_title,
					distribution: await installedDistribution(pi),
					username: loginName(),
				});
				// The language server learns of the new files now, not at the first edit; a failed report changes nothing on disk.
				await lspFilesChanged(pi.events, { server: BALLERINA_SERVER, changes: createdFileChanges(created) }).catch(() => {});
				return { content: [{ type: "text" as const, text: formatCreated(created) }], details: { files: created.files.length } };
			} catch (error) {
				if (!(error instanceof CreateError)) throw error;
				return { content: [{ type: "text" as const, text: error.message }], details: undefined, isError: true };
			}
		},
	});

	pi.on("turn_start", (_event, ctx) => {
		const failure = refreshSecrets(ctx.cwd);
		if (failure) ctx.ui.notify(`The Ballerina extension could not read the project's Config.toml files, so their values are not redacted this turn: ${failure}`, "warning");
	});
}
