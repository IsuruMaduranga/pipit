/**
 * Which Ballerina language server the profile starts for `.bal` files (pure:
 * no pi imports, no file reads). The diagram view needs the BI designer's
 * server, a fat jar the product downloads once into its state folder
 * (extensions/ballerina/jar-download.ts). Diagnostics need any server. So on macOS and Linux the
 * profile declares a launcher script, `language-server.sh`, that starts the
 * jar when it is present, the right size, and built for the installed
 * distribution, and the distribution's own `bal start-language-server`
 * otherwise. On Windows the script cannot run, so the profile declares the
 * stock server directly, and `/visualize` says why it cannot draw there.
 *
 * The facts behind the pin and the launch: working-docs/findings/02-language-server/
 * (`bi-jar.md` "Starting the jar", `jar-publishing.md`).
 */

import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { sharedStateDir } from "../../extensions/sdk/profile.ts";
import { BALLERINA_FIX_HINTS, type BallerinaFixHints } from "./fix-hints.ts";

export interface JarPin {
	/** The BI extension release that carries the jar. */
	version: string;
	fileName: string;
	url: string;
	/** Bytes, as the release lists it. */
	size: number;
	/** Hex SHA-256 of the release asset. */
	sha256: string;
	/** The Ballerina update the jar is built against, as `<major>.<update>`: the launcher starts it only on a distribution of that update. */
	distribution: string;
	/** The oldest Java the jar runs on; the launcher looks for it among the distribution's own JREs. */
	javaMajor: number;
}

/** The pinned jar: release v6.0.1 of ballerina-platform/ballerina-vscode, checked 2026-11-14. */
export const BI_JAR: JarPin = {
	version: "6.0.1",
	fileName: "ballerina-language-server-6.0.1.jar",
	url: "https://github.com/ballerina-platform/ballerina-vscode/releases/download/v6.0.1/ballerina-language-server-6.0.1.jar",
	size: 73_406_195,
	sha256: "b1cabcca646bc97ce79c7757e7b00b8f70a4ac9ae23e87bfc045256e0c899640",
	distribution: "2201.14",
	javaMajor: 25,
};

/** The server's name in the profile's `languageServers`, which the SDK's requests and reports name. */
export const BALLERINA_SERVER = "ballerina";

/**
 * The launcher, by its absolute path beside this module: the declaration and
 * the command's `--check` run the same file. `${PROFILE_DIR}` would name the
 * folder of the profile in force, which for a second product profile is not
 * where the product's extensions live.
 */
export const LAUNCHER_PATH = fileURLToPath(new URL("./language-server.sh", import.meta.url));

/**
 * Where the downloaded jar lives: under the folder every profile of the
 * product shares, so a second profile reuses one download.
 */
export function jarPath(stateDir: string = sharedStateDir(), pin: JarPin = BI_JAR): string {
	return join(stateDir, "language-server", pin.fileName);
}

/** The launcher's arguments after the script (and after `--check`). */
export function launcherArgs(jar: string, pin: JarPin = BI_JAR): string[] {
	return [jar, String(pin.size), pin.distribution, String(pin.javaMajor)];
}

/** The fields of the base's `ProductLanguageServer` this server fills. */
export interface LanguageServerDeclaration {
	command: string;
	args: string[];
	extensions: Record<string, string>;
	rootMarkers: string[];
	startupTimeoutMs: number;
	/** The advice the base adds after the compiler errors it shows (fix-hints.ts). */
	fixHints: BallerinaFixHints;
}

/** The profile's `ballerina` language server on `platform`. */
export function ballerinaLanguageServer(platform: NodeJS.Platform = process.platform, jar: string = jarPath()): LanguageServerDeclaration {
	const routing = { extensions: { ".bal": "ballerina" }, rootMarkers: ["Ballerina.toml"], startupTimeoutMs: 60_000, fixHints: BALLERINA_FIX_HINTS };
	if (platform === "win32") return { command: "bal", args: ["start-language-server"], ...routing };
	return { command: "sh", args: [LAUNCHER_PATH, ...launcherArgs(jar)], ...routing };
}

/** What the launcher would start, as `language-server.sh --check` prints it. */
export type LauncherCheck =
	| { kind: "jar"; java: string }
	| { kind: "stock"; reason: "no-jar" | "no-bal" }
	| { kind: "stock"; reason: "jar-size" | "distribution" | "no-java"; detail: string }
	| { kind: "unknown"; output: string };

/** Read the launcher's `--check` line. */
export function parseLauncherCheck(stdout: string): LauncherCheck {
	const line = stdout.trim().split("\n").at(-1)?.trim() ?? "";
	const jar = /^jar (.+)$/.exec(line);
	if (jar) return { kind: "jar", java: jar[1] };
	const stock = /^stock (\S+)(?: (.*))?$/.exec(line);
	if (stock) {
		const [, reason, detail = ""] = stock;
		if (reason === "no-jar" || reason === "no-bal") return { kind: "stock", reason };
		if (reason === "jar-size" || reason === "distribution" || reason === "no-java") return { kind: "stock", reason, detail };
	}
	return { kind: "unknown", output: stdout.trim() };
}

/**
 * Why the diagram view cannot use the jar, with the fix, for a check that
 * did not find it usable; undefined when it is. The command downloads and
 * verifies the jar before it asks, so a jar still missing or the wrong size
 * means something removed or changed it since.
 */
export function launcherProblem(check: LauncherCheck, pin: JarPin = BI_JAR): string | undefined {
	if (check.kind === "jar") return undefined;
	if (check.kind === "unknown") return `The language server launcher gave an answer that could not be read: ${check.output || "(nothing)"}.`;
	switch (check.reason) {
		case "no-jar":
			return "The BI language server was downloaded, but the launcher does not find it. Run /visualize again.";
		case "jar-size":
			return `The BI language server file is ${check.detail} bytes, not the ${pin.size} the release lists. Run /visualize again to download it again.`;
		case "no-bal":
			return "Ballerina is not installed, or `bal home` failed: install Ballerina, then run /visualize again.";
		case "distribution":
			return `The diagram view needs Ballerina ${pin.distribution}.x (Update ${pin.distribution.split(".")[1]}), and the active distribution is ${check.detail}. Switch with \`bal dist use ${pin.distribution}.0\`, or install it with \`bal dist pull ${pin.distribution}.0\`, then restart the session.`;
		case "no-java":
			return `The diagram view needs Java ${pin.javaMajor} or newer from the Ballerina distribution, and none was found under ${check.detail}. Update the distribution with \`bal dist pull ${pin.distribution}.0\`, then restart the session.`;
	}
}
