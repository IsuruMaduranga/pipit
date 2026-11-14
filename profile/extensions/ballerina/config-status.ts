/**
 * What `config_status` reports, and which `Config.toml` values are secret.
 * No pi imports: it reads the project's files and returns plain data and text.
 *
 * The report never carries a value from `Config.toml`. For each configurable
 * variable it says where it is declared, its type, whether it is required,
 * whether `Config.toml` sets it, and the line to add, with a placeholder
 * where the value goes, so the model can ask the user to set it in their own
 * editor.
 *
 * How `Config.toml` maps to a variable (checked against `bal run` on
 * 2201.14.0): a variable of the root package's default module is a top-level
 * key, or a key under `[<org>.<package>]` or `[<package>]`; a variable of
 * module `<package>.<m>` sits under `[<org>.<package>.<m>]` or
 * `[<package>.<m>]`; dotted keys are the same paths. Giving one variable a
 * value in two of those places, or giving a value no variable declares,
 * stops the program ("unused configuration value"), so both are reported.
 */

import { readFileSync } from "node:fs";
import { basename, dirname, join, sep } from "node:path";
import { type ConfigurableDeclaration, scanBal } from "./bal-source.ts";
import { CONFIG_FILE, display, findProject, type PackageInfo, type Project, projectRoot, walk } from "./project.ts";
import { looseStrings, parseToml, stringsIn, TomlError, type TomlDocument } from "./toml.ts";

export type SetState = "set" | "not set" | "set twice" | "unknown";

export interface VariableStatus extends ConfigurableDeclaration {
	/** The declaring file, relative to the project root. */
	file: string;
	state: SetState;
}

export interface ModuleStatus {
	module: string;
	/** The section header its lines go under. */
	section: string[];
	/** Whether `Config.toml` already has that header (then the lines go under it, never under a second one). */
	sectionExists: boolean;
	variables: VariableStatus[];
}

export interface PackageStatus {
	name: string;
	org?: string;
	/** The package folder, relative to the project root ("." for the root itself). */
	folder: string;
	/** Its `Config.toml`, relative to the project root. */
	configFile: string;
	configExists: boolean;
	/** Why `Config.toml` could not be read; every state is then "unknown". */
	configProblem?: string;
	modules: ModuleStatus[];
	/** Keys under this package's own sections that no declared variable takes: `bal run` stops on them. */
	unusedKeys: string[];
	/** Sections for other packages (a dependency's variables), which this package's sources cannot check. */
	otherSections: string[];
}

export interface ConfigReport {
	root: string;
	kind: Project["kind"];
	packages: PackageStatus[];
	/** What kept part of the project from being read, each with its fix. */
	problems: string[];
}

const startsWith = (path: readonly string[], prefix: readonly string[]) => prefix.length <= path.length && prefix.every((part, i) => part === path[i]);
const samePath = (a: readonly string[], b: readonly string[]) => a.length === b.length && startsWith(a, b);

/** A key or header part as TOML writes it: bare when it can be, quoted otherwise. */
const tomlKey = (part: string) => (/^[A-Za-z0-9_-]+$/.test(part) ? part : JSON.stringify(part));
const sectionText = (path: readonly string[]) => `[${path.map(tomlKey).join(".")}]`;

/** The header paths a variable of `module` can take its value under; the empty path is the top level. */
function modulePrefixes(pkg: PackageInfo, module: string): string[][] {
	const parts = module.split(".");
	const withOrg = pkg.org ? [[pkg.org, ...parts]] : [];
	return module === pkg.name ? [[], ...withOrg, parts] : [...withOrg, parts];
}

/** The section a new line for `module` goes under: `[<org>.<module>]`, or `[<module>]` when the package names no org. */
const canonicalSection = (pkg: PackageInfo, module: string) => (pkg.org ? [pkg.org, ...module.split(".")] : module.split("."));

