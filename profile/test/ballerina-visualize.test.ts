/**
 * What `/visualize` does, with the outside world faked: the jar first, then
 * the launcher check, then a probe of the running server, and only then the
 * page server, the watcher and the browser. A second call reopens the page;
 * a stock server already running leads to a reload offer; the session's end
 * stops everything. Also the committed bundle, and the extension's wiring.
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeCtx, createFakePi } from "../../test/unit/helpers/fake-pi.ts";
import { lspErrorDetail } from "../../extensions/sdk/extension.ts";
import { LspResponseError } from "../../extensions/tools/lsp/failure.ts";
import ballerinaChild from "../extensions/ballerina/child.ts";
import ballerina, { VISUALIZE_COMMAND } from "../extensions/ballerina/index.ts";
import type { LauncherCheck } from "../ballerina/language-server.ts";
import type { ModelRequest } from "../extensions/ballerina/visualize/routes.ts";
import { type CommandUi, initialPackage, type VisualizeEnv, Visualizer, WINDOWS_MESSAGE } from "../extensions/ballerina/visualize/visualize.ts";

let root: string;
let bundle: string;
let visualizer: Visualizer | undefined;

beforeEach(() => {
	root = realpathSync(mkdtempSync(join(tmpdir(), "visualize-")));
	bundle = join(root, "bundle");
	mkdirSync(bundle);
	writeFileSync(join(bundle, "index.html"), "<!doctype html>");
	mkdirSync(join(root, "proj"));
	writeFileSync(join(root, "proj", "Ballerina.toml"), '[package]\norg = "acme"\nname = "orders"\n');
	writeFileSync(join(root, "proj", "main.bal"), "public function main() {}\n");
});
afterEach(async () => {
	await visualizer?.stop();
	visualizer = undefined;
	rmSync(root, { recursive: true, force: true });
});

interface Fakes {
	env: VisualizeEnv;
	ui: CommandUi & { notices: Array<[string, string]>; statuses: Array<string | undefined> };
	requests: ModelRequest[];
}

function fakes(overrides: Partial<VisualizeEnv> = {}, uiOverrides: Partial<CommandUi> = {}): Fakes {
	const requests: ModelRequest[] = [];
	const notices: Array<[string, string]> = [];
	const statuses: Array<string | undefined> = [];
	const env: VisualizeEnv = {
		platform: "darwin",
		cwd: join(root, "proj"),
		productName: "Product",
		bundleDir: bundle,
		ensureJar: vi.fn(async () => ({ downloaded: false })),
		checkLauncher: vi.fn(async (): Promise<LauncherCheck> => ({ kind: "jar", java: "/j/bin/java" })),
		request: vi.fn(async (request: ModelRequest) => {
			requests.push(request);
			return {};
		}),
		errorDetail: lspErrorDetail,
		sync: vi.fn(async () => {}),
		openBrowser: vi.fn(async () => undefined),
		...overrides,
	};
	const ui = {
		notices,
		statuses,
		notify: (text: string, level: string) => notices.push([level, text]),
		setStatus: (text?: string) => statuses.push(text),
		confirm: vi.fn(async () => false),
		reload: vi.fn(async () => {}),
		...uiOverrides,
	};
	return { env, ui, requests };
}

/** A server's refusal as the SDK's client raises it: the stock server answers every refusal with -32603. */
const refusal = (method: string, data?: unknown) => new LspResponseError(method, -32603, "Internal error.", data);

/** The stock server's answer to a method it does not know (findings 02, stock-server.md). */
const unknownMethod = (method: string) => refusal(method, `java.lang.UnsupportedOperationException: The json request '${method}' is unknown.\n\tat org.eclipse.lsp4j…`);

/** Start the view and wait for the start, which runs in the background, to finish. */
const open = async (f: Fakes) => {
	visualizer = new Visualizer(f.env);
	visualizer.open(f.ui);
	await visualizer.settled();
	return visualizer;
};

/** A promise and its resolve and reject, for a step the test holds open. */
function held<T>() {
	let resolve!: (value: T) => void;
	let reject!: (error: Error) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	// A step the test never reaches leaves its promise unused: that rejection is no error.
	promise.catch(() => {});
	return { promise, resolve, reject };
}

