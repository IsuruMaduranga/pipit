/**
 * The project watcher behind live update: which files it follows, how a
 * burst of events becomes one batch of changed, created and deleted files,
 * and a real watch on a temporary folder.
 */
import { mkdirSync, mkdtempSync, realpathSync, renameSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { LspFileChange } from "../../extensions/sdk/extension.ts";
import { isSkippedDir, WALK_MAX_DEPTH } from "../extensions/ballerina/project.ts";
import { diffBatch, isWatchedPath, watchProject } from "../extensions/ballerina/visualize/watcher.ts";

type FileChanges = { changed: string[]; created: string[]; deleted: string[] };
const byType = (changes: LspFileChange[]): FileChanges => ({
	changed: changes.filter((c) => c.type === "changed").map((c) => c.path),
	created: changes.filter((c) => c.type === "created").map((c) => c.path),
	deleted: changes.filter((c) => c.type === "deleted").map((c) => c.path),
});

describe("which files the view follows", () => {
	it("follows .bal files and manifests, outside build output and dot folders", () => {
		for (const path of ["main.bal", "orders/main.bal", "orders/modules/util/util.bal", "Ballerina.toml", "orders/Ballerina.toml"]) expect(isWatchedPath(path)).toBe(true);
		for (const path of ["Config.toml", "Dependencies.toml", "notes.txt", "target/bin/x.bal", "orders/target/a.bal", ".git/x.bal", "orders/.hidden/a.bal", "node_modules/a.bal", ""]) expect(isWatchedPath(path)).toBe(false);
	});
});

describe("which folders the view skips", () => {
	it("skips build output, dependencies and dot folders, the same rule the project walk uses, and its depth", () => {
		for (const name of ["target", "node_modules", "build", ".git", ".vscode"]) expect(isSkippedDir(name)).toBe(true);
		for (const name of ["modules", "orders", "tests"]) expect(isSkippedDir(name)).toBe(false);
		const deep = [...Array(WALK_MAX_DEPTH + 1).keys()].map((i) => `d${i}`).join("/");
		expect(isWatchedPath(`${deep}/x.bal`)).toBe(false);
		expect(isWatchedPath(`${deep.split("/").slice(1).join("/")}/x.bal`)).toBe(true);
	});
});

describe("sorting a batch", () => {
	const sorted = (events: string[], known: string[], scanned: string[], present: string[]) => {
		const result = diffBatch(events, new Set(known), new Set(scanned), (path) => present.includes(path));
		return { ...byType(result.changes), known: [...result.known].sort() };
	};

	it("tells changed, created and deleted files apart against what was there", () => {
		expect(sorted(["/p/a.bal", "/p/new.bal", "/p/gone.bal", "/p/a.bal"], ["/p/a.bal", "/p/gone.bal"], ["/p/a.bal", "/p/new.bal"], ["/p/a.bal", "/p/new.bal"])).toEqual({
			changed: ["/p/a.bal"],
			created: ["/p/new.bal"],
			deleted: ["/p/gone.bal"],
			known: ["/p/a.bal", "/p/new.bal"],
		});
	});

	it("finds files a folder move brought in or took away, with no event naming them", () => {
		// The events named only the folders, which ask for the rescan; the rescan finds what changed under them.
		expect(sorted([], ["/p/a.bal", "/p/m/m.bal"], ["/p/a.bal", "/p/pkg2/c.bal", "/p/n/m.bal"], ["/p/a.bal", "/p/pkg2/c.bal", "/p/n/m.bal"])).toEqual({
			changed: [],
			created: ["/p/pkg2/c.bal", "/p/n/m.bal"],
			deleted: ["/p/m/m.bal"],
			known: ["/p/a.bal", "/p/n/m.bal", "/p/pkg2/c.bal"],
		});
	});

	it("reports a deleted file it never listed, and keeps a listed file the scan missed but the disk still has", () => {
		expect(sorted(["/p/unlisted.bal"], ["/p/a.bal", "/p/past-the-cap.bal"], ["/p/a.bal"], ["/p/a.bal", "/p/past-the-cap.bal"])).toEqual({
			changed: [],
			created: [],
			deleted: ["/p/unlisted.bal"],
			known: ["/p/a.bal", "/p/past-the-cap.bal"],
		});
	});
});

describe("watching a folder", () => {
	let root: string;
	afterEach(() => rmSync(root, { recursive: true, force: true }));

	it("reports each burst of edits as one batch, and nothing for files it does not follow", async () => {
		root = realpathSync(mkdtempSync(join(tmpdir(), "view-watch-")));
		mkdirSync(join(root, "target"));
		writeFileSync(join(root, "Ballerina.toml"), "[package]\n");
		writeFileSync(join(root, "main.bal"), "");
		writeFileSync(join(root, "old.bal"), "");
		const batches: FileChanges[] = [];
		const watcher = watchProject({ root, debounceMs: 150, onChanges: (changes) => batches.push(byType(changes)) });
		try {
			await new Promise((resolve) => setTimeout(resolve, 200));
			writeFileSync(join(root, "main.bal"), "function main() {}\n");
			writeFileSync(join(root, "main.bal"), "function main() {}\n// twice\n");
			writeFileSync(join(root, "added.bal"), "");
			unlinkSync(join(root, "old.bal"));
			writeFileSync(join(root, "notes.txt"), "x");
			writeFileSync(join(root, "target", "build.bal"), "");
			await waitFor(() => batches.length > 0);
			await new Promise((resolve) => setTimeout(resolve, 400));
			const all = mergeBatches(batches);
			expect(all.changed).toContain(join(root, "main.bal"));
			expect(all.created).toEqual([join(root, "added.bal")]);
			expect(all.deleted).toEqual([join(root, "old.bal")]);
			expect([...all.changed, ...all.created, ...all.deleted].some((path) => path.endsWith("notes.txt") || path.includes("target"))).toBe(false);
			expect(batches.length).toBeLessThanOrEqual(2);
		} finally {
			watcher.close();
		}
	});

	it("reports the files of a package folder moved in, and of a module folder renamed", async () => {
		root = realpathSync(mkdtempSync(join(tmpdir(), "view-watch-")));
		const outside = realpathSync(mkdtempSync(join(tmpdir(), "view-outside-")));
		try {
			mkdirSync(join(root, "pkg", "modules", "m"), { recursive: true });
			writeFileSync(join(root, "pkg", "Ballerina.toml"), "[package]\n");
			writeFileSync(join(root, "pkg", "modules", "m", "m.bal"), "");
			mkdirSync(join(outside, "pkg2"));
			writeFileSync(join(outside, "pkg2", "Ballerina.toml"), "[package]\n");
			writeFileSync(join(outside, "pkg2", "c.bal"), "");
			const batches: FileChanges[] = [];
			const watcher = watchProject({ root, debounceMs: 150, onChanges: (changes) => batches.push(byType(changes)) });
			try {
				await new Promise((resolve) => setTimeout(resolve, 400));
				batches.length = 0;
				renameSync(join(outside, "pkg2"), join(root, "pkg2"));
				renameSync(join(root, "pkg", "modules", "m"), join(root, "pkg", "modules", "n"));
				await waitFor(() => mergeBatches(batches).created.length >= 3);
				await new Promise((resolve) => setTimeout(resolve, 300));
				const all = mergeBatches(batches);
				expect(all.created.sort()).toEqual([join(root, "pkg", "modules", "n", "m.bal"), join(root, "pkg2", "Ballerina.toml"), join(root, "pkg2", "c.bal")].sort());
				expect(all.deleted).toEqual([join(root, "pkg", "modules", "m", "m.bal")]);
			} finally {
				watcher.close();
			}
		} finally {
			rmSync(outside, { recursive: true, force: true });
		}
	});

	it("reports nothing after it is closed", async () => {
		root = realpathSync(mkdtempSync(join(tmpdir(), "view-watch-")));
		writeFileSync(join(root, "main.bal"), "");
		const batches: FileChanges[] = [];
		const watcher = watchProject({ root, debounceMs: 50, onChanges: (changes) => batches.push(byType(changes)) });
		// macOS may still deliver the file's creation, from just before the watch began.
		await new Promise((resolve) => setTimeout(resolve, 400));
		batches.length = 0;
		writeFileSync(join(root, "main.bal"), "x");
		watcher.close();
		await new Promise((resolve) => setTimeout(resolve, 300));
		expect(batches).toEqual([]);
	});
});

function mergeBatches(batches: FileChanges[]): FileChanges {
	return {
		changed: [...new Set(batches.flatMap((batch) => batch.changed))],
		created: [...new Set(batches.flatMap((batch) => batch.created))],
		deleted: [...new Set(batches.flatMap((batch) => batch.deleted))],
	};
}

async function waitFor(condition: () => boolean, timeoutMs = 5000): Promise<void> {
	const started = Date.now();
	while (!condition()) {
		if (Date.now() - started > timeoutMs) throw new Error("timed out waiting for the watcher");
		await new Promise((resolve) => setTimeout(resolve, 25));
	}
}
