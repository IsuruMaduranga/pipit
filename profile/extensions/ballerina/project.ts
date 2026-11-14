/**
 * Find the Ballerina project a session works on and read its files. No pi
 * imports: it takes the working directory and returns plain data, so tests
 * run it on temporary folders.
 *
 * The project is the nearest `Ballerina.toml` at or above the working
 * directory: a BI workspace (`[workspace] packages = [...]`, one package per
 * integration) or a single package. A package inside a workspace counts as
 * that workspace. With no `Ballerina.toml` at or above it, the packages below
 * the working directory are the project (a session started in a folder that
 * holds several). Each package's configurable values live in the
 * `Config.toml` in its own folder: `bal run` reads that one (checked on
 * 2201.14.0, which runs a package, not a workspace).
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { parseToml, TomlError, type TomlDocument } from "./toml.ts";

export const MANIFEST = "Ballerina.toml";
export const CONFIG_FILE = "Config.toml";

/** The walk below a folder stops at this depth and this many folders: a session started in a home folder must not read the whole disk each turn. */
export const WALK_MAX_DEPTH = 4;
export const WALK_MAX_DIRS = 1000;
/** Never descended into: build output, dependencies, version control, and any dot folder. */
const SKIPPED_DIRS = new Set(["target", "node_modules", "build"]);

export interface BalFile {
	/** Absolute path. */
	path: string;
	/** The module it belongs to: the package name for the default module, `<package>.<module>` otherwise. */
	module: string;
}

export interface PackageInfo {
	/** Absolute folder. */
	dir: string;
	/** Undefined when `Ballerina.toml` names none. */
	org?: string;
	name: string;
	/** The module sources, tests left out (they read their own `tests/Config.toml`). */
	sources: BalFile[];
}

export interface Project {
	/** The workspace or package folder; the working directory when neither was found above it. */
	root: string;
	kind: "workspace" | "package" | "folder";
	packages: PackageInfo[];
	/** What kept a part of the project from being read, each with the fix. */
	problems: string[];
}

interface Manifest {
	doc?: TomlDocument;
	problem?: string;
}

function readManifest(dir: string): Manifest {
	const file = join(dir, MANIFEST);
	try {
		return { doc: parseToml(readFileSync(file, "utf8")) };
	} catch (error) {
		const reason = error instanceof TomlError ? error.message : (error as Error).message;
		return { problem: `${file} could not be read (${reason}); fix the file` };
	}
}

/** A string value at `path` of a parsed manifest. */
function stringAt(doc: TomlDocument, path: string[]): string | undefined {
	const entry = doc.entries.find((e) => e.path.length === path.length && e.path.every((part, i) => part === path[i]));
	return entry?.value.kind === "string" ? entry.value.value : undefined;
}

function isWorkspace(doc: TomlDocument): boolean {
	return doc.headers.some((h) => h.path.length === 1 && h.path[0] === "workspace") || doc.entries.some((e) => e.path[0] === "workspace");
}

function workspacePackages(doc: TomlDocument): string[] {
	const entry = doc.entries.find((e) => e.path.length === 2 && e.path[0] === "workspace" && e.path[1] === "packages");
	if (entry?.value.kind !== "array") return [];
	return entry.value.items.flatMap((item) => (item.kind === "string" ? [item.value] : []));
}

/** The `.bal` files of a package by module: the root and `generated/` hold the default module, `modules/<m>/` and `generated/<m>/` module `<package>.<m>`. */
function packageSources(dir: string, name: string): BalFile[] {
	const balIn = (folder: string): string[] => {
		try {
			return readdirSync(folder, { withFileTypes: true })
				.filter((entry) => entry.isFile() && entry.name.endsWith(".bal"))
				.map((entry) => join(folder, entry.name))
				.sort();
		} catch {
			return [];
		}
	};
	const subfolders = (folder: string): string[] => {
		try {
			return readdirSync(folder, { withFileTypes: true })
				.filter((entry) => entry.isDirectory() && entry.name !== "tests" && !entry.name.startsWith("."))
				.map((entry) => entry.name)
				.sort();
		} catch {
			return [];
		}
	};
	const files: BalFile[] = [];
	for (const path of [...balIn(dir), ...balIn(join(dir, "generated"))]) files.push({ path, module: name });
	for (const parent of ["modules", "generated"]) {
		for (const module of subfolders(join(dir, parent))) {
			for (const path of balIn(join(dir, parent, module))) files.push({ path, module: `${name}.${module}` });
		}
	}
	return files;
}

function readPackage(dir: string, problems: string[]): PackageInfo | undefined {
	if (!existsSync(join(dir, MANIFEST))) {
		problems.push(`${dir} has no ${MANIFEST}; fix the folder or the workspace's package list`);
		return undefined;
	}
	const manifest = readManifest(dir);
	if (!manifest.doc) {
		problems.push(manifest.problem as string);
		return undefined;
	}
	const name = stringAt(manifest.doc, ["package", "name"]);
	if (!name) {
		problems.push(`${join(dir, MANIFEST)} names no package ([package] name = "..."); fix the file`);
		return undefined;
	}
	return { dir, org: stringAt(manifest.doc, ["package", "org"]), name, sources: packageSources(dir, name) };
}

