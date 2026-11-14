/**
 * The diagram view's server over real HTTP on 127.0.0.1: the bundle and the
 * model endpoints behind the token, the language server's answer passed
 * through unchanged, a failure as a readable 502, and the event stream
 * that tells pages about changes and about the end of the session.
 */
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ModelRequest } from "../extensions/ballerina/visualize/routes.ts";
import { readBundle, startViewerServer, type ViewerServer, type ViewProject } from "../extensions/ballerina/visualize/server.ts";

let dir: string;
let bundle: string;
let pkgDir: string;
let server: ViewerServer | undefined;
let project: ViewProject;

beforeEach(() => {
	dir = realpathSync(mkdtempSync(join(tmpdir(), "view-server-")));
	bundle = join(dir, "bundle");
	mkdirSync(join(bundle, "assets"), { recursive: true });
	writeFileSync(join(bundle, "index.html"), "<!doctype html><title>view</title>");
	writeFileSync(join(bundle, "main.js"), "console.log(1)");
	writeFileSync(join(bundle, "assets", "f.woff2"), "font");
	pkgDir = join(dir, "orders");
	mkdirSync(pkgDir);
	writeFileSync(join(pkgDir, "main.bal"), "");
	writeFileSync(join(dir, "secret.txt"), "do not serve");
	project = { name: "shop", packages: [{ name: "orders", dir: pkgDir }] };
});
afterEach(async () => {
	await server?.close();
	server = undefined;
	rmSync(dir, { recursive: true, force: true });
});

async function start(request: (r: ModelRequest) => Promise<unknown> = async () => ({ designModel: { services: [] } })) {
	const spy = vi.fn(request);
	server = await startViewerServer({ bundleDir: bundle, project: () => project, productName: "Product", request: spy });
	return spy;
}

describe("the viewer server", () => {
	it("listens on the loopback address with a long random token in the path", async () => {
		await start();
		const url = new URL(server!.url);
		expect(url.hostname).toBe("127.0.0.1");
		expect(url.pathname).toMatch(/^\/[A-Za-z0-9_-]{32}\/$/);
		expect(Number(url.port)).toBe(server!.port);
	});

	it("serves the page with the security headers, and refuses a request without the token", async () => {
		await start();
		const page = await fetch(server!.url);
		expect(page.status).toBe(200);
		expect(page.headers.get("content-type")).toBe("text/html; charset=utf-8");
		expect(page.headers.get("referrer-policy")).toBe("no-referrer");
		expect(page.headers.get("content-security-policy")).toContain("script-src 'self'");
		expect(await page.text()).toContain("<title>view</title>");
		expect((await fetch(`${server!.url}assets/f.woff2`)).headers.get("content-type")).toBe("font/woff2");
		const origin = new URL(server!.url).origin;
		for (const path of ["/", "/index.html", "/api/project", "/secret.txt"]) expect((await fetch(`${origin}${path}`)).status).toBe(404);
		expect((await fetch(`${server!.url}../secret.txt`)).status).toBe(404);
	});

	it("passes the language server's answer through unchanged, failures inside a result included", async () => {
		const answer = { errorMsg: "Project is not loaded" };
		const request = await start(async () => answer);
		const response = await fetch(`${server!.url}api/design?package=orders`);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual(answer);
		expect(request).toHaveBeenCalledWith(expect.objectContaining({ method: "designModelService/getDesignModel", params: { projectPath: pkgDir } }));
		const flow = await fetch(`${server!.url}api/flow?package=orders&file=main.bal&startLine=0&startOffset=0&endLine=2&endOffset=1`);
		expect(flow.status).toBe(200);
		expect(request).toHaveBeenLastCalledWith(expect.objectContaining({ method: "flowDesignService/getFlowModel", params: expect.objectContaining({ filePath: join(pkgDir, "main.bal") }) }));
	});

	it("reports a server that cannot answer as a 502 with its reason", async () => {
		await start(async () => {
			throw new Error("No language server can answer.");
		});
		const response = await fetch(`${server!.url}api/artifacts`);
		expect(response.status).toBe(502);
		expect(await response.json()).toEqual({ error: "No language server can answer." });
	});

	it("describes the project for the page, as it stands at each request", async () => {
		await start();
		expect(await (await fetch(`${server!.url}api/project`)).json()).toEqual({ product: "Product", name: "shop", packages: ["orders"], initialPackage: "orders" });
		expect((await fetch(`${server!.url}api/design?package=billing`)).status).toBe(404);
		project = { ...project, packages: [...project.packages, { name: "billing", dir: dir }] };
		expect(((await (await fetch(`${server!.url}api/project`)).json()) as { packages: string[] }).packages).toEqual(["orders", "billing"]);
		expect((await fetch(`${server!.url}api/design?package=billing`)).status).toBe(200);
	});

	it("streams changes to open pages, then tells them the session ended", async () => {
		await start();
		const events: string[] = [];
		const ended = new Promise<void>((resolve) => {
			httpRequest(`${server!.url}events`, (res) => {
				expect(res.headers["content-type"]).toBe("text/event-stream; charset=utf-8");
				res.setEncoding("utf8");
				res.on("data", (chunk: string) => {
					events.push(chunk);
					if (chunk.includes(": connected")) server!.notifyChanged(["main.bal"], false);
					if (chunk.includes("event: changed")) void server!.close();
				});
				res.on("end", resolve);
			}).end();
		});
		await ended;
		const text = events.join("");
		expect(text).toContain('event: changed\ndata: {"files":["main.bal"],"project":false}\n\n');
		expect(text).toContain("event: closed\n");
		// Closed means closed: the port no longer answers.
		await expect(fetch(server!.url)).rejects.toThrow();
	});

	it("needs a built page", () => {
		rmSync(join(bundle, "index.html"));
		expect(() => readBundle(bundle)).toThrow(/no index.html/);
	});
});
