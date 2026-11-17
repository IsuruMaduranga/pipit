/**
 * What `/visualize` does, with every outside effect passed in (no pi
 * imports): make sure the BI designer's language server can run (download
 * its jar once, check the launcher would start it, check the running server
 * is that one), then start the local page server and the project watcher,
 * and open the browser. A second call while the view runs only opens the
 * page again. `stop` ends both with the session.
 *
 * `open` returns at once and the start runs in the background: pi holds the
 * user's input while a command handler runs, and the first start downloads
 * 73 MB. Once `stop` has run (the session ended, or `/new`, `/resume`,
 * `/fork` or `/reload` replaced it), nothing here calls the session again:
 * pi has invalidated it, and every call would throw.
 *
 * index.ts wires it to pi: the command, the SDK's `lspRequest`,
 * `lspErrorDetail`, `lspFilesChanged` and `openInBrowser`, the launcher check
 * through `pi.exec`, and the terminal's notices.
 */

import { basename, isAbsolute, relative } from "node:path";
import { isMethodNotFound, type LspErrorDetail, type LspFileChange, type NoBrowser } from "../../../../extensions/sdk/extension.ts";
import { type LauncherCheck, launcherProblem } from "../../../ballerina/language-server.ts";
import { findProject, MANIFEST, type Project } from "../project.ts";
import { type ModelRequest, projectInfoRequest, type ViewPackage } from "./routes.ts";
import { startViewerServer, type ViewerServer, type ViewProject } from "./server.ts";
import { type ProjectWatcher, watchProject } from "./watcher.ts";

export interface VisualizeEnv {
	platform: NodeJS.Platform;
	cwd: string;
	productName: string;
	/** The built page. */
	bundleDir: string;
	/** Make sure the jar is in place; the callbacks report a download. */
	ensureJar(progress: JarProgress, signal: AbortSignal): Promise<{ downloaded: boolean }>;
	/** What the launcher would start now. */
	checkLauncher(): Promise<LauncherCheck>;
	/** A request on the language server; rejects when no server can answer. */
	request(request: ModelRequest): Promise<unknown>;
	/** The server's code, message and data when `error` is its refusal of a request (the SDK's `lspErrorDetail`). */
	errorDetail(error: unknown): LspErrorDetail | undefined;
	/** Tell the language server about changed files; resolves once it has them (the SDK's `lspFilesChanged`). */
	sync(changes: LspFileChange[]): Promise<void>;
	/** Resolves with why no browser opened, or undefined (the SDK's `openInBrowser`). */
	openBrowser(url: string): Promise<NoBrowser | undefined>;
}

export interface JarProgress {
	onDownloadStart(total: number): void;
	onProgress(received: number, total: number): void;
}

/** The command's way to talk to the user, in the terminal interface (the command refuses to run without one). */
export interface CommandUi {
	notify(text: string, level: "info" | "warning" | "error"): void;
	setStatus(text: string | undefined): void;
	confirm(title: string, body: string): Promise<boolean>;
	reload(): Promise<void>;
}

export const WINDOWS_MESSAGE =
	"The diagram view needs the BI designer's language server, which this product starts on macOS and Linux only for now. On Windows the session uses the stock Ballerina language server, which gives diagnostics but not the models the diagrams need.";

const NO_PROJECT_MESSAGE = "No Ballerina project here: start the session in an integration's folder or its project (a folder with a Ballerina.toml), then run /visualize.";

const TIMED_OUT = /\btimed out\b/i;

/** Why no browser opened, as the address notice ends. */
function noBrowserReason(failed: NoBrowser): string {
	switch (failed.reason) {
		case "ssh":
			return "this is an SSH session";
		case "noDisplay":
			return "there is no desktop display";
		case "launchFailed":
			return `the system's browser opener (${failed.command}) did not start: ${failed.osMessage}`;
	}
}

