/**
 * The diagram view's HTTP surface, as pure functions: which request the
 * server answers and how (`route`), and the language-server request behind
 * each model endpoint (`modelRequest`). No pi imports and no I/O; the caller
 * passes a `realpath` for the one check that must see the disk.
 *
 * Every path starts with the session's token (`/<token>/...`), so the page,
 * its assets and its API calls all carry it through relative URLs, and a
 * request without it gets nothing. The page is a fixed list of bundle files;
 * nothing else on disk is served.
 *
 * The language-server requests and their parameters:
 * working-docs/findings/02-language-server/diagram-models.md.
 */

import { isAbsolute, relative, resolve } from "node:path";
import type { LspErrorDetail } from "../../../../extensions/sdk/extension.ts";

export interface Position {
	line: number;
	offset: number;
}

export interface ViewPackage {
	name: string;
	/** Absolute folder. */
	dir: string;
}

export type Route =
	| { kind: "asset"; name: string }
	| { kind: "redirect"; location: string }
	| { kind: "project" }
	| { kind: "design"; pkg: ViewPackage }
	| { kind: "artifacts"; pkg: ViewPackage }
	| { kind: "flow"; pkg: ViewPackage; file: string; start: Position; end: Position }
	| { kind: "events" }
	| { kind: "error"; status: number; message: string };

export interface RouteContext {
	token: string;
	port: number;
	/** Bundle files by their path under the token, `index.html` among them. */
	assets: ReadonlySet<string>;
	packages: readonly ViewPackage[];
	/** The real path of a file, or undefined when it does not exist. */
	realpath: (path: string) => string | undefined;
}

/** Lines past this are no Ballerina file anyone writes; it bounds what reaches the server. */
const MAX_LINE = 10_000_000;

const fail = (status: number, message: string): Route => ({ kind: "error", status, message });

/** Compare without leaking the token's length or content through timing. */
export function sameToken(given: string, token: string): boolean {
	if (given.length !== token.length) return false;
	let difference = 0;
	for (let i = 0; i < token.length; i++) difference |= given.charCodeAt(i) ^ token.charCodeAt(i);
	return difference === 0;
}

/** The hosts a page served from this port can name: the loopback address and `localhost`. */
export function allowedHost(host: string | undefined, port: number): boolean {
	return host === `127.0.0.1:${port}` || host === `localhost:${port}`;
}

function pickPackage(query: URLSearchParams, packages: readonly ViewPackage[]): ViewPackage | Route {
	const name = query.get("package");
	if (name === null) return packages.length === 1 ? packages[0] : fail(400, "Name the integration with ?package=<name>.");
	return packages.find((pkg) => pkg.name === name) ?? fail(404, `The project has no integration named "${name}".`);
}

function integer(query: URLSearchParams, name: string): number | undefined {
	const value = query.get(name);
	if (value === null || !/^\d{1,8}$/.test(value)) return undefined;
	const number = Number(value);
	return number <= MAX_LINE ? number : undefined;
}

