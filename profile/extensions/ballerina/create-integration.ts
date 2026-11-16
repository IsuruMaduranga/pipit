/**
 * Creating a BI integration, and the BI project around it when there is none
 * (pure: file reads and writes only, no pi imports).
 *
 * A BI project is not what `bal new` writes. It is a Ballerina workspace
 * whose root `Ballerina.toml` holds only `[workspace]`, with each integration
 * a member package of fixed, at first empty, source files that the BI
 * designer looks for by name. The files written here are the ones BI's own
 * creator writes (the BI extension for VS Code, `utils/bi.ts`:
 * `createBIProjectPure` and `createBIWorkspaceWithProject`), byte for byte,
 * so a project made in the terminal opens in the designer like one made
 * there. profile/test/ballerina-create-integration.test.ts holds the
 * templates to that.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, parse, resolve } from "node:path";
import type { LspFileChange } from "../../../extensions/sdk/extension.ts";
import { findProject, MANIFEST } from "./project.ts";

/** The package that marks an integration as a library; `lib.bal` imports it. */
export const LIBRARY_VALIDATOR = "wso2/strict.library";

const SETTINGS_JSON = `
{
    "ballerina.isBI": true
}
`;

const LAUNCH_JSON = `{
    // Use IntelliSense to learn about possible attributes.
    // Hover to view descriptions of existing attributes.
    // For more information, visit: https://go.microsoft.com/fwlink/?linkid=830387
    "version": "0.2.0",
    "configurations": [
        {
            "name": "Ballerina Debug",
            "type": "ballerina",
            "request": "launch",
            "programArgs": [],
            "commandOptions": [],
            "env": {}
        },
        {
            "name": "Ballerina Test",
            "type": "ballerina",
            "request": "launch",
            "debugTests": true,
            "programArgs": [],
            "commandOptions": [],
            "env": {}
        },
        {
            "name": "Ballerina Remote",
            "type": "ballerina",
            "request": "attach",
            "debuggeeHost": "127.0.0.1",
            "debuggeePort": "5005"
        }
    ]
}`;

const GITIGNORE = `# Ballerina generates this directory during the compilation of a package.
# It contains compiler-generated artifacts and the final executable if this is an application package.
target/

# Ballerina maintains the compiler-generated source code here.
# Remove this if you want to commit generated sources.
generated/

# Contains configuration values used during development time.
# See https://ballerina.io/learn/provide-values-to-configurable-variables/ for more details.
Config.toml`;

/** The source files of an integration, each created empty; the designer finds a construct by its file. */
export const SOURCE_FILES = ["connections.bal", "config.bal", "types.bal", "agents.bal", "functions.bal", "data_mappings.bal"] as const;
/** The two a library integration does not have. */
export const APP_ONLY_FILES = ["main.bal", "automation.bal"] as const;
const EMPTY = "\n";

/** A TOML basic string's content. */
const tomlString = (value: string) => value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

export interface PackageManifest {
	org: string;
	name: string;
	title: string;
	/** `x.y.z` of the installed distribution; the line is left out when unknown. */
	distribution?: string;
}

/** An integration's `Ballerina.toml`. */
export function packageManifest({ org, name, title, distribution }: PackageManifest): string {
	const distributionLine = distribution ? `distribution = "${distribution}"\n` : "";
	return `\n[package]\norg = "${tomlString(org)}"\nname = "${name}"\nversion = "0.1.0"\n${distributionLine}title = "${tomlString(title)}"\n\n[build-options]\nsticky = true\n\n`;
}

/** A new project's root `Ballerina.toml`, with its first integration. */
export function workspaceManifest(title: string, folder: string): string {
	return `\n[workspace]\ntitle = "${tomlString(title)}"\npackages = ["${folder}"]\n\n`;
}

/**
 * A name as a package name and folder: lowercase letters, digits and
 * underscores, starting with a letter. Undefined when nothing usable is left.
 */
export function packageName(name: string): string | undefined {
	const cleaned = name
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9_]+/g, "_")
		.replace(/_+/g, "_")
		.replace(/^_+|_+$/g, "");
	return /^[a-z][a-z0-9_]*$/.test(cleaned) ? cleaned : undefined;
}

