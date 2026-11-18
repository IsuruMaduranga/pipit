/**
 * The diagram view's local HTTP server (no pi imports): the page bundle, the
 * three model endpoints and a server-sent-events stream, on 127.0.0.1 at a
 * port the system picks, every path behind an unguessable token
 * (routes.ts). The models come from the language server through the
 * `request` the caller passes, and are forwarded as the server answered
 * them: a failure inside a normal result (`errorMsg`) is the page's to show.
 *
 * The bundle is read into memory when the server starts, so a request can
 * never reach another file on disk.
 */

import { randomBytes } from "node:crypto";
import { readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, relative } from "node:path";
import { type ModelRequest, modelRequest, type ModelRoute, route, type ViewPackage } from "./routes.ts";

export interface ViewProject {
	/** Shown as the page's title. */
	name: string;
	packages: ViewPackage[];
	/** The package the page opens first. */
	initialPackage?: string;
}

export interface ViewerOptions {
	/** The built page: index.html, main.js, main.css, assets/. */
	bundleDir: string;
	/** The project as it stands now: read on every request, so a package added on disk shows up. */
	project: () => ViewProject;
	/** The product's name, for the page title. */
	productName: string;
	/** Send a request to the language server; rejects when no server can answer. */
	request: (request: ModelRequest) => Promise<unknown>;
	token?: string;
}

export interface ViewerServer {
	url: string;
	port: number;
	/** Tell every open page that the sources changed, and whether the project's package list did. */
	notifyChanged(files: string[], project: boolean): void;
	/** Tell the pages the session ended, then stop. */
	close(): Promise<void>;
}

const CONTENT_TYPES: Record<string, string> = {
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".woff2": "font/woff2",
	".ttf": "font/ttf",
	".svg": "image/svg+xml",
	".png": "image/png",
	".gif": "image/gif",
};

/**
 * The page needs inline styles (the diagram components inject theirs at run
 * time) and images from Ballerina Central (connector icons); scripts, fonts
 * and requests stay on this server. No referrer, so the token never leaves
 * with an icon request.
 */
const SECURITY_HEADERS = {
	"cache-control": "no-store",
	"x-content-type-options": "nosniff",
	"referrer-policy": "no-referrer",
	"x-frame-options": "DENY",
	"content-security-policy":
		"default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: https:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
};

/** Comment lines keep idle connections from timing out in between changes. */
const HEARTBEAT_MS = 20_000;

/** Every file under `dir`, by its forward-slashed path relative to it. */
export function readBundle(dir: string): Map<string, Buffer> {
	const files = new Map<string, Buffer>();
	const visit = (folder: string) => {
		for (const entry of readdirSync(folder, { withFileTypes: true })) {
			const path = join(folder, entry.name);
			if (entry.isDirectory()) visit(path);
			else if (entry.isFile()) files.set(relative(dir, path).split("\\").join("/"), readFileSync(path));
		}
	};
	visit(dir);
	if (!files.has("index.html")) throw new Error(`The diagram view's page is missing: no index.html in ${dir}. Rebuild it (the visualize-bundle procedure).`);
	return files;
}

const realpathOrUndefined = (path: string) => {
	try {
		return statSync(path) && realpathSync.native(path);
	} catch {
		return undefined;
	}
};

function send(res: ServerResponse, status: number, type: string, body: string | Buffer, head = false): void {
	res.writeHead(status, { ...SECURITY_HEADERS, "content-type": type, "content-length": Buffer.byteLength(body) });
	res.end(head ? undefined : body);
}

const sendJson = (res: ServerResponse, status: number, value: unknown, head = false) => send(res, status, CONTENT_TYPES[".json"], JSON.stringify(value), head);

/** Start the server; resolves once it listens. */
export async function startViewerServer(options: ViewerOptions): Promise<ViewerServer> {
	const bundle = readBundle(options.bundleDir);
	const token = options.token ?? randomBytes(24).toString("base64url");
	const assets = new Set(bundle.keys());
	const streams = new Set<ServerResponse>();
	let port = 0;

	const context = () => ({ token, port, assets, packages: options.project().packages, realpath: realpathOrUndefined });

	const answerModel = async (res: ServerResponse, target: ModelRoute, head: boolean) => {
		try {
			sendJson(res, 200, await options.request(modelRequest(target)), head);
		} catch (error) {
			sendJson(res, 502, { error: (error as Error).message }, head);
		}
	};

	const openStream = (req: IncomingMessage, res: ServerResponse) => {
		res.writeHead(200, { ...SECURITY_HEADERS, "content-type": "text/event-stream; charset=utf-8", connection: "keep-alive" });
		res.write(": connected\n\n");
		streams.add(res);
		req.on("close", () => streams.delete(res));
	};

	const handle = (req: IncomingMessage, res: ServerResponse) => {
		const target = route(req.method, req.url, req.headers.host, context());
		const head = req.method === "HEAD";
		switch (target.kind) {
			case "error":
				return sendJson(res, target.status, { error: target.message }, head);
			case "redirect":
				res.writeHead(308, { ...SECURITY_HEADERS, location: target.location });
				return res.end();
			case "asset": {
				const body = bundle.get(target.name) as Buffer;
				return send(res, 200, CONTENT_TYPES[extname(target.name)] ?? "application/octet-stream", body, head);
			}
			case "project": {
				const project = options.project();
				return sendJson(res, 200, { product: options.productName, name: project.name, packages: project.packages.map((pkg) => pkg.name), initialPackage: project.initialPackage ?? project.packages[0]?.name }, head);
			}
			case "events":
				return openStream(req, res);
			default:
				return void answerModel(res, target, head);
		}
	};

	const server = createServer(handle);
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", () => {
			server.off("error", reject);
			resolve();
		});
	});
	const address = server.address();
	if (!address || typeof address === "string") {
		server.close();
		throw new Error("The diagram view's server did not get a port.");
	}
	port = address.port;
	server.unref();

	const broadcast = (event: string, data: unknown) => {
		for (const res of streams) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
	};
	const heartbeat = setInterval(() => {
		for (const res of streams) res.write(": still here\n\n");
	}, HEARTBEAT_MS);
	heartbeat.unref();

	let closing: Promise<void> | undefined;
	return {
		url: `http://127.0.0.1:${port}/${token}/`,
		port,
		notifyChanged: (files, project) => broadcast("changed", { files, project }),
		close: () => {
			closing ??= new Promise<void>((resolve) => {
				clearInterval(heartbeat);
				broadcast("closed", {});
				for (const res of streams) res.end();
				streams.clear();
				server.close(() => resolve());
				server.closeAllConnections();
			});
			return closing;
		},
	};
}