/** Whether `child` is `parent` or under it, both real paths. */
function inside(child: string, parent: string): boolean {
	const rel = relative(parent, child);
	return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

function flowRoute(query: URLSearchParams, context: RouteContext): Route {
	const pkg = pickPackage(query, context.packages);
	if ("kind" in pkg) return pkg;
	const file = query.get("file");
	if (!file) return fail(400, "Name the source file with ?file=<path>.");
	if (!file.endsWith(".bal")) return fail(400, "A flow comes from a .bal file.");
	const [startLine, startOffset, endLine, endOffset] = ["startLine", "startOffset", "endLine", "endOffset"].map((name) => integer(query, name));
	if (startLine === undefined || startOffset === undefined || endLine === undefined || endOffset === undefined) {
		return fail(400, "startLine, startOffset, endLine and endOffset must be whole numbers.");
	}
	if (endLine < startLine || (endLine === startLine && endOffset < startOffset)) return fail(400, "The range ends before it starts.");
	const real = context.realpath(resolve(pkg.dir, file));
	const realPackage = context.realpath(pkg.dir);
	if (!real || !realPackage) return fail(404, `${file} does not exist.`);
	if (!inside(real, realPackage)) return fail(403, `${file} is not inside the integration "${pkg.name}".`);
	return { kind: "flow", pkg, file: real, start: { line: startLine, offset: startOffset }, end: { line: endLine, offset: endOffset } };
}

/** How to answer a request. */
export function route(method: string | undefined, rawUrl: string | undefined, host: string | undefined, context: RouteContext): Route {
	if (!allowedHost(host, context.port)) return fail(403, "Open the view through the address the command printed.");
	if (method !== "GET" && method !== "HEAD") return fail(405, "Only GET is served.");
	let url: URL;
	try {
		url = new URL(rawUrl ?? "/", "http://127.0.0.1");
	} catch {
		return fail(400, "Malformed address.");
	}
	const [, token = "", ...rest] = url.pathname.split("/");
	if (!sameToken(token, context.token)) return fail(404, "Not found.");
	if (rest.length === 0) return { kind: "redirect", location: `/${context.token}/` };
	const path = rest.join("/");
	if (path === "" || path === "index.html") return { kind: "asset", name: "index.html" };
	if (path === "events") return { kind: "events" };
	if (path === "api/project") return { kind: "project" };
	if (path === "api/design" || path === "api/artifacts") {
		const pkg = pickPackage(url.searchParams, context.packages);
		if ("kind" in pkg) return pkg;
		return path === "api/design" ? { kind: "design", pkg } : { kind: "artifacts", pkg };
	}
	if (path === "api/flow") return flowRoute(url.searchParams, context);
	if (context.assets.has(path)) return { kind: "asset", name: path };
	return fail(404, "Not found.");
}

export interface ModelRequest {
	/** A file of the package: it picks the language-server instance. */
	routeFile: string;
	method: string;
	params: unknown;
	timeoutMs: number;
}

/**
 * The first request on a cold server waits for the JVM, the project load
 * and, on a new machine, the dependency download.
 */
export const MODEL_TIMEOUT_MS = 180_000;

/** The language-server request behind a model route. */
export function modelRequest(target: Extract<Route, { kind: "design" | "artifacts" | "flow" }>): ModelRequest {
	const routeFile = resolve(target.pkg.dir, "Ballerina.toml");
	switch (target.kind) {
		case "design":
			return { routeFile, method: "designModelService/getDesignModel", params: { projectPath: target.pkg.dir }, timeoutMs: MODEL_TIMEOUT_MS };
		case "artifacts":
			return { routeFile, method: "designModelService/artifacts", params: { projectPath: target.pkg.dir }, timeoutMs: MODEL_TIMEOUT_MS };
		case "flow":
			return {
				routeFile,
				method: "flowDesignService/getFlowModel",
				params: { filePath: target.file, startLine: target.start, endLine: target.end, forceAssign: true },
				timeoutMs: MODEL_TIMEOUT_MS,
			};
	}
}

/** The jar answers this one and the stock server does not: it tells the two apart. */
export function projectInfoRequest(pkg: ViewPackage): ModelRequest {
	return { routeFile: resolve(pkg.dir, "Ballerina.toml"), method: "designModelService/projectInfo", params: { projectPath: pkg.dir }, timeoutMs: MODEL_TIMEOUT_MS };
}

/**
 * Whether a server's refusal says it does not know the method: what the stock
 * server answers to `projectInfoRequest`. It answers a plain "Internal
 * error." (JSON-RPC -32603) like any other failure; only the error's data
 * names the unknown request (working-docs/findings/02-language-server/stock-server.md,
 * "An unknown method").
 */
export function isUnknownMethod(detail: LspErrorDetail | undefined): boolean {
	if (!detail || detail.data === undefined) return false;
	const data = typeof detail.data === "string" ? detail.data : JSON.stringify(detail.data);
	return /UnsupportedOperationException: The json request '[^']*' is unknown/.test(data);
}