/** Wrap every function of an object so it throws once the session is stale, as pi's stale context does. */
function staleAware<T extends object>(target: T, isStale: () => boolean): T {
	return new Proxy(target, {
		get(object, key, receiver) {
			const value = Reflect.get(object, key, receiver);
			if (typeof value !== "function") return value;
			return (...args: unknown[]) => {
				if (isStale()) throw new Error("This extension ctx is stale after session replacement or reload.");
				return value.apply(object, args);
			};
		},
	});
}

describe("/visualize", () => {
	it("checks the jar, the launcher and the running server, then serves the page and opens it", async () => {
		const f = fakes();
		const view = await open(f);
		expect(f.env.ensureJar).toHaveBeenCalledTimes(1);
		expect(f.env.checkLauncher).toHaveBeenCalledTimes(1);
		expect(f.requests.map((r) => r.method)).toEqual(["designModelService/projectInfo"]);
		expect(f.requests[0].routeFile).toBe(join(root, "proj", "Ballerina.toml"));
		expect(view.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/[\w-]+\/$/);
		expect(f.env.openBrowser).toHaveBeenCalledWith(view.url);
		expect(f.ui.notices).toEqual([["info", `Integration view: ${view.url}`]]);
		expect((await fetch(`${view.url}api/project`)).status).toBe(200);
	});

	it("returns at once and finishes the start in the background, answering a second call meanwhile", async () => {
		const jar = held<{ downloaded: boolean }>();
		const f = fakes({ ensureJar: vi.fn(() => jar.promise) });
		visualizer = new Visualizer(f.env);
		expect(visualizer.open(f.ui)).toBeUndefined();
		expect(visualizer.url).toBeUndefined();
		visualizer.open(f.ui);
		expect(f.ui.notices).toEqual([["info", "The integration view is still starting."]]);
		jar.resolve({ downloaded: false });
		await visualizer.settled();
		expect(visualizer.url).toMatch(/^http:\/\/127\.0\.0\.1:/);
		expect(f.ui.notices.at(-1)).toEqual(["info", `Integration view: ${visualizer.url}`]);
	});

	it("opens the same page again on a second call, without a second server", async () => {
		const f = fakes();
		const view = await open(f);
		const url = view.url;
		view.open(f.ui);
		await view.settled();
		expect(view.url).toBe(url);
		expect(f.env.ensureJar).toHaveBeenCalledTimes(1);
		expect(f.env.openBrowser).toHaveBeenCalledTimes(2);
		expect(f.ui.notices.at(-1)).toEqual(["info", `Integration view: ${url}`]);
	});

	it("prints the address when no browser can open", async () => {
		const f = fakes({ openBrowser: vi.fn(async () => ({ reason: "ssh" as const })) });
		const view = await open(f);
		expect(f.ui.notices).toEqual([["warning", `Integration view: ${view.url} (open it in a browser; none was started because this is an SSH session)`]]);
	});

	it("names the opener that failed to start", async () => {
		const f = fakes({ openBrowser: vi.fn(async () => ({ reason: "launchFailed" as const, command: "xdg-open", osMessage: "spawn xdg-open ENOENT" })) });
		const view = await open(f);
		expect(f.ui.notices).toEqual([["warning", `Integration view: ${view.url} (open it in a browser; none was started because the system's browser opener (xdg-open) did not start: spawn xdg-open ENOENT)`]]);
	});

	it("announces a first download and shows its progress", async () => {
		const f = fakes({
			ensureJar: vi.fn(async (progress) => {
				progress.onDownloadStart(73_406_195);
				progress.onProgress(10_000_000, 73_406_195);
				progress.onProgress(10_100_000, 73_406_195);
				progress.onProgress(73_406_195, 73_406_195);
				return { downloaded: true };
			}),
		});
		await open(f);
		expect(f.ui.notices[0]).toEqual(["info", "Downloading the BI designer's language server (73 MB, once per machine). The view opens when it is done; you can keep working meanwhile."]);
		expect(f.ui.notices[1]).toEqual(["info", "Downloaded the BI language server (once per machine)."]);
		expect(f.ui.statuses).toEqual(["Downloading the BI language server: 10 of 73 MB", "Downloading the BI language server: 73 of 73 MB", undefined]);
	});

	it("stops at a failed download with its message, starting nothing", async () => {
		const f = fakes({ ensureJar: vi.fn(async () => Promise.reject(new Error("Could not reach github.com."))) });
		const view = await open(f);
		expect(f.ui.notices).toEqual([["error", "Could not reach github.com."]]);
		expect(f.env.checkLauncher).not.toHaveBeenCalled();
		expect(view.url).toBeUndefined();
	});

	it("stops when the launcher would not start the jar, naming the fix", async () => {
		const f = fakes({ checkLauncher: vi.fn(async (): Promise<LauncherCheck> => ({ kind: "stock", reason: "distribution", detail: "ballerina-2201.13.2" })) });
		const view = await open(f);
		expect(f.ui.notices[0][0]).toBe("error");
		expect(f.ui.notices[0][1]).toContain("bal dist use 2201.14.0");
		expect(f.requests).toEqual([]);
		expect(view.url).toBeUndefined();
	});

	it("offers a reload when a stock server already runs, and reloads on yes", async () => {
		const reload = vi.fn(async () => {});
		const confirm = vi.fn(async () => true);
		const f = fakes(
			{
				request: vi.fn(async (request: ModelRequest) => {
					throw unknownMethod(request.method);
				}),
			},
			{ confirm, reload },
		);
		const view = await open(f);
		expect(f.env.request).toHaveBeenCalledTimes(1);
		expect(confirm).toHaveBeenCalledWith("Restart the language server?", expect.stringContaining("Reloading the session restarts it"));
		expect(reload).toHaveBeenCalledTimes(1);
		expect(view.url).toBeUndefined();
	});

	it("tells the user how to restart when they decline the reload", async () => {
		const f = fakes({
			request: vi.fn(async (request: ModelRequest) => {
				throw unknownMethod(request.method);
			}),
		});
		await open(f);
		expect(f.ui.notices).toEqual([["warning", expect.stringContaining("Run /reload, or start a new session, then run /visualize again.")]]);
	});

	it("reports the jar's own refusal instead of offering a restart that would not help", async () => {
		const confirm = vi.fn(async () => true);
		const f = fakes({ request: vi.fn(async (request: ModelRequest) => Promise.reject(refusal(request.method, "java.lang.NullPointerException"))) }, { confirm });
		await open(f);
		expect(confirm).not.toHaveBeenCalled();
		expect(f.ui.notices).toEqual([["error", "The Ballerina language server cannot answer: Internal error."]]);
	});

	it("reports a server that cannot answer at all, or too slowly", async () => {
		const down = fakes({ request: vi.fn(async () => Promise.reject(new Error("The ballerina language server is not running: bal not found."))) });
		await open(down);
		expect(down.ui.notices).toEqual([["error", "The Ballerina language server cannot answer: The ballerina language server is not running: bal not found."]]);
		await visualizer?.stop();
		const slow = fakes({ request: vi.fn(async () => Promise.reject(new Error("designModelService/projectInfo timed out after 180000ms"))) });
		await open(slow);
		expect(slow.ui.notices[0][1]).toMatch(/^The Ballerina language server did not answer: /);
	});

	it("says why on Windows and outside a project", async () => {
		const windows = fakes({ platform: "win32" });
		await open(windows);
		expect(windows.ui.notices).toEqual([["error", WINDOWS_MESSAGE]]);
		expect(windows.env.ensureJar).not.toHaveBeenCalled();
		const nowhere = fakes({ cwd: join(root, "bundle") });
		await open(nowhere);
		expect(nowhere.ui.notices[0][1]).toMatch(/^No Ballerina project here/);
	});

	it("tells the server and the pages about an edit, then stops with the session", async () => {
		const f = fakes();
		const view = await open(f);
		const url = view.url as string;
		const events: string[] = [];
		const stream = await fetch(`${url}events`);
		const reader = stream.body!.getReader();
		const read = (async () => {
			for (;;) {
				const { value, done } = await reader.read();
				if (done) return;
				events.push(new TextDecoder().decode(value));
			}
		})();
		// macOS may still deliver the files' creation, from just before the watch began: let it pass.
		await new Promise((resolve) => setTimeout(resolve, 700));
		const sync = vi.mocked(f.env.sync);
		sync.mockClear();
		events.length = 0;
		const main = join(root, "proj", "main.bal");
		writeFileSync(main, "public function main() { int x = 1; }\n");
		await waitFor(() => events.join("").includes("event: changed"));
		expect(sync.mock.calls.some(([changes]) => changes.some((change) => change.path === main && change.type === "changed"))).toBe(true);
		expect(events.join("")).toMatch(/"files":\[[^\]]*"main\.bal"/);
		await view.stop();
		await read;
		expect(events.join("")).toContain("event: closed");
		expect(view.url).toBeUndefined();
		await expect(fetch(url)).rejects.toThrow();
	});
});