/** The workspace whose package list holds `packageDir`, searching the folders above it. */
function enclosingWorkspace(packageDir: string): string | undefined {
	for (let dir = dirname(packageDir); dir !== dirname(dir); dir = dirname(dir)) {
		if (!existsSync(join(dir, MANIFEST))) continue;
		const { doc } = readManifest(dir);
		if (doc && isWorkspace(doc) && workspacePackages(doc).some((p) => resolve(dir, p) === packageDir)) return dir;
		return undefined;
	}
	return undefined;
}

export interface Walk {
	/** Absolute paths of the files with these names, in walk order. */
	files: Map<string, string[]>;
	/** True when the walk stopped at its bound before seeing every folder. */
	truncated: boolean;
}

/** The files named `names` (and every `.bal` file, under the key ".bal") in `root` and the folders below it, within the walk's bounds. */
export function walk(root: string, names: readonly string[]): Walk {
	const files = new Map<string, string[]>([...names, ".bal"].map((name) => [name, []]));
	let visited = 0;
	let truncated = false;
	const queue: Array<[string, number]> = [[root, 0]];
	while (queue.length > 0) {
		const [dir, depth] = queue.shift() as [string, number];
		if (++visited > WALK_MAX_DIRS) {
			truncated = true;
			break;
		}
		let entries;
		try {
			entries = readdirSync(dir, { withFileTypes: true });
		} catch {
			continue;
		}
		for (const entry of entries) {
			if (entry.isDirectory()) {
				if (entry.name.startsWith(".") || SKIPPED_DIRS.has(entry.name)) continue;
				if (depth < WALK_MAX_DEPTH) queue.push([join(dir, entry.name), depth + 1]);
				else truncated = true;
			} else if (entry.isFile()) {
				const key = entry.name.endsWith(".bal") ? ".bal" : entry.name;
				files.get(key)?.push(join(dir, entry.name));
			}
		}
	}
	return { files, truncated };
}

/** The nearest folder at or above `dir` holding a `Ballerina.toml`. */
function manifestAbove(dir: string): string | undefined {
	for (let current = resolve(dir); ; current = dirname(current)) {
		if (existsSync(join(current, MANIFEST))) return current;
		if (dirname(current) === current) return undefined;
	}
}

/** The folder whose files the session's project spans: the workspace or package at or above `cwd`, else `cwd`. */
export function projectRoot(cwd: string): string {
	const found = manifestAbove(cwd);
	return found ? (enclosingWorkspace(found) ?? found) : resolve(cwd);
}

/** Whether a manifest declares a package (`[package]`); an empty one declares nothing. */
const declaresPackage = (doc: TomlDocument) => doc.headers.some((h) => h.path.length === 1 && h.path[0] === "package") || doc.entries.some((e) => e.path[0] === "package");

/** The project the session in `cwd` works on; undefined when there is no `Ballerina.toml` at, above or below it. */
export function findProject(cwd: string): Project | undefined {
	const problems: string[] = [];
	const found = manifestAbove(cwd);
	if (!found) return packagesBelow(resolve(cwd), problems);
	const manifest = readManifest(found);
	if (manifest.doc && isWorkspace(manifest.doc)) {
		const listed = workspacePackages(manifest.doc);
		if (listed.length === 0) problems.push(`${join(found, MANIFEST)} lists no packages ([workspace] packages = ["..."]); add the integration folders to it`);
		const packages = listed.flatMap((p) => readPackage(resolve(found, p), problems) ?? []);
		return { root: found, kind: "workspace", packages, problems };
	}
	const workspace = enclosingWorkspace(found);
	if (workspace) return findProject(workspace);
	// A manifest that declares neither a workspace nor a package (an empty one) marks a folder of packages.
	if (manifest.doc && !declaresPackage(manifest.doc)) return packagesBelow(found, problems);
	const pkg = readPackage(found, problems);
	return { root: found, kind: "package", packages: pkg ? [pkg] : [], problems };
}

/** The packages in `dir` and below it; undefined when there are none. */
function packagesBelow(dir: string, problems: string[]): Project | undefined {
	const { files, truncated } = walk(dir, [MANIFEST]);
	const packages: PackageInfo[] = [];
	for (const folder of (files.get(MANIFEST) ?? []).map(dirname)) {
		const manifest = readManifest(folder);
		if (!manifest.doc) problems.push(manifest.problem as string);
		// A workspace's packages have their own manifests, which the walk finds too.
		else if (declaresPackage(manifest.doc) && !isWorkspace(manifest.doc)) {
			const pkg = readPackage(folder, problems);
			if (pkg) packages.push(pkg);
		}
	}
	if (packages.length === 0 && problems.length === 0) return undefined;
	if (truncated) problems.push(`stopped looking for packages after ${WALK_MAX_DIRS} folders or ${WALK_MAX_DEPTH} levels below ${dir}; some may be missing (start the session inside the project's folder)`);
	return { root: dir, kind: "folder", packages, problems };
}

/** A path for the model: relative to the project root when inside it. */
export function display(root: string, path: string): string {
	const rel = relative(root, path);
	if (rel === "") return ".";
	return !rel.startsWith("..") && !isAbsolute(rel) ? rel.split("\\").join("/") : path;
}