/** The package the page opens first: the one the working directory is in, else the first. */
export function initialPackage(packages: readonly ViewPackage[], cwd: string): ViewPackage | undefined {
	return packages.find((pkg) => {
		const rel = relative(pkg.dir, cwd);
		return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
	}) ?? packages[0];
}

const projectName = (project: Project) => (project.kind === "package" && project.packages[0] ? project.packages[0].name : basename(project.root));

/** The project as the page server shows it. */
function viewProject(project: Project, cwd: string): ViewProject {
	const packages = project.packages.map((pkg) => ({ name: pkg.name, dir: pkg.dir }));
	return { name: projectName(project), packages, initialPackage: initialPackage(packages, cwd)?.name };
}

const megabytes = (bytes: number) => Math.round(bytes / 1_000_000);

interface Running {
	server: ViewerServer;
	watcher: ProjectWatcher;
}

export class Visualizer {
	private running: Running | undefined;
	private task: Promise<void> | undefined;
	private starting = false;
	private stopped = false;
	private readonly abort = new AbortController();
	/** The project the page shows; read again when a manifest changes. */
	private project: ViewProject | undefined;

	constructor(private readonly env: VisualizeEnv) {}

	/** The page's address while the view runs. */
	get url(): string | undefined {
		return this.running?.server.url;
	}

	/** Start the view, or open the running one again; returns at once. */
	open(ui: CommandUi): void {
		const safe = this.guard(ui);
		if (this.stopped) return;
		if (this.starting) return safe.notify("The integration view is still starting.", "info");
		const work = this.running ? this.show(this.running.server.url, safe) : this.start(safe);
		this.starting = !this.running;
		this.task = work
			.catch((error) => safe.notify(`The integration view failed: ${(error as Error).message}`, "error"))
			.finally(() => {
				this.starting = false;
			});
	}

	/** Resolves when the last `open` has finished. */
	settled(): Promise<void> {
		return this.task ?? Promise.resolve();
	}

	async stop(): Promise<void> {
		this.stopped = true;
		this.abort.abort();
		const running = this.running;
		this.running = undefined;
		if (!running) return;
		running.watcher.close();
		await running.server.close();
	}

	/** The user interface, silent once the session has stopped. */
	private guard(ui: CommandUi): CommandUi {
		return {
			notify: (text, level) => {
				if (!this.stopped) ui.notify(text, level);
			},
			setStatus: (text) => {
				if (!this.stopped) ui.setStatus(text);
			},
			confirm: async (title, body) => !this.stopped && (await ui.confirm(title, body)),
			reload: async () => {
				if (!this.stopped) await ui.reload();
			},
		};
	}

	private async start(ui: CommandUi): Promise<void> {
		const { env } = this;
		if (env.platform === "win32") return ui.notify(WINDOWS_MESSAGE, "error");
		const found = findProject(env.cwd);
		if (!found || found.packages.length === 0) return ui.notify(found?.problems[0] ? `${NO_PROJECT_MESSAGE} (${found.problems[0]})` : NO_PROJECT_MESSAGE, "error");
		this.project = viewProject(found, env.cwd);
		const first = this.project.packages.find((pkg) => pkg.name === this.project?.initialPackage) as ViewPackage;

		if (!(await this.prepareServer(ui, first)) || this.stopped) return;

		let server: ViewerServer;
		try {
			server = await startViewerServer({ bundleDir: env.bundleDir, project: () => this.project as ViewProject, productName: env.productName, request: env.request });
		} catch (error) {
			return ui.notify(`The integration view could not start: ${(error as Error).message}`, "error");
		}
		if (this.stopped) return void (await server.close());
		let watcher: ProjectWatcher;
		try {
			watcher = watchProject({
				root: found.root,
				onChanges: (changes) => void this.onChanges(server, found.root, changes),
				onError: (error) => ui.notify(`The integration view stopped following file changes: ${error.message}. Run /visualize in a new session to follow them again.`, "warning"),
			});
		} catch (error) {
			await server.close();
			return ui.notify(`The integration view could not watch ${found.root}: ${(error as Error).message}`, "error");
		}
		this.running = { server, watcher };
		await this.show(server.url, ui);
	}

