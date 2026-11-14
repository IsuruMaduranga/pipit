/**
 * Watch a Ballerina project's sources for the diagram view (no pi imports):
 * every `.bal` file and every `Ballerina.toml` under the project root, within
 * the project walk's bounds and outside the folders it skips (`walk` and
 * `isSkippedDir` in project.ts). Events are gathered for a short quiet
 * period; then the root is walked again and the batch is the difference
 * against the files seen before, plus the files the events name. The walk is
 * what catches a folder moved or renamed into the project: the event names
 * only the folder. Editors save in bursts (a temporary file, a rename, a
 * second write), so a batch is what the page refetches on, never one event.
 *
 * A batch is the SDK's change list (`LspFileChange[]`), so it goes to the
 * language server as it is.
 */

import { existsSync, type FSWatcher, watch as fsWatch } from "node:fs";
import { join, sep } from "node:path";
import type { LspFileChange } from "../../../../extensions/sdk/extension.ts";
import { isSkippedDir, MANIFEST, WALK_MAX_DEPTH, walk } from "../project.ts";

/** Wait this long after the last event before reporting a batch. */
export const DEBOUNCE_MS = 250;

const partsOf = (relative: string) => relative.split(/[\\/]/).filter(Boolean);

/** Whether an event on this path (relative to the root) is worth a rescan: it is not inside a skipped folder. */
export function isFollowedPath(relative: string): boolean {
	const parts = partsOf(relative);
	return parts.length > 0 && parts.slice(0, -1).every((dir) => !isSkippedDir(dir)) && !isSkippedDir(parts.at(-1) as string);
}

/** Whether a path relative to the root is a file the view depends on, within the walk's depth. */
export function isWatchedPath(relative: string): boolean {
	const parts = partsOf(relative);
	const name = parts.at(-1);
	if (!name || !(name.endsWith(".bal") || name === MANIFEST)) return false;
	const dirs = parts.slice(0, -1);
	return dirs.length <= WALK_MAX_DEPTH && dirs.every((dir) => !isSkippedDir(dir));
}

/**
 * One batch: the files a rescan found or lost against `known`, plus the
 * watched files the events name. A missing file an event names counts as
 * deleted even when it was never listed (past the walk's folder cap); a
 * listed file the scan did not reach but the disk still has stays listed.
 * Returns the changes and the files known after them.
 */
export function diffBatch(events: Iterable<string>, known: ReadonlySet<string>, scanned: ReadonlySet<string>, exists: (path: string) => boolean): { changes: LspFileChange[]; known: Set<string> } {
	const created: string[] = [];
	const changed: string[] = [];
	const deleted: string[] = [];
	const next = new Set(scanned);
	for (const path of scanned) if (!known.has(path)) created.push(path);
	for (const path of known) {
		if (scanned.has(path)) continue;
		if (exists(path)) next.add(path);
		else deleted.push(path);
	}
	for (const path of new Set(events)) {
		if (created.includes(path) || deleted.includes(path)) continue;
		if (exists(path)) {
			if (known.has(path)) changed.push(path);
			else if (!scanned.has(path)) {
				created.push(path);
				next.add(path);
			}
		} else if (!known.has(path)) deleted.push(path);
	}
	const changes: LspFileChange[] = [
		...created.map((path) => ({ path, type: "created" as const })),
		...changed.map((path) => ({ path, type: "changed" as const })),
		...deleted.map((path) => ({ path, type: "deleted" as const })),
	];
	return { changes, known: next };
}

/** The `.bal` files and manifests under `root`, within the walk's bounds. */
function scan(root: string): Set<string> {
	const files = walk(root, [MANIFEST]).files;
	return new Set([...(files.get(".bal") ?? []), ...(files.get(MANIFEST) ?? [])]);
}

export interface WatchOptions {
	root: string;
	onChanges: (changes: LspFileChange[]) => void;
	/** Called once if the watch fails; the watcher is closed by then. */
	onError?: (error: Error) => void;
	debounceMs?: number;
	watch?: typeof fsWatch;
}

export interface ProjectWatcher {
	close(): void;
}

/** Start watching `root`. Node watches folders recursively on macOS, Windows and Linux (Node 20 and later). */
export function watchProject({ root, onChanges, onError, debounceMs = DEBOUNCE_MS, watch = fsWatch }: WatchOptions): ProjectWatcher {
	let known = scan(root);
	const pending = new Set<string>();
	let timer: ReturnType<typeof setTimeout> | undefined;
	let watcher: FSWatcher | undefined;
	let closed = false;

	const flush = () => {
		timer = undefined;
		const events = [...pending];
		pending.clear();
		if (closed) return;
		const result = diffBatch(events, known, scan(root), existsSync);
		known = result.known;
		if (result.changes.length > 0) onChanges(result.changes);
	};
	const close = () => {
		closed = true;
		if (timer) clearTimeout(timer);
		timer = undefined;
		watcher?.close();
	};

	try {
		watcher = watch(root, { recursive: true, persistent: false }, (_event, filename) => {
			if (closed || !filename) return;
			const relative = filename.toString();
			if (!isFollowedPath(relative)) return;
			// A watched file is checked by name; any other path (a folder moved or renamed) only asks for the rescan.
			if (isWatchedPath(relative)) pending.add(join(root, partsOf(relative).join(sep)));
			if (timer) clearTimeout(timer);
			timer = setTimeout(flush, debounceMs);
		});
		watcher.on("error", (error) => {
			close();
			onError?.(error);
		});
	} catch (error) {
		close();
		throw error;
	}
	return { close };
}
