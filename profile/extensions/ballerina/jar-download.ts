/**
 * Download the BI designer's language-server jar once, into the product's
 * state folder (no pi imports; the caller supplies `fetch`, so tests run it
 * against a local server). The file is written under a temporary name in the
 * same folder, checked for its size and SHA-256 while it streams, and renamed
 * into place only when both match, so the launcher never sees a partial or
 * foreign jar. The request carries nothing about the user or the project:
 * a plain GET of the public release asset.
 */

import { createHash, randomBytes } from "node:crypto";
import { createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { JarPin } from "./bi-language-server.ts";

/** A download or check that failed; the message names the cause and the fix. */
export class JarDownloadError extends Error {}

export interface DownloadOptions {
	pin: JarPin;
	/** Where the jar goes. */
	target: string;
	fetch?: typeof fetch;
	signal?: AbortSignal;
	/** Called once before a download starts, with its size in bytes. */
	onDownloadStart?: (total: number) => void;
	/** Called as bytes arrive. */
	onProgress?: (received: number, total: number) => void;
	/** End the download when no bytes arrive for this long. */
	stallMs?: number;
}

/** A download that sends nothing for this long is dead; a slow one still sends something. */
export const STALL_MS = 30_000;
/** A partial file older than this belongs to no live download: one that was killed left it. */
export const STALE_PART_MS = 3_600_000;

/** Remove `<target>.*.part` files a killed download left behind, older than `STALE_PART_MS`. */
export function removeStaleParts(target: string, now: number = Date.now()): void {
	const dir = dirname(target);
	const prefix = `${basename(target)}.`;
	let names: string[];
	try {
		names = readdirSync(dir);
	} catch {
		return;
	}
	for (const name of names) {
		if (!name.startsWith(prefix) || !name.endsWith(".part")) continue;
		try {
			if (now - statSync(join(dir, name)).mtimeMs > STALE_PART_MS) rmSync(join(dir, name), { force: true });
		} catch {
			// Gone already, or not ours to remove: the next download tries again.
		}
	}
}

/** The hex SHA-256 of a file. */
export async function fileSha256(path: string): Promise<string> {
	const hash = createHash("sha256");
	await pipeline(createReadStream(path), hash);
	return hash.digest("hex");
}

/** Whether `target` holds the pinned jar, by size and hash. */
export async function jarMatches(target: string, pin: JarPin): Promise<boolean> {
	try {
		if (statSync(target).size !== pin.size) return false;
	} catch {
		return false;
	}
	return (await fileSha256(target)) === pin.sha256;
}

const megabytes = (bytes: number) => `${Math.round(bytes / 1_000_000)} MB`;

/**
 * Make sure `target` holds the pinned jar: keep a file that matches, replace
 * one that does not, download when there is none. Resolves with whether it
 * downloaded. Rejects with a `JarDownloadError` and leaves no partial file.
 */
export async function ensureJar(options: DownloadOptions): Promise<{ downloaded: boolean }> {
	const { pin, target } = options;
	if (existsSync(target)) {
		if (await jarMatches(target, pin)) return { downloaded: false };
		rmSync(target, { force: true });
	}
	removeStaleParts(target);
	options.onDownloadStart?.(pin.size);
	await downloadJar(options);
	return { downloaded: true };
}

/**
 * An abort that fires when `ms` pass without `touch()`: the stall guard.
 * `stop()` clears its timer once the download settles.
 */
function quietTimer(ms: number) {
	const controller = new AbortController();
	let timer: ReturnType<typeof setTimeout> | undefined;
	const touch = () => {
		if (timer) clearTimeout(timer);
		timer = setTimeout(() => controller.abort(), ms);
		timer.unref?.();
	};
	touch();
	return { signal: controller.signal, touch, stop: () => timer && clearTimeout(timer) };
}

/** Download the pinned jar to `target`, replacing what is there. */
export async function downloadJar({ pin, target, fetch: fetchImpl = fetch, signal: sessionSignal, onProgress, stallMs = STALL_MS }: DownloadOptions): Promise<void> {
	const host = new URL(pin.url).host;
	try {
		mkdirSync(dirname(target), { recursive: true });
	} catch (error) {
		throw new JarDownloadError(`Could not create ${dirname(target)} for the language server: ${(error as Error).message}.`);
	}
	// The session's end stops the download; so does a connection that goes quiet.
	const quiet = quietTimer(stallMs);
	const signal = sessionSignal ? AbortSignal.any([sessionSignal, quiet.signal]) : quiet.signal;
	const stopped = () =>
		quiet.signal.aborted
			? new JarDownloadError(`The language server download stopped sending data for ${Math.round(stallMs / 1000)} s and was ended. Check the network connection, then run /visualize again.`)
			: new JarDownloadError("The language server download was stopped.");

	const temp = `${target}.${process.pid}-${randomBytes(4).toString("hex")}.part`;
	try {
		let response: Response;
		try {
			response = await fetchImpl(pin.url, { redirect: "follow", signal, headers: { accept: "application/octet-stream" } });
		} catch (error) {
			if (signal.aborted) throw stopped();
			throw new JarDownloadError(`Could not reach ${host} to download the language server (${(error as Error).message}). Check the network connection, then run /visualize again.`);
		}
		if (!response.ok || !response.body) {
			throw new JarDownloadError(`Downloading the language server from ${pin.url} failed: the server answered ${response.status} ${response.statusText}. Run /visualize again later.`);
		}

		const hash = createHash("sha256");
		let received = 0;
		const check = new Transform({
			transform(chunk: Buffer, _encoding, done) {
				received += chunk.length;
				if (received > pin.size) {
					done(new JarDownloadError(`The language server download is larger than the ${pin.size} bytes the release lists; it was discarded.`));
					return;
				}
				hash.update(chunk);
				quiet.touch();
				onProgress?.(received, pin.size);
				done(null, chunk);
			},
		});
		try {
			await pipeline(Readable.fromWeb(response.body as never), check, createWriteStream(temp, { flags: "wx", flush: true }), { signal });
		} catch (error) {
			if (error instanceof JarDownloadError) throw error;
			if (signal.aborted) throw stopped();
			throw new JarDownloadError(`Downloading the language server failed: ${(error as Error).message}. Run /visualize again.`);
		}
		if (received !== pin.size) {
			throw new JarDownloadError(`The language server download stopped at ${megabytes(received)} of ${megabytes(pin.size)}; it was discarded. Run /visualize again.`);
		}
		const digest = hash.digest("hex");
		if (digest !== pin.sha256) {
			throw new JarDownloadError(`The downloaded language server does not match the pinned SHA-256 (got ${digest}); it was discarded. Run /visualize again, and report it if it happens twice.`);
		}
		renameSync(temp, target);
	} catch (error) {
		rmSync(temp, { force: true });
		throw error;
	} finally {
		quiet.stop();
	}
}