/** The placeholder for a value of `type`, shaped so the user sees what to write. */
export function placeholder(type: string): string {
	const base = type.replace(/\?$/, "").trim();
	const array = /^(.*)\[\d*\]$/.exec(base);
	if (array) return `[${placeholder(array[1])}]`;
	if (base === "string" || base.startsWith("string:")) return '"<string>"';
	if (base === "int" || base === "byte" || base.startsWith("int:")) return "<integer>";
	if (base === "float" || base === "decimal") return "<number>";
	if (base === "boolean") return "<true or false>";
	return `<${base}>`;
}

function readConfig(path: string): { doc?: TomlDocument; exists: boolean; problem?: string } {
	let text: string;
	try {
		text = readFileSync(path, "utf8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return { exists: false };
		return { exists: true, problem: `it could not be read (${(error as Error).message})` };
	}
	try {
		return { doc: parseToml(text), exists: true };
	} catch (error) {
		if (error instanceof TomlError) return { exists: true, problem: `it is not valid TOML, ${error.message}` };
		throw error;
	}
}

function packageStatus(root: string, pkg: PackageInfo, problems: string[]): PackageStatus {
	// The default module first, then the others in folder order.
	const declared = new Map<string, VariableStatus[]>([[pkg.name, []]]);
	for (const file of pkg.sources) {
		let text: string;
		try {
			text = readFileSync(file.path, "utf8");
		} catch (error) {
			problems.push(`${file.path} could not be read (${(error as Error).message})`);
			continue;
		}
		const list = declared.get(file.module) ?? [];
		for (const declaration of scanBal(text).configurables) list.push({ ...declaration, file: display(root, file.path), state: "unknown" });
		declared.set(file.module, list);
	}

	const configPath = join(pkg.dir, CONFIG_FILE);
	const config = readConfig(configPath);
	const headers = config.doc?.headers ?? [];
	const paths = [...(config.doc?.entries.map((entry) => entry.path) ?? []), ...headers.map((header) => header.path)];

	const modules: ModuleStatus[] = [];
	const places: string[][] = [];
	for (const [module, variables] of declared) {
		if (variables.length === 0) continue;
		const prefixes = modulePrefixes(pkg, module);
		for (const variable of variables) {
			const own = prefixes.map((prefix) => [...prefix, variable.name]);
			places.push(...own);
			if (!config.exists) variable.state = "not set";
			else if (config.doc) {
				const hits = own.filter((place) => paths.some((path) => startsWith(path, place))).length;
				variable.state = hits === 0 ? "not set" : hits === 1 ? "set" : "set twice";
			}
		}
		const existing = prefixes.find((prefix) => prefix.length > 0 && headers.some((header) => !header.arrayTable && samePath(header.path, prefix)));
		modules.push({ module, section: existing ?? canonicalSection(pkg, module), sectionExists: Boolean(existing), variables });
	}

	// A key is this package's when it is top-level or under one of its own sections.
	const ownPrefixes = modulePrefixes(pkg, pkg.name).filter((prefix) => prefix.length > 0);
	const isOwn = (path: string[]) => path.length === 1 || ownPrefixes.some((prefix) => startsWith(path, prefix));
	const unusedKeys: string[] = [];
	const otherSections = new Set<string>();
	for (const entry of config.doc?.entries ?? []) {
		if (places.some((place) => startsWith(entry.path, place))) continue;
		if (isOwn(entry.path)) unusedKeys.push(entry.path.map(tomlKey).join("."));
		else otherSections.add(sectionText(entry.headerLength > 0 ? entry.path.slice(0, entry.headerLength) : entry.path.slice(0, -1)));
	}

	return {
		name: pkg.name,
		org: pkg.org,
		folder: display(root, pkg.dir),
		configFile: display(root, configPath),
		configExists: config.exists,
		configProblem: config.problem,
		modules,
		unusedKeys,
		otherSections: [...otherSections],
	};
}

/** The report for the project the session in `cwd` works on; undefined when there is none. */
export function configReport(cwd: string): ConfigReport | undefined {
	const project = findProject(cwd);
	if (!project) return undefined;
	const problems = [...project.problems];
	const packages = project.packages.map((pkg) => packageStatus(project.root, pkg, problems));
	return { root: project.root, kind: project.kind, packages, problems };
}

export interface ReportCounts {
	integrations: number;
	variables: number;
	/** Required variables with no value: the program does not start. */
	missing: number;
	/** Problems that make part of the answer unknown. */
	problems: number;
}

export function reportCounts(report: ConfigReport): ReportCounts {
	const variables = report.packages.flatMap((pkg) => pkg.modules.flatMap((module) => module.variables));
	return {
		integrations: report.packages.length,
		variables: variables.length,
		missing: variables.filter((v) => v.required && v.state === "not set").length,
		problems: report.problems.length + report.packages.filter((pkg) => pkg.configProblem).length,
	};
}

const STATE_TEXT: Record<SetState, string> = {
	set: "set",
	"not set": "NOT SET",
	"set twice": "SET TWICE (bal run stops: remove one of the two)",
	unknown: "unknown (Config.toml unreadable)",
};

function variableLine(v: VariableStatus): string {
	const need = v.required ? "required" : v.defaultValue && v.defaultValue.length <= 80 ? `default ${v.defaultValue}` : "has a default";
	const state = !v.required && v.state === "not set" ? "not set, uses the default" : STATE_TEXT[v.state];
	return `- ${v.name}: ${v.type}, ${need}, ${state} (${v.file}:${v.line})\n    ${tomlKey(v.name)} = ${placeholder(v.type)}`;
}

/** Where a module's lines go, as one instruction. */
function placement(pkg: PackageStatus, module: ModuleStatus): string {
	const section = sectionText(module.section);
	if (module.sectionExists) return `under the existing ${section} section of ${pkg.configFile} (do not add a second ${section} header)`;
	return `in ${pkg.configFile} under a new ${section} section${pkg.configExists ? "" : " (the file does not exist yet)"}`;
}

/** The text the model reads. Never holds a value from `Config.toml`. */
export function formatReport(report: ConfigReport): string {
	const counts = reportCounts(report);
	const out: string[] = [
		`Configurable variables of the ${report.kind === "workspace" ? "workspace" : report.kind === "package" ? "package" : "packages"} at ${report.root}. Values are never shown: the user sets them in each integration's Config.toml in their own editor, and you ask for the edit, never for the value.`,
	];
	if (report.problems.length > 0) out.push("", "Problems (the answer below is incomplete until they are fixed):", ...report.problems.map((p) => `- ${p}`));
	if (report.packages.length === 0) out.push("", "No package was found, so there is nothing to report.");

	for (const pkg of report.packages) {
		const id = pkg.org ? `${pkg.org}/${pkg.name}` : pkg.name;
		out.push("", `## Integration ${pkg.name} (package ${id}, folder ${pkg.folder})`);
		if (pkg.configProblem) out.push(`${pkg.configFile}: ${pkg.configProblem}. Ask the user to fix the file; until then nothing here says which values are set.`);
		else out.push(`${pkg.configFile}: ${pkg.configExists ? "exists" : "does not exist yet"}.`);
		if (pkg.modules.length === 0) out.push("Declares no configurable variables.");

		const missing: Array<{ module: ModuleStatus; variables: VariableStatus[] }> = [];
		for (const module of pkg.modules) {
			out.push("", `Module ${module.module}, lines go ${placement(pkg, module)}:`);
			out.push(...module.variables.map(variableLine));
			const unset = module.variables.filter((v) => v.required && v.state === "not set");
			if (unset.length > 0) missing.push({ module, variables: unset });
		}

		if (missing.length > 0) {
			const count = missing.reduce((n, m) => n + m.variables.length, 0);
			out.push("", `${count} required ${count === 1 ? "value is" : "values are"} not set, so the integration does not start. To set them, the user adds this to ${pkg.configFile}, replacing each <...> placeholder with the value:`, "```toml");
			missing.forEach(({ module, variables }, i) => {
				if (i > 0) out.push("");
				out.push(module.sectionExists ? `# under the existing ${sectionText(module.section)} section` : sectionText(module.section));
				for (const v of variables) out.push(`${tomlKey(v.name)} = ${placeholder(v.type)}`);
			});
			out.push("```");
		}
		if (pkg.unusedKeys.length > 0) {
			out.push("", `${pkg.configFile} sets keys no variable here declares, and bal run stops on them ("unused configuration value"): ${pkg.unusedKeys.join(", ")}. A variable was renamed or removed: ask the user to rename or delete the key.`);
		}
		if (pkg.otherSections.length > 0) out.push("", `${pkg.configFile} also has sections for other packages (a dependency's variables, not checked here): ${pkg.otherSections.join(", ")}.`);
	}
	if (counts.variables > 0 && counts.missing === 0 && counts.problems === 0) out.push("", "Every required value is set.");
	return out.join("\n");
}

/** A URL naming only a scheme, a host and a port: an endpoint, not a credential. A path, a query or user info keeps it secret (a webhook URL is a credential). */
const BARE_ENDPOINT = /^(https?|wss?):\/\/([A-Za-z0-9.-]+|\[[0-9A-Fa-f:.]+\])(:\d{1,5})?\/?$/;

export interface ConfigSecret {
	value: string;
	/** The key it sits under, for the placeholder (`[secret:githubToken]`). */
	name: string;
}

/**
 * The values to redact from what the model sees: every string value of every
 * `Config.toml` in `files` (any section, inside arrays and inline tables,
 * multi-line strings too), except
 *
 * - one shorter than `minLength` (the base drops it anyway: replacing `dev`
 *   everywhere would damage ordinary output);
 * - a bare endpoint URL (`https://api.example.com:8443`);
 * - one that is also a whole string literal in the project's `.bal` sources
 *   (`sourceStrings`): the model reads it there anyway, and redacting it would
 *   turn that source line into a placeholder the edit tools refuse to write.
 *
 * Numbers, booleans, dates and keys are never registered: `5432` or `true`
 * would be replaced in every tool result. A file that is not valid TOML
 * still has its quoted strings, and any unquoted text value, registered.
 */
export function configSecrets(files: ReadonlyArray<{ text: string }>, sourceStrings: ReadonlySet<string>, minLength: number): ConfigSecret[] {
	const found = new Map<string, string>();
	for (const { text } of files) {
		let strings: Array<{ key: string; value: string }>;
		try {
			strings = parseToml(text).entries.flatMap((entry) => stringsIn(entry.value, entry.path.slice(entry.headerLength).join(".")));
		} catch {
			strings = looseStrings(text);
		}
		for (const { key, value } of strings) {
			if (value.length < minLength || BARE_ENDPOINT.test(value) || sourceStrings.has(value) || found.has(value)) continue;
			found.set(value, key);
		}
	}
	return [...found].map(([value, name]) => ({ value, name }));
}

/**
 * The secret values of the project the session in `cwd` works on, with the
 * source to register them under (one per project root, so the next call
 * replaces them and a value the user removed stops being replaced).
 */
export function projectSecrets(cwd: string, minLength: number): { source: string; secrets: ConfigSecret[] } {
	const root = projectRoot(cwd);
	const { files } = walk(root, [CONFIG_FILE]);
	const read = (path: string): string | undefined => {
		try {
			return readFileSync(path, "utf8");
		} catch {
			return undefined;
		}
	};
	const configPaths = files.get(CONFIG_FILE) ?? [];
	const configs = configPaths.flatMap((path) => {
		const text = read(path);
		return text === undefined ? [] : [{ text }];
	});
	// The literals of the packages that hold a Config.toml (a tests/Config.toml belongs to the folder above).
	const packages = configPaths.map((path) => (basename(dirname(path)) === "tests" ? dirname(dirname(path)) : dirname(path)));
	const sourceStrings = new Set<string>();
	for (const path of files.get(".bal") ?? []) {
		if (!packages.some((dir) => path.startsWith(dir + sep))) continue;
		for (const literal of scanBal(read(path) ?? "").strings) sourceStrings.add(literal);
	}
	return { source: `ballerina-config:${root}`, secrets: configSecrets(configs, sourceStrings, minLength) };
}
