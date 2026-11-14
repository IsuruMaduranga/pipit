/**
 * Open a URL in the user's browser (no pi imports): a platform command,
 * started detached. The SDK offers no opener, so this is the product's own,
 * the same commands the base uses for its pages: `open` on macOS, `xdg-open`
 * on Linux, and on Windows `rundll32 url.dll,FileProtocolHandler` by its
 * System32 path, which takes the URL as one argument (`cmd /c start` would
 * cut it at the first `&`).
 */

import { spawn } from "node:child_process";
import { join } from "node:path";

export interface OpenerPlan {
	command: string;
	args: string[];
}

export function openerPlan(url: string, platform: NodeJS.Platform = process.platform, env: Record<string, string | undefined> = process.env): OpenerPlan {
	if (platform === "darwin") return { command: "open", args: [url] };
	if (platform === "win32") return { command: join(env.SystemRoot ?? "C:\\Windows", "System32", "rundll32.exe"), args: ["url.dll,FileProtocolHandler", url] };
	return { command: "xdg-open", args: [url] };
}

/** Why a browser started here would not reach the user, or undefined when it would. */
export function noBrowserReason(platform: NodeJS.Platform = process.platform, env: Record<string, string | undefined> = process.env): string | undefined {
	if (env.SSH_CONNECTION || env.SSH_TTY) return "this is an SSH session";
	if (platform !== "darwin" && platform !== "win32" && !env.DISPLAY && !env.WAYLAND_DISPLAY) return "there is no desktop display";
	return undefined;
}

/** Start the opener; resolves with why no browser opened, or undefined once it started. */
export function openBrowser(url: string, platform: NodeJS.Platform = process.platform, env: Record<string, string | undefined> = process.env): Promise<string | undefined> {
	const reason = noBrowserReason(platform, env);
	if (reason) return Promise.resolve(reason);
	const plan = openerPlan(url, platform, env);
	return new Promise((resolve) => {
		let child: ReturnType<typeof spawn>;
		try {
			child = spawn(plan.command, plan.args, { stdio: "ignore", detached: true });
		} catch (error) {
			resolve(`${plan.command} could not start (${(error as Error).message})`);
			return;
		}
		child.once("error", (error) => resolve(`${plan.command} could not start (${error.message})`));
		child.once("spawn", () => {
			child.unref();
			resolve(undefined);
		});
	});
}
