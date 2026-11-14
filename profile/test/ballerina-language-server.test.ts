/**
 * The language server the profile declares: the launcher on macOS and
 * Linux, the stock server on Windows, and the launcher script itself, run
 * against a fake distribution with a fake `bal` and a fake `java` on PATH.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import brand from "../brand.json" with { type: "json" };
import { BI_JAR, ballerinaLanguageServer, brandStateDir, jarPath, LAUNCHER_PATH, launcherArgs, launcherProblem, parseLauncherCheck } from "../extensions/ballerina/bi-language-server.ts";
import { profile } from "../index.ts";

const SCRIPT = fileURLToPath(new URL("../extensions/ballerina/language-server.sh", import.meta.url));

describe("the declared server", () => {
	it("starts the launcher on macOS and Linux, with the jar's path and the pin", () => {
		for (const platform of ["darwin", "linux"] as const) {
			const server = ballerinaLanguageServer(platform, "/state/language-server/x.jar");
			expect(server.command).toBe("sh");
			expect(server.args).toEqual([LAUNCHER_PATH, "/state/language-server/x.jar", String(BI_JAR.size), BI_JAR.distribution, String(BI_JAR.javaMajor)]);
			expect(server.extensions).toEqual({ ".bal": "ballerina" });
			expect(server.rootMarkers).toEqual(["Ballerina.toml"]);
		}
	});

	it("names the launcher by one absolute path, the file the check runs, whichever profile is in force", () => {
		expect(LAUNCHER_PATH).toBe(SCRIPT);
		expect(existsSync(LAUNCHER_PATH)).toBe(true);
		expect(ballerinaLanguageServer("linux").args[0]).toBe(SCRIPT);
		expect(ballerinaLanguageServer("linux").args.join(" ")).not.toContain("${PROFILE_DIR}");
	});

	it("starts the stock server on Windows, where the launcher cannot run", () => {
		expect(ballerinaLanguageServer("win32")).toMatchObject({ command: "bal", args: ["start-language-server"] });
	});

	it("is what the profile declares for .bal files", () => {
		// The profile is built once per process, before this file's state folder is set: compare all but the jar's folder.
		const declared = profile.languageServers?.ballerina as ReturnType<typeof ballerinaLanguageServer>;
		const expected = ballerinaLanguageServer();
		expect({ ...declared, args: declared.args.filter((_, i) => i !== 1) }).toEqual({ ...expected, args: expected.args.filter((_, i) => i !== 1) });
		expect(declared.args[1].endsWith(join("language-server", BI_JAR.fileName))).toBe(true);
	});

	it("keeps the jar in the brand's state folder, which the brand's variable moves", () => {
		expect(brandStateDir({}, "/home/u")).toBe(join("/home/u", brand.stateDir));
		expect(brandStateDir({ [`${brand.envPrefix}_STATE_DIR`]: "/elsewhere" }, "/home/u")).toBe("/elsewhere");
		expect(jarPath("/s")).toBe(join("/s", "language-server", BI_JAR.fileName));
		expect(launcherArgs("/j")).toEqual(["/j", "73406195", "2201.14", "25"]);
	});

	it("pins the public release asset", () => {
		expect(BI_JAR.url).toBe(`https://github.com/ballerina-platform/ballerina-vscode/releases/download/v${BI_JAR.version}/${BI_JAR.fileName}`);
		expect(BI_JAR.sha256).toMatch(/^[0-9a-f]{64}$/);
	});
});

describe("reading the launcher's check", () => {
	it("reads each answer", () => {
		expect(parseLauncherCheck("jar /x/jdk-25-jre/bin/java\n")).toEqual({ kind: "jar", java: "/x/jdk-25-jre/bin/java" });
		expect(parseLauncherCheck("stock no-jar")).toEqual({ kind: "stock", reason: "no-jar" });
		expect(parseLauncherCheck("stock distribution ballerina-2201.13.2")).toEqual({ kind: "stock", reason: "distribution", detail: "ballerina-2201.13.2" });
		expect(parseLauncherCheck("stock no-java /opt/b/dependencies")).toEqual({ kind: "stock", reason: "no-java", detail: "/opt/b/dependencies" });
		expect(parseLauncherCheck("what")).toEqual({ kind: "unknown", output: "what" });
	});

	it("names the fix for each reason the jar cannot run", () => {
		expect(launcherProblem({ kind: "jar", java: "j" })).toBeUndefined();
		// The command downloads first, so a jar still missing or the wrong size afterwards is a problem too.
		expect(launcherProblem({ kind: "stock", reason: "no-jar" })).toMatch(/run \/visualize again/i);
		expect(launcherProblem({ kind: "stock", reason: "jar-size", detail: "12" })).toContain("12 bytes");
		expect(launcherProblem({ kind: "stock", reason: "distribution", detail: "ballerina-2201.13.2" })).toContain("bal dist use 2201.14.0");
		expect(launcherProblem({ kind: "stock", reason: "no-java", detail: "/d" })).toContain("Java 25");
		expect(launcherProblem({ kind: "stock", reason: "no-bal" })).toContain("install Ballerina");
		expect(launcherProblem({ kind: "unknown", output: "" })).toContain("could not be read");
	});
});

describe.skipIf(process.platform === "win32")("the launcher script", () => {
	let root: string;
	afterEach(() => rmSync(root, { recursive: true, force: true }));

	/** A distribution tree, a jar of `size` bytes, and `bal` and `java` stand-ins that print what they were asked. */
	function machine(options: { distribution?: string; jre?: string; jarBytes?: number } = {}) {
		root = mkdtempSync(join(tmpdir(), "bal-launcher-"));
		const home = join(root, "Ballerina", "distributions", `ballerina-${options.distribution ?? "2201.14.0"}`);
		for (const [dir, jars] of [
			["bre/lib", ["annotations-2201.14.0.jar", "flow-model-generator-2.6.2.jar", "ballerina-lang-2201.14.0.jar"]],
			["lib/tools/lang-server/lib", ["language-server-core-2201.14.0.jar", "org.eclipse.lsp4j-0.23.jar", "gson-2.10.jar"]],
			["lib/tools/debug-adapter/lib", ["debug-adapter-core.jar", "sqlite-jdbc-3.jar"]],
		] as const) {
			mkdirSync(join(home, dir), { recursive: true });
			for (const jar of jars) writeFileSync(join(home, dir, jar), "");
		}
		const java = join(root, "Ballerina", "dependencies", options.jre ?? "jdk-25.0.3+9-jre", "bin");
		mkdirSync(java, { recursive: true });
		writeFileSync(join(java, "java"), '#!/bin/sh\necho "java $*"\n');
		chmodSync(join(java, "java"), 0o755);
		const bin = join(root, "bin");
		mkdirSync(bin);
		writeFileSync(join(bin, "bal"), `#!/bin/sh\nif [ "$1" = home ]; then echo "${home}"; else echo "bal $*"; fi\n`);
		chmodSync(join(bin, "bal"), 0o755);
		const jar = join(root, "state", "ls.jar");
		mkdirSync(join(root, "state"));
		writeFileSync(jar, Buffer.alloc(options.jarBytes ?? 10));
		return { home, jar, java: join(java, "java"), path: `${bin}:/usr/bin:/bin` };
	}

	const run = (path: string, args: string[]) => execFileSync("sh", [SCRIPT, ...args], { encoding: "utf8", env: { PATH: path }, stdio: ["ignore", "pipe", "pipe"] }).trim();

	it("chooses the jar when it fits, and says why not otherwise", () => {
		const { jar, java, path } = machine();
		expect(run(path, ["--check", jar, "10", "2201.14", "25"])).toBe(`jar ${java}`);
		expect(run(path, ["--check", `${jar}.missing`, "10", "2201.14", "25"])).toBe("stock no-jar");
		expect(run(path, ["--check", jar, "11", "2201.14", "25"])).toBe("stock jar-size 10");
		expect(run(path, ["--check", jar, "10", "2201.13", "25"])).toBe("stock distribution ballerina-2201.14.0");
		expect(run(path, ["--check", jar, "10", "2201.14", "26"])).toBe(`stock no-java ${join(root, "Ballerina", "dependencies")}`);
	});

	it("does not take a 2201.1 distribution for 2201.14, nor an older JRE for the one it needs", () => {
		expect(run(machine({ distribution: "2201.1.0" }).path, ["--check", join(root, "state", "ls.jar"), "10", "2201.14", "25"])).toBe("stock distribution ballerina-2201.1.0");
		rmSync(root, { recursive: true, force: true });
		const older = machine({ jre: "jdk-21.0.5+11-jre" });
		expect(run(older.path, ["--check", older.jar, "10", "2201.14", "25"])).toMatch(/^stock no-java /);
	});

	it("starts the jar the way the BI extension does: the distribution's jars minus the stale ones, the jar last", () => {
		const { jar, path, home } = machine();
		const line = run(path, [jar, "10", "2201.14", "25"]);
		expect(line.startsWith("java -cp ")).toBe(true);
		const classpath = line.split(" ")[2].split(":");
		expect(classpath.at(-1)).toBe(jar);
		expect(classpath.map((entry) => entry.split("/").pop())).toEqual(["annotations-2201.14.0.jar", "ballerina-lang-2201.14.0.jar", "gson-2.10.jar", "debug-adapter-core.jar", "ls.jar"]);
		expect(line).toContain(`-Dballerina.home=${home} org.ballerinalang.langserver.launchers.stdio.Main`);
	});

	it("exits 127 with a plain reason when Ballerina is not installed, instead of failing to start bal", () => {
		const { jar } = machine();
		for (const args of [[jar, "10", "2201.14", "25"], [`${jar}.missing`, "10", "2201.14", "25"]]) {
			const result = spawnSync("sh", [SCRIPT, ...args], { encoding: "utf8", env: { PATH: "/usr/bin:/bin" } });
			expect(result.status).toBe(127);
			expect(result.stderr).toContain("Ballerina is not installed: the bal command is not on PATH");
		}
	});

	it("falls back to the stock server, which keeps diagnostics working", () => {
		const { jar, path } = machine();
		expect(run(path, [`${jar}.missing`, "10", "2201.14", "25"])).toBe("bal start-language-server");
		expect(run(path, [jar, "10", "2201.13", "25"])).toBe("bal start-language-server");
	});
});