describe("a session that ends during the start", () => {
	// pi invalidates the old context when the session is replaced or reloaded: every ui, exec and events call then throws.
	for (const step of ["download", "launcher check", "probe"] as const) {
		it(`ends quietly when the session goes stale during the ${step}`, async () => {
			let stale = false;
			const gate = held<never>();
			const blocked = () => gate.promise;
			const f = fakes({
				ensureJar: step === "download" ? vi.fn((_progress: unknown, signal: AbortSignal) => new Promise<{ downloaded: boolean }>((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("The language server download was stopped."))))) : vi.fn(async () => ({ downloaded: false })),
				checkLauncher: step === "launcher check" ? vi.fn(blocked) : vi.fn(async (): Promise<LauncherCheck> => ({ kind: "jar", java: "/j" })),
				request: step === "probe" ? vi.fn(blocked) : vi.fn(async () => ({})),
			});
			const env = staleAware(f.env, () => stale);
			const ui = staleAware(f.ui, () => stale);
			visualizer = new Visualizer(env);
			visualizer.open(ui);
			await new Promise((resolve) => setTimeout(resolve, 20));
			stale = true;
			await visualizer.stop();
			gate.reject(new Error("No session is running, so no language server can answer."));
			await expect(visualizer.settled()).resolves.toBeUndefined();
			expect(visualizer.url).toBeUndefined();
		});
	}
});