	/** Get the jar in place and the right server running; false when the view cannot run, after telling the user why. */
	private async prepareServer(ui: CommandUi, pkg: ViewPackage): Promise<boolean> {
		const { env } = this;
		try {
			let shown = -1;
			const progress: JarProgress = {
				onDownloadStart: (total) => ui.notify(`Downloading the BI designer's language server (${megabytes(total)} MB, once per machine). The view opens when it is done; you can keep working meanwhile.`, "info"),
				onProgress: (received, total) => {
					const percent = Math.floor((received / total) * 20) * 5;
					if (percent === shown) return;
					shown = percent;
					ui.setStatus(`Downloading the BI language server: ${megabytes(received)} of ${megabytes(total)} MB`);
				},
			};
			const { downloaded } = await env.ensureJar(progress, this.abort.signal);
			if (downloaded) ui.notify("Downloaded the BI language server (once per machine).", "info");
		} catch (error) {
			ui.notify((error as Error).message, "error");
			return false;
		} finally {
			ui.setStatus(undefined);
		}
		if (this.stopped) return false;

		let check: LauncherCheck;
		try {
			check = await env.checkLauncher();
		} catch (error) {
			ui.notify(`The language server launcher could not run: ${(error as Error).message}`, "error");
			return false;
		}
		if (this.stopped) return false;
		const problem = launcherProblem(check);
		if (problem) {
			ui.notify(problem, "error");
			return false;
		}

		try {
			await env.request(projectInfoRequest(pkg));
			return !this.stopped;
		} catch (error) {
			if (this.stopped) return false;
			const message = (error as Error).message;
			const detail = env.errorDetail(error);
			if (detail && isMethodNotFound(detail)) return this.offerRestart(ui, message);
			const verb = TIMED_OUT.test(message) ? "did not answer" : "cannot answer";
			ui.notify(`The Ballerina language server ${verb}: ${message}`, "error");
			return false;
		}
	}

	/** The running server does not know the BI designer's requests: it is the stock server, started before the jar was in place. */
	private async offerRestart(ui: CommandUi, probeError: string): Promise<boolean> {
		const why = "The Ballerina language server running in this session started before the BI designer's server was installed, so it cannot draw the diagrams.";
		const yes = await ui.confirm("Restart the language server?", `${why} Reloading the session restarts it and keeps the conversation. Run /visualize again once the reload finishes.`);
		if (this.stopped) return false;
		if (yes) {
			ui.notify("Reloading the session to restart the language server. Run /visualize again when it is back.", "info");
			await ui.reload();
			return false;
		}
		ui.notify(`${why} Run /reload, or start a new session, then run /visualize again. (${probeError})`, "warning");
		return false;
	}

	private async onChanges(server: ViewerServer, root: string, changes: LspFileChange[]): Promise<void> {
		if (this.stopped) return;
		// A failed report must not stop the page from refreshing: it rejects only for an undeclared server.
		await this.env.sync(changes).catch(() => {});
		if (this.stopped) return;
		// A manifest in the batch can add or remove a package: the page's list follows the disk.
		const manifests = changes.some((change) => basename(change.path) === MANIFEST);
		if (manifests) {
			const found = findProject(this.env.cwd);
			if (found && found.packages.length > 0) this.project = viewProject(found, this.env.cwd);
		}
		server.notifyChanged(changes.map((change) => relative(root, change.path).split("\\").join("/")), manifests);
	}

	private async show(url: string, ui: CommandUi): Promise<void> {
		if (this.stopped) return;
		const failed = await this.env.openBrowser(url);
		if (failed) ui.notify(`Integration view: ${url} (open it in a browser; none was started because ${noBrowserReason(failed)})`, "warning");
		else ui.notify(`Integration view: ${url}`, "info");
	}
}
