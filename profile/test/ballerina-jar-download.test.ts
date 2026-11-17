/**
 * The jar download: a file lands in place only when its size and SHA-256
 * match the pin, a failure leaves nothing behind and names the fix, and a
 * jar already in place is kept without a request.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JarPin } from "../ballerina/language-server.ts";
import { ensureJar, JarDownloadError } from "../extensions/ballerina/jar-download.ts";

const BODY = Buffer.from("not really a jar, but the right bytes");
const PIN: JarPin = {
	version: "0.0.1",
	fileName: "ls.jar",
	url: "https://example.test/releases/ls.jar",
	size: BODY.length,
	sha256: createHash("sha256").update(BODY).digest("hex"),
	distribution: "2201.14",
	javaMajor: 25,
};

/** A fetch that answers with `body` in two chunks, or `status`. */
function fakeFetch(body: Buffer = BODY, status = 200) {
	return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => {
		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(new Uint8Array(body.subarray(0, 5)));
				controller.enqueue(new Uint8Array(body.subarray(5)));
				controller.close();
			},
		});
		return new Response(status === 200 ? stream : "missing", { status, statusText: status === 200 ? "OK" : "Not Found" });
	});
}

let dir: string;
let target: string;
beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "jar-download-"));
	target = join(dir, "language-server", "ls.jar");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const leftovers = () => (existsSync(join(dir, "language-server")) ? readdirSync(join(dir, "language-server")).filter((name) => name !== "ls.jar") : []);

describe("ensureJar", () => {
	it("downloads the pinned asset, reports progress, and writes it in place", async () => {
		const fetch = fakeFetch();
		const progress: number[] = [];
		const started = vi.fn();
		const result = await ensureJar({ pin: PIN, target, fetch: fetch as never, onDownloadStart: started, onProgress: (received) => progress.push(received) });
		expect(result).toEqual({ downloaded: true });
		expect(readFileSync(target)).toEqual(BODY);
		expect(started).toHaveBeenCalledWith(BODY.length);
		expect(progress).toEqual([5, BODY.length]);
		expect(leftovers()).toEqual([]);
	});

	it("asks for the public asset with nothing about the user", async () => {
		const fetch = fakeFetch();
		await ensureJar({ pin: PIN, target, fetch: fetch as never });
		const [url, init] = fetch.mock.calls[0];
		expect(url).toBe(PIN.url);
		expect(init?.headers).toEqual({ accept: "application/octet-stream" });
		expect(init?.method).toBeUndefined();
		expect(init?.body).toBeUndefined();
	});

	it("keeps a jar that matches without a request, and replaces one that does not", async () => {
		await ensureJar({ pin: PIN, target, fetch: fakeFetch() as never });
		const again = fakeFetch();
		expect(await ensureJar({ pin: PIN, target, fetch: again as never })).toEqual({ downloaded: false });
		expect(again).not.toHaveBeenCalled();
		writeFileSync(target, Buffer.alloc(BODY.length));
		const replace = fakeFetch();
		expect(await ensureJar({ pin: PIN, target, fetch: replace as never })).toEqual({ downloaded: true });
		expect(readFileSync(target)).toEqual(BODY);
	});

	it("discards a download whose hash does not match", async () => {
		const wrong = Buffer.from(BODY.map((byte) => byte ^ 1));
		await expect(ensureJar({ pin: PIN, target, fetch: fakeFetch(wrong) as never })).rejects.toThrow(/does not match the pinned SHA-256/);
		expect(existsSync(target)).toBe(false);
		expect(leftovers()).toEqual([]);
	});

	it("discards a download that is short or too long", async () => {
		await expect(ensureJar({ pin: PIN, target, fetch: fakeFetch(BODY.subarray(0, 10)) as never })).rejects.toThrow(/stopped at/);
		await expect(ensureJar({ pin: PIN, target, fetch: fakeFetch(Buffer.concat([BODY, BODY])) as never })).rejects.toThrow(/larger than/);
		expect(existsSync(target)).toBe(false);
		expect(leftovers()).toEqual([]);
	});

	it("names the fix when the server refuses or the network is down", async () => {
		await expect(ensureJar({ pin: PIN, target, fetch: fakeFetch(BODY, 404) as never })).rejects.toThrow(/answered 404 Not Found/);
		const offline = vi.fn(async () => {
			throw new TypeError("fetch failed");
		});
		const error = await ensureJar({ pin: PIN, target, fetch: offline as never }).catch((caught) => caught);
		expect(error).toBeInstanceOf(JarDownloadError);
		expect(error.message).toContain("Could not reach example.test");
		expect(error.message).toContain("run /visualize again");
	});

	it("stops when the session ends", async () => {
		const controller = new AbortController();
		controller.abort();
		const fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
			init?.signal?.throwIfAborted();
			return new Response("x");
		});
		await expect(ensureJar({ pin: PIN, target, fetch: fetch as never, signal: controller.signal })).rejects.toThrow("The language server download was stopped.");
	});

	it("ends a download that stops sending, naming the fix", async () => {
		// One chunk, then silence: the stream never ends on its own.
		const stalled = vi.fn(async () => new Response(new ReadableStream<Uint8Array>({ start: (controller) => controller.enqueue(new Uint8Array(BODY.subarray(0, 5))) })));
		const started = Date.now();
		const error = await ensureJar({ pin: PIN, target, fetch: stalled as never, stallMs: 150 }).catch((caught) => caught);
		expect(error).toBeInstanceOf(JarDownloadError);
		expect(error.message).toContain("stopped sending data");
		expect(error.message).toContain("run /visualize again");
		expect(Date.now() - started).toBeLessThan(5_000);
		expect(existsSync(target)).toBe(false);
		expect(leftovers()).toEqual([]);
	});

	it("removes its partial file when the session ends mid-download", async () => {
		const controller = new AbortController();
		const fetch = vi.fn(async () => new Response(new ReadableStream<Uint8Array>({
			start(stream) {
				stream.enqueue(new Uint8Array(BODY.subarray(0, 5)));
				setTimeout(() => controller.abort(), 50);
			},
		})));
		await expect(ensureJar({ pin: PIN, target, fetch: fetch as never, signal: controller.signal })).rejects.toThrow("The language server download was stopped.");
		expect(leftovers()).toEqual([]);
	});

	it("clears partial files a killed download left more than an hour ago, and keeps a live one", async () => {
		mkdirSync(join(dir, "language-server"), { recursive: true });
		const old = `${target}.111-aaaaaaaa.part`;
		const live = `${target}.222-bbbbbbbb.part`;
		writeFileSync(old, "x");
		writeFileSync(live, "y");
		const twoHoursAgo = new Date(Date.now() - 2 * 3_600_000);
		utimesSync(old, twoHoursAgo, twoHoursAgo);
		await ensureJar({ pin: PIN, target, fetch: fakeFetch() as never });
		expect(existsSync(old)).toBe(false);
		expect(existsSync(live)).toBe(true);
	});
});