describe("a project that changes while the view runs", () => {
	it("follows a new integration in the workspace and tells the page to fetch the project again", async () => {
		const ws = join(root, "ws");
		mkdirSync(join(ws, "orders"), { recursive: true });
		writeFileSync(join(ws, "Ballerina.toml"), '[workspace]\npackages = ["orders"]\n');
		writeFileSync(join(ws, "orders", "Ballerina.toml"), '[package]\norg = "acme"\nname = "orders"\n');
		writeFileSync(join(ws, "orders", "main.bal"), "");
		const f = fakes({ cwd: ws });
		const view = await open(f);
		const url = view.url as string;
		expect(((await (await fetch(`${url}api/project`)).json()) as { packages: string[] }).packages).toEqual(["orders"]);
		const events: string[] = [];
		const stream = await fetch(`${url}events`);
		const reader = stream.body!.getReader();
		void (async () => {
			for (;;) {
				const { value, done } = await reader.read();
				if (done) return;
				events.push(new TextDecoder().decode(value));
			}
		})();
		await new Promise((resolve) => setTimeout(resolve, 700));
		events.length = 0;
		mkdirSync(join(ws, "billing"));
		writeFileSync(join(ws, "billing", "Ballerina.toml"), '[package]\norg = "acme"\nname = "billing"\n');
		writeFileSync(join(ws, "billing", "main.bal"), "");
		writeFileSync(join(ws, "Ballerina.toml"), '[workspace]\npackages = ["orders", "billing"]\n');
		await waitFor(() => events.join("").includes('"project":true'));
		expect(((await (await fetch(`${url}api/project`)).json()) as { packages: string[] }).packages).toEqual(["orders", "billing"]);
		expect((await fetch(`${url}api/design?package=billing`)).status).toBe(200);
	});
});

