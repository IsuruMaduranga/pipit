/**
 * The diagram view's HTTP surface: every path needs the token, only bundle
 * files are served, and a flow request names a .bal file inside the
 * integration with a valid range. Plus the language-server request behind
 * each model route, and the sync message for changed files.
 */
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { allowedHost, MODEL_TIMEOUT_MS, modelRequest, projectInfoRequest, type Route, type RouteContext, route, sameToken } from "../extensions/ballerina/visualize/routes.ts";

const root = realpathSync(mkdtempSync(join(tmpdir(), "view-routes-")));
afterAll(() => rmSync(root, { recursive: true, force: true }));
const pkgDir = join(root, "orders");
mkdirSync(join(pkgDir, "modules", "util"), { recursive: true });
writeFileSync(join(pkgDir, "main.bal"), "");
writeFileSync(join(pkgDir, "modules", "util", "util.bal"), "");
writeFileSync(join(root, "outside.bal"), "");
symlinkSync(join(root, "outside.bal"), join(pkgDir, "link.bal"));

const TOKEN = "t0ken-abcdefghijklmnopqrstuvwxyz012345";
const PORT = 4321;
const HOST = `127.0.0.1:${PORT}`;
const context: RouteContext = {
	token: TOKEN,
	port: PORT,
	assets: new Set(["index.html", "main.js", "main.css", "assets/font-1.woff2"]),
	packages: [{ name: "orders", dir: pkgDir }],
	realpath: (path) => {
		try {
			return realpathSync.native(path);
		} catch {
			return undefined;
		}
	},
};
const get = (path: string, ctx: RouteContext = context, host = HOST) => route("GET", path, host, ctx);
const errorOf = (r: Route) => (r.kind === "error" ? [r.status, r.message] : r.kind);
const flow = (query: string) => get(`/${TOKEN}/api/flow?${query}`);
const range = "startLine=3&startOffset=0&endLine=9&endOffset=1";