/** An org name: letters, digits and underscores (the user's login name can hold dots or dashes). */
export function orgName(name: string): string | undefined {
	const cleaned = name.trim().replace(/[^A-Za-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
	return cleaned === "" ? undefined : cleaned;
}

/**
 * The root manifest with `folder` added to `[workspace] packages`. The rest
 * of the file is kept as written. Undefined when it has no `packages` array
 * to add to and no `[workspace]` header to put one under.
 */
export function withPackage(manifest: string, folder: string): string | undefined {
	const array = /^([ \t]*packages[ \t]*=[ \t]*)\[([\s\S]*?)\]/m.exec(manifest);
	if (array) {
		const inner = array[2] ?? "";
		const entries = inner.trim().replace(/,\s*$/, "");
		let next: string;
		if (entries === "") next = `["${folder}"]`;
		else if (inner.includes("\n")) {
			// One entry a line: keep that shape and the entries' indent.
			const indent = /\n([ \t]*)\S/.exec(inner)?.[1] ?? "    ";
			next = `[${inner.replace(/,?\s*$/, "")},\n${indent}"${folder}"\n]`;
		} else next = `[${entries}, "${folder}"]`;
		return manifest.slice(0, array.index) + array[1] + next + manifest.slice(array.index + array[0].length);
	}
	const header = /^[ \t]*\[workspace\][ \t]*(#.*)?$/m.exec(manifest);
	if (!header) return undefined;
	const at = header.index + header[0].length;
	return `${manifest.slice(0, at)}\npackages = ["${folder}"]${manifest.slice(at)}`;
}

export interface CreateRequest {
	/** The session's working directory. */
	cwd: string;
	/** The integration's name, as the user gave it. */
	name: string;
	/** Its display title; the name when left out. */
	title?: string;
	/** The package org; the project's other integrations' org, else the user's login name. */
	org?: string;
	/** A library integration: `lib.bal`, and no `main.bal` or `automation.bal`. */
	library?: boolean;
	/** The title of a project this call creates; the folder's name when left out. */
	projectTitle?: string;
	/** `x.y.z` of the installed Ballerina distribution, when known. */
	distribution?: string;
	/** The user's login name, the org of last resort. */
	username: string;
}

export interface Created {
	/** The project's root folder. */
	projectRoot: string;
	/** True when this call wrote the project's root files. */
	projectCreated: boolean;
	/** The integration's folder. */
	integrationDir: string;
	org: string;
	name: string;
	library: boolean;
	/** Every file written or changed, absolute. */
	files: string[];
}

/**
 * The files of a creation the language server reads, as the SDK's report
 * takes them: the new `.bal` files and package manifest as created, and the
 * project's manifest as created or, when it already existed and gained the
 * integration, changed. The editor settings and `.gitignore` are no server's
 * business.
 */
export function createdFileChanges(created: Created): LspFileChange[] {
	const rootManifest = join(created.projectRoot, MANIFEST);
	return created.files
		.filter((path) => path.endsWith(".bal") || basename(path) === MANIFEST)
		.map((path) => ({ path, type: path === rootManifest && !created.projectCreated ? ("changed" as const) : ("created" as const) }));
}

/** A refusal: what stands in the way, and the fix. */
export class CreateError extends Error {}

/** The nearest folder at or above `dir` that holds a `Ballerina.toml`. */
function manifestDirAbove(dir: string): string | undefined {
	let current = resolve(dir);
	for (;;) {
		if (existsSync(join(current, MANIFEST))) return current;
		const parent = dirname(current);
		if (parent === current) return undefined;
		current = parent;
	}
}

/** The `.bal` files directly in `dir`, sorted. Throws when the folder cannot be read. */
function balFiles(dir: string): string[] {
	return readdirSync(dir)
		.filter((file) => file.endsWith(".bal"))
		.sort();
}

/**
 * The refusal for a path that exists. A model that lost track of its own
 * steps calls the tool again after it succeeded, so for an integration the
 * project lists, the text says it is already there and names both fixes:
 * write the code in it, or pick another name for a second integration.
 * Anything else at that path (a file, an empty folder, a folder the project
 * does not list) is not the integration, so the text says what is there and
 * never sends the model to write code into it. The listing is best effort;
 * an unreadable folder leaves it out.
 */
function existingPathMessage(path: string, listed: boolean): string {
	let isFolder = false;
	let entries: string[] | undefined;
	try {
		isFolder = statSync(path).isDirectory();
		if (isFolder) entries = readdirSync(path);
	} catch {
		// Not a listing's job to fail the refusal.
	}
	if (listed && isFolder) {
		const sources = (entries ?? []).filter((file) => file.endsWith(".bal")).sort();
		const files = sources.length > 0 ? ` (${sources.join(", ")})` : "";
		return (
			`The integration ${path} already exists, and nothing is overwritten. ` +
			`If it is the integration you meant to create, read its .bal files once${files} and write the code in that folder. Do not call create_integration for it again. ` +
			`If you want a second, different integration, call create_integration with another name.`
		);
	}
	const what = !isFolder ? "a file" : entries?.length === 0 ? "an empty folder, not one of this project's integrations" : "a folder that is not one of this project's integrations";
	return `${path} already exists: it is ${what}. Nothing was created or overwritten. Call create_integration with another name, or ask the user to remove or rename what is at that path.`;
}

/**
 * Creates the integration, and the project when the working directory is not
 * inside one. Nothing is overwritten: an existing folder of that name, or a
 * working directory that is a single package, stops it before any write.
 */
export function createIntegration(request: CreateRequest): Created {
	const name = packageName(request.name);
	if (!name) throw new CreateError(`"${request.name}" cannot be an integration's name: it needs a letter first, then letters, digits or underscores (for example "order_sync").`);
	const cwd = resolve(request.cwd);
	const library = request.library === true;

	const manifestDir = manifestDirAbove(cwd);
	const project = manifestDir ? findProject(cwd) : undefined;
	let projectRoot: string;
	let rootManifest: string | undefined;
	if (project?.kind === "workspace") {
		projectRoot = project.root;
		rootManifest = readFileSync(join(projectRoot, MANIFEST), "utf8");
	} else if (manifestDir && readFileSync(join(manifestDir, MANIFEST), "utf8").trim() === "") {
		// An empty root manifest: a project folder that was never filled in.
		projectRoot = manifestDir;
	} else if (manifestDir) {
		throw new CreateError(
			`${manifestDir} is a single Ballerina package, not a BI project, so an integration cannot be added beside it here. ` +
				`A BI project is a folder whose Ballerina.toml holds [workspace] and lists each integration's folder. ` +
				`Ask the user whether to start a new project in another folder, or to move this package into a project folder; then run this from the project's folder.`,
		);
	} else {
		if (cwd === resolve(homedir()) || cwd === parse(cwd).root) throw new CreateError(`${cwd} cannot become a project folder. Ask the user to make a folder for the project and start the session there.`);
		projectRoot = cwd;
	}

	const integrationDir = join(projectRoot, name);
	if (existsSync(integrationDir)) throw new CreateError(existingPathMessage(integrationDir, project?.kind === "workspace" && project.packages.some((pkg) => resolve(pkg.dir) === integrationDir)));
	if (project?.packages.some((pkg) => pkg.name === name)) throw new CreateError(`The project already has an integration named "${name}". Choose another name.`);

	let nextRootManifest: string;
	if (rootManifest !== undefined) {
		const added = withPackage(rootManifest, name);
		if (added === undefined) throw new CreateError(`${join(projectRoot, MANIFEST)} has no [workspace] section to list the integration in. Fix that file first.`);
		nextRootManifest = added;
	} else nextRootManifest = workspaceManifest(request.projectTitle?.trim() || basename(projectRoot), name);

	const org = orgName(request.org ?? "") ?? project?.packages.find((pkg) => pkg.org)?.org ?? orgName(request.username) ?? "myOrg";
	const title = request.title?.trim() || request.name.trim();

	const files: string[] = [];
	const write = (path: string, text: string) => {
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, text);
		files.push(path);
	};

	write(join(integrationDir, MANIFEST), packageManifest({ org, name, title, distribution: request.distribution }));
	if (library) write(join(integrationDir, "lib.bal"), `import ${LIBRARY_VALIDATOR} as _;`);
	for (const file of SOURCE_FILES) write(join(integrationDir, file), EMPTY);
	if (!library) for (const file of APP_ONLY_FILES) write(join(integrationDir, file), EMPTY);
	write(join(integrationDir, ".vscode", "settings.json"), SETTINGS_JSON);
	write(join(integrationDir, ".vscode", "launch.json"), LAUNCH_JSON);
	write(join(integrationDir, ".gitignore"), GITIGNORE);

	// The root last: a failure above leaves the project's manifest as it was.
	write(join(projectRoot, MANIFEST), nextRootManifest);
	const projectCreated = rootManifest === undefined;
	const rootSettings = join(projectRoot, ".vscode", "settings.json");
	if (!existsSync(rootSettings)) write(rootSettings, SETTINGS_JSON);

	return { projectRoot, projectCreated, integrationDir, org, name, library, files };
}

/** What the model reads back. */
export function formatCreated(created: Created): string {
	const sources = balFiles(created.integrationDir);
	const lines = [
		created.projectCreated
			? `Created the BI project at ${created.projectRoot} and its first integration "${created.name}" (org ${created.org}) in ${created.integrationDir}.`
			: `Created the integration "${created.name}" (org ${created.org}) in ${created.integrationDir} and listed it in ${join(created.projectRoot, MANIFEST)}.`,
		"",
		`Source files, each empty: ${sources.join(", ")}. Put every construct in its own file (services and listeners in main.bal, the main function of an automation in automation.bal, clients in connections.bal, configurables in config.bal, types in types.bal, agents in agents.bal, helpers in functions.bal, data mappers in data_mappings.bal).`,
		"Read a file once before the first edit or write to it. Do not add other top-level .bal files for these constructs, and do not run `bal new` here.",
	];
	if (created.library) lines.push(`This is a library integration: keep lib.bal as it is, and run \`bal pull ${LIBRARY_VALIDATOR}\` once so the import resolves.`);
	lines.push(`Build from the project folder with \`bal build\`; run an integration from its own folder (\`cd ${created.name} && bal run\`).`);
	return lines.join("\n");
}
