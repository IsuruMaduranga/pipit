/**
 * One writer at a time in `~/.ballerina` (no pi imports): `bal tool pull`,
 * `bal tool update` and `bal dist pull` each rewrite its registries, and two
 * sessions started together (or `/new` while the first one's install runs)
 * would otherwise run them at once. The lock is a file in the product's state
 * folder holding the owner's process id; a lock whose process is gone is
 * taken over. Within one process, setup-session.ts runs its own work in turn,
 * so a lock held by this very process means another session of it holds it.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/** The lock file's name in the product's state folder. */
export const LOCK_FILE = "ballerina-install.lock";

const alive = (pid: number) => {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		// EPERM: the process exists but belongs to someone else.
		return (error as NodeJS.ErrnoException).code === "EPERM";
	}
};

/** Take the lock at `file`; false when a live process holds it. */
export function takeLock(file: string): boolean {
	for (let attempt = 0; attempt < 2; attempt++) {
		try {
			mkdirSync(dirname(file), { recursive: true });
			writeFileSync(file, `${process.pid}\n`, { flag: "wx" });
			return true;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "EEXIST") return false;
		}
		let owner: number;
		try {
			owner = Number.parseInt(readFileSync(file, "utf8"), 10);
		} catch {
			// Released between the two calls: try again.
			continue;
		}
		if (Number.isInteger(owner) && owner > 0 && alive(owner)) return false;
		rmSync(file, { force: true });
	}
	return false;
}

/** Release the lock at `file`, if this process holds it. */
export function releaseLock(file: string): void {
	try {
		if (Number.parseInt(readFileSync(file, "utf8"), 10) === process.pid) rmSync(file, { force: true });
	} catch {}
}