describe("route", () => {
	it("serves the page and its files under the token", () => {
		expect(get(`/${TOKEN}/`)).toEqual({ kind: "asset", name: "index.html" });
		expect(get(`/${TOKEN}/index.html`)).toEqual({ kind: "asset", name: "index.html" });
		expect(get(`/${TOKEN}/main.js`)).toEqual({ kind: "asset", name: "main.js" });
		expect(get(`/${TOKEN}/assets/font-1.woff2?v=2`)).toEqual({ kind: "asset", name: "assets/font-1.woff2" });
		expect(get(`/${TOKEN}`)).toEqual({ kind: "redirect", location: `/${TOKEN}/` });
		expect(get(`/${TOKEN}/events`)).toEqual({ kind: "events" });
		expect(get(`/${TOKEN}/api/project`)).toEqual({ kind: "project" });
	});

	it("answers nothing without the exact token", () => {
		for (const path of ["/", "/index.html", "/api/project", `/${TOKEN.slice(0, -1)}/api/project`, `/${TOKEN}x/api/project`, `/x/${TOKEN}/api/project`]) {
			expect(errorOf(get(path))).toEqual([404, "Not found."]);
		}
	});

	it("serves no file outside the bundle", () => {
		for (const path of ["../../etc/passwd", "%2e%2e/%2e%2e/etc/passwd", "page/main.tsx", "build-bundle.mjs", "assets/../main.js.map", "api/other"]) {
			expect(errorOf(get(`/${TOKEN}/${path}`))[0]).toBe(404);
		}
	});

	it("refuses another host, another method, and a malformed address", () => {
		expect(errorOf(get(`/${TOKEN}/`, context, "evil.example"))[0]).toBe(403);
		expect(errorOf(route("GET", `/${TOKEN}/`, undefined, context))[0]).toBe(403);
		expect(allowedHost(`localhost:${PORT}`, PORT)).toBe(true);
		expect(allowedHost(`127.0.0.1:${PORT + 1}`, PORT)).toBe(false);
		expect(errorOf(route("POST", `/${TOKEN}/api/project`, HOST, context))[0]).toBe(405);
		expect(route("HEAD", `/${TOKEN}/`, HOST, context)).toEqual({ kind: "asset", name: "index.html" });
		expect(errorOf(get("//[", context))[0]).toBe(400);
	});

	it("picks the package by name, or the only one", () => {
		expect(get(`/${TOKEN}/api/design`)).toEqual({ kind: "design", pkg: context.packages[0] });
		expect(get(`/${TOKEN}/api/artifacts?package=orders`)).toEqual({ kind: "artifacts", pkg: context.packages[0] });
		expect(errorOf(get(`/${TOKEN}/api/design?package=billing`))).toEqual([404, 'The project has no integration named "billing".']);
		const two = { ...context, packages: [...context.packages, { name: "billing", dir: root }] };
		expect(errorOf(get(`/${TOKEN}/api/design`, two))[0]).toBe(400);
	});

	it("takes a flow from a .bal file inside the integration, by relative or absolute path", () => {
		expect(flow(`file=main.bal&${range}`)).toEqual({ kind: "flow", pkg: context.packages[0], file: join(pkgDir, "main.bal"), start: { line: 3, offset: 0 }, end: { line: 9, offset: 1 } });
		expect(flow(`file=${encodeURIComponent(join(pkgDir, "modules/util/util.bal"))}&${range}`)).toMatchObject({ kind: "flow", file: join(pkgDir, "modules", "util", "util.bal") });
	});

	it("refuses a flow outside the integration, through a link, or from another kind of file", () => {
		expect(errorOf(flow(`file=../outside.bal&${range}`))[0]).toBe(403);
		expect(errorOf(flow(`file=${encodeURIComponent(join(root, "outside.bal"))}&${range}`))[0]).toBe(403);
		expect(errorOf(flow(`file=link.bal&${range}`))[0]).toBe(403);
		expect(errorOf(flow(`file=missing.bal&${range}`))[0]).toBe(404);
		expect(errorOf(flow(`file=Ballerina.toml&${range}`))).toEqual([400, "A flow comes from a .bal file."]);
		expect(errorOf(flow(range))[0]).toBe(400);
	});

	it("refuses a range that is not whole numbers, or ends before it starts", () => {
		for (const bad of ["startLine=-1&startOffset=0&endLine=1&endOffset=0", "startLine=1.5&startOffset=0&endLine=2&endOffset=0", "startLine=1&startOffset=0&endLine=2", "startLine=99999999999&startOffset=0&endLine=1&endOffset=0"]) {
			expect(errorOf(flow(`file=main.bal&${bad}`))[0]).toBe(400);
		}
		expect(errorOf(flow("file=main.bal&startLine=9&startOffset=0&endLine=3&endOffset=0"))).toEqual([400, "The range ends before it starts."]);
		expect(flow("file=main.bal&startLine=3&startOffset=4&endLine=3&endOffset=4")).toMatchObject({ kind: "flow" });
	});

	it("compares tokens of any length safely", () => {
		expect(sameToken(TOKEN, TOKEN)).toBe(true);
		expect(sameToken("", TOKEN)).toBe(false);
		expect(sameToken(`${TOKEN.slice(0, -1)}X`, TOKEN)).toBe(false);
	});
});

describe("the language-server requests", () => {
	const pkg = context.packages[0];
	it("asks the package's server for each model with a timeout for a cold server", () => {
		expect(modelRequest({ kind: "design", pkg })).toEqual({ routeFile: join(pkgDir, "Ballerina.toml"), method: "designModelService/getDesignModel", params: { projectPath: pkgDir }, timeoutMs: MODEL_TIMEOUT_MS });
		expect(modelRequest({ kind: "artifacts", pkg })).toMatchObject({ method: "designModelService/artifacts", params: { projectPath: pkgDir } });
		expect(modelRequest({ kind: "flow", pkg, file: "/p/main.bal", start: { line: 1, offset: 0 }, end: { line: 4, offset: 1 } })).toMatchObject({
			method: "flowDesignService/getFlowModel",
			params: { filePath: "/p/main.bal", startLine: { line: 1, offset: 0 }, endLine: { line: 4, offset: 1 }, forceAssign: true },
		});
		expect(projectInfoRequest(pkg)).toMatchObject({ method: "designModelService/projectInfo", params: { projectPath: pkgDir } });
		expect(MODEL_TIMEOUT_MS).toBeGreaterThanOrEqual(60_000);
	});
});