describe("the helpers", () => {
	const packages = [
		{ name: "orders", dir: "/w/orders" },
		{ name: "billing", dir: "/w/billing" },
	];
	it("opens the package the session is in, else the first", () => {
		expect(initialPackage(packages, "/w/billing/modules/x")?.name).toBe("billing");
		expect(initialPackage(packages, "/w")?.name).toBe("orders");
	});
});

describe("the committed page bundle", () => {
	const dir = fileURLToPath(new URL("../extensions/ballerina/visualize/bundle/", import.meta.url));
	const files = (folder: string): string[] => readdirSync(folder, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? files(join(folder, entry.name)).map((f) => `${entry.name}/${f}`) : [entry.name]));

	it("holds the page, its script and styles, and the commit it was built from", () => {
		for (const name of ["index.html", "main.js", "main.css", "build.json"]) expect(existsSync(join(dir, name))).toBe(true);
		const record = JSON.parse(readFileSync(join(dir, "build.json"), "utf8"));
		expect(record.checkout.commit).toMatch(/^[0-9a-f]{40}$/);
		const html = readFileSync(join(dir, "index.html"), "utf8");
		expect(html).toContain('href="main.css"');
		expect(html).toContain('src="main.js"');
		expect(html).toContain('name="referrer" content="no-referrer"');
	});

	it("ships woff2 fonts, the codicons font that has no woff2, and no Gilmer", () => {
		const all = files(dir);
		const fonts = all.filter((name) => /\.(woff2?|ttf|eot|otf)$/.test(name));
		expect(fonts.filter((name) => !name.endsWith(".woff2"))).toEqual(fonts.filter((name) => /^assets\/codicon-/.test(name)));
		expect(all.some((name) => /gilmer/i.test(name))).toBe(false);
		expect(readFileSync(join(dir, "main.css"), "utf8")).not.toMatch(/Gilmer-[A-Za-z]+\.(woff2?|ttf|eot)/);
	});
});

describe("the extension's wiring", () => {
	it("registers /visualize in the main session only", () => {
		const main = createFakePi();
		ballerina(main.pi as never);
		expect(main.commands.get(VISUALIZE_COMMAND)?.description).toEqual(expect.any(String));
		const child = createFakePi();
		ballerinaChild(child.pi as never);
		expect(child.commands.has(VISUALIZE_COMMAND)).toBe(false);
	});

	it("refuses without an interface, on stderr, which print and JSON modes show, and starts nothing", async () => {
		const main = createFakePi();
		ballerina(main.pi as never);
		const notify = vi.fn();
		const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
		try {
			const ctx = createFakeCtx({ cwd: join(root, "proj"), hasUI: false, ui: { notify, setStatus: vi.fn() } });
			await main.commands.get(VISUALIZE_COMMAND)?.handler("", ctx);
			expect(stderr).toHaveBeenCalledWith(expect.stringContaining("/visualize needs the interactive terminal"));
			expect(notify).not.toHaveBeenCalled();
			expect(main.pi.exec).not.toHaveBeenCalled();
		} finally {
			stderr.mockRestore();
		}
	});

	it("returns at once in a terminal and reports through its notices", async () => {
		const main = createFakePi();
		ballerina(main.pi as never);
		const notes: string[] = [];
		// A folder with no Ballerina project anywhere at, above or below it: the command must stop before any download.
		const ctx = createFakeCtx({ cwd: bundle, hasUI: true, ui: { notify: (text: string) => notes.push(text), setStatus: () => {}, confirm: async () => false } });
		await main.commands.get(VISUALIZE_COMMAND)?.handler("", ctx);
		await waitFor(() => notes.length > 0);
		expect(notes[0]).toMatch(process.platform === "win32" ? /macOS and Linux only/ : /^No Ballerina project here/);
		await main.fire("session_shutdown", { type: "session_shutdown", reason: "quit" }, ctx);
	});
});

async function waitFor(condition: () => boolean, timeoutMs = 5000): Promise<void> {
	const started = Date.now();
	while (!condition()) {
		if (Date.now() - started > timeoutMs) throw new Error("timed out");
		await new Promise((resolve) => setTimeout(resolve, 25));
	}
}
