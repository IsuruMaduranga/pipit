/**
 * create_integration: the layout it writes is the one BI's own creator
 * writes, a project's manifest keeps everything else it holds, and nothing
 * is ever overwritten.
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { APP_ONLY_FILES, CreateError, createdFileChanges, createIntegration, formatCreated, orgName, packageManifest, packageName, SOURCE_FILES, withPackage, workspaceManifest } from "../extensions/ballerina/create-integration.ts";
import { findProject } from "../extensions/ballerina/project.ts";

const made: string[] = [];
afterEach(() => {
	for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});
const temp = () => {
	const dir = mkdtempSync(join(tmpdir(), "create-integration-"));
	made.push(dir);
	return dir;
};
const read = (...parts: string[]) => readFileSync(join(...parts), "utf8");
const create = (cwd: string, name: string, more: Partial<Parameters<typeof createIntegration>[0]> = {}) => createIntegration({ cwd, name, username: "dev.user", distribution: "2201.14.0", ...more });

describe("names", () => {
	it("makes a package name of lowercase letters, digits and underscores", () => {
		expect(packageName("Order Sync")).toBe("order_sync");
		expect(packageName("  order-sync.v2 ")).toBe("order_sync_v2");
		expect(packageName("2fast")).toBeUndefined();
		expect(packageName("../x")).toBe("x");
		expect(packageName("***")).toBeUndefined();
	});

	it("makes an org of a login name", () => {
		expect(orgName("dev.user")).toBe("dev_user");
		expect(orgName("wso2")).toBe("wso2");
		expect(orgName("")).toBeUndefined();
	});
});

describe("a new project", () => {
	it("makes the working directory a project with the integration as its first", () => {
		const cwd = temp();
		const created = create(cwd, "Order Sync", { title: "Order Sync", projectTitle: 'Shop "A"' });
		expect(created.projectCreated).toBe(true);
		expect(read(cwd, "Ballerina.toml")).toBe('\n[workspace]\ntitle = "Shop \\"A\\""\npackages = ["order_sync"]\n\n');
		expect(read(cwd, ".vscode/settings.json")).toBe('\n{\n    "ballerina.isBI": true\n}\n');
		const dir = join(cwd, "order_sync");
		expect(read(dir, "Ballerina.toml")).toBe('\n[package]\norg = "dev_user"\nname = "order_sync"\nversion = "0.1.0"\ndistribution = "2201.14.0"\ntitle = "Order Sync"\n\n[build-options]\nsticky = true\n\n');
		expect(readdirSync(dir).sort()).toEqual([".gitignore", ".vscode", "Ballerina.toml", ...[...SOURCE_FILES, ...APP_ONLY_FILES].sort()].sort());
		for (const file of [...SOURCE_FILES, ...APP_ONLY_FILES]) expect(read(dir, file)).toBe("\n");
		expect(readdirSync(join(dir, ".vscode")).sort()).toEqual(["launch.json", "settings.json"]);
		expect(read(dir, ".gitignore")).toMatch(/^# Ballerina generates[\s\S]*\ntarget\/\n[\s\S]*\ngenerated\/\n[\s\S]*\nConfig\.toml$/);
		// The project reads back as a workspace with that package.
		const project = findProject(cwd);
		expect(project?.kind).toBe("workspace");
		expect(project?.packages.map((pkg) => `${pkg.org}/${pkg.name}`)).toEqual(["dev_user/order_sync"]);
		expect(project?.problems).toEqual([]);
	});

	it("leaves out the distribution line when the distribution is unknown, and titles the project by its folder", () => {
		const cwd = temp();
		create(cwd, "api", { distribution: undefined });
		expect(read(cwd, "api/Ballerina.toml")).not.toContain("distribution");
		expect(read(cwd, "Ballerina.toml")).toContain(`title = "${cwd.split("/").pop()}"`);
	});

	it("fills in an empty root manifest", () => {
		const cwd = temp();
		writeFileSync(join(cwd, "Ballerina.toml"), "\n");
		expect(create(cwd, "api").projectCreated).toBe(true);
		expect(findProject(cwd)?.kind).toBe("workspace");
	});

	it("writes a library with lib.bal and without main.bal and automation.bal", () => {
		const cwd = temp();
		const created = create(cwd, "shared", { library: true });
		expect(read(cwd, "shared/lib.bal")).toBe("import wso2/strict.library as _;");
		expect(existsSync(join(cwd, "shared/main.bal"))).toBe(false);
		expect(existsSync(join(cwd, "shared/automation.bal"))).toBe(false);
		expect(formatCreated(created)).toContain("bal pull wso2/strict.library");
	});
});

describe("an existing project", () => {
	const project = (manifest: string) => {
		const cwd = temp();
		writeFileSync(join(cwd, "Ballerina.toml"), manifest);
		mkdirSync(join(cwd, "first"));
		writeFileSync(join(cwd, "first/Ballerina.toml"), packageManifest({ org: "acme", name: "first", title: "First" }));
		return cwd;
	};

	it("adds the integration, takes the project's org, and keeps the rest of the manifest", () => {
		const cwd = project('# ours\n[workspace]\ntitle = "Shop"\npackages = ["first"] # members\n');
		const created = create(join(cwd, "first"), "second");
		expect(created.projectCreated).toBe(false);
		expect(created.projectRoot).toBe(findProject(cwd)?.root);
		expect(read(cwd, "Ballerina.toml")).toBe('# ours\n[workspace]\ntitle = "Shop"\npackages = ["first", "second"] # members\n');
		expect(read(cwd, "second/Ballerina.toml")).toContain('org = "acme"');
		expect(findProject(cwd)?.packages.map((pkg) => pkg.name)).toEqual(["first", "second"]);
		// The root's marker is written when it was missing.
		expect(existsSync(join(cwd, ".vscode/settings.json"))).toBe(true);
	});

	it("takes an org given in the call over the project's", () => {
		const cwd = project('[workspace]\npackages = ["first"]\n');
		create(cwd, "second", { org: "other" });
		expect(read(cwd, "second/Ballerina.toml")).toContain('org = "other"');
	});

	it("adds to an empty array, a one-entry-a-line array, and a section without the array", () => {
		expect(withPackage("[workspace]\npackages = []\n", "a")).toBe('[workspace]\npackages = ["a"]\n');
		expect(withPackage('[workspace]\npackages = [\n    "first",\n]\n', "a")).toBe('[workspace]\npackages = [\n    "first",\n    "a"\n]\n');
		expect(withPackage('[workspace]\ntitle = "x"\n', "a")).toBe('[workspace]\npackages = ["a"]\ntitle = "x"\n');
		expect(withPackage('[package]\nname = "x"\n', "a")).toBeUndefined();
	});

	it("refuses a folder or a name that exists, and writes nothing", () => {
		const cwd = project('[workspace]\npackages = ["first"]\n');
		const before = read(cwd, "Ballerina.toml");
		expect(() => create(cwd, "first")).toThrow(CreateError);
		mkdirSync(join(cwd, "taken"));
		expect(() => create(cwd, "taken")).toThrow(/taken already exists: it is an empty folder, not one of this project's integrations\. Nothing was created or overwritten\./);
		expect(read(cwd, "Ballerina.toml")).toBe(before);
		expect(readdirSync(join(cwd, "taken"))).toEqual([]);
	});

	const refusal = (cwd: string, name: string) => {
		try {
			create(cwd, name);
		} catch (error) {
			return (error as Error).message;
		}
		return "";
	};

	it("names the fix for both cases when the integration exists, and lists its .bal files", () => {
		const cwd = project('[workspace]\npackages = []\n');
		create(cwd, "done");
		const message = refusal(cwd, "done");
		expect(message).toContain(`The integration ${join(cwd, "done")} already exists, and nothing is overwritten.`);
		expect(message).toContain("read its .bal files once (agents.bal, automation.bal, config.bal, connections.bal, data_mappings.bal, functions.bal, main.bal, types.bal)");
		expect(message).toContain("Do not call create_integration for it again.");
		expect(message).toContain("call create_integration with another name");
	});

	it("says a file is in the way, and never sends the model to write code into it", () => {
		const cwd = project('[workspace]\npackages = []\n');
		writeFileSync(join(cwd, "afile"), "x");
		const message = refusal(cwd, "afile");
		expect(message).toBe(`${join(cwd, "afile")} already exists: it is a file. Nothing was created or overwritten. Call create_integration with another name, or ask the user to remove or rename what is at that path.`);
		expect(message).not.toContain("write the code");
		expect(read(cwd, "afile")).toBe("x");
	});

	it("says a folder the project does not list is not one of its integrations", () => {
		const cwd = project('[workspace]\npackages = ["first"]\n');
		mkdirSync(join(cwd, "stray"));
		writeFileSync(join(cwd, "stray/main.bal"), "");
		const message = refusal(cwd, "stray");
		expect(message).toBe(`${join(cwd, "stray")} already exists: it is a folder that is not one of this project's integrations. Nothing was created or overwritten. Call create_integration with another name, or ask the user to remove or rename what is at that path.`);
		expect(message).not.toContain("write the code");
		expect(read(cwd, "Ballerina.toml")).toBe('[workspace]\npackages = ["first"]\n');
	});
});

describe("refusals", () => {
	it("refuses a single package that is not a project, with the way out", () => {
		const cwd = temp();
		writeFileSync(join(cwd, "Ballerina.toml"), packageManifest({ org: "acme", name: "solo", title: "Solo" }));
		expect(() => create(cwd, "second")).toThrow(/single Ballerina package, not a BI project/);
		expect(readdirSync(cwd)).toEqual(["Ballerina.toml"]);
	});

	it("refuses a name it cannot use, and the home directory as a project", () => {
		expect(() => create(temp(), "123")).toThrow(/needs a letter first/);
		if (!existsSync(join(homedir(), "Ballerina.toml"))) expect(() => create(homedir(), "api")).toThrow(/cannot become a project folder/);
	});
});

// BI's own creator, when its repository is checked out on this machine: the templates here must be its templates.
const BI_CREATOR = join(homedir(), "wso2/integrator/ballerina-vscode/packages/ballerina-extension/src/utils/bi.ts");
describe.skipIf(!existsSync(BI_CREATOR))("the layout is the BI designer's", () => {
	const source = existsSync(BI_CREATOR) ? readFileSync(BI_CREATOR, "utf8") : "";
	const template = (name: string) => {
		const found = new RegExp(`const ${name} = \`([\\s\\S]*?)\`;`).exec(source);
		if (!found) throw new Error(`${name} is not in ${BI_CREATOR}`);
		return found[1] as string;
	};

	it("writes the same settings, launch configuration and .gitignore", () => {
		const cwd = temp();
		create(cwd, "api");
		expect(read(cwd, "api/.vscode/settings.json")).toBe(template("settingsJsonContent"));
		expect(read(cwd, "api/.vscode/launch.json")).toBe(template("launchJsonContent").trim());
		expect(read(cwd, "api/.gitignore")).toBe(template("gitignoreContent").trim());
	});

	it("writes the same manifests and the same source files", () => {
		const manifests = [...source.matchAll(/const ballerinaTomlContent = `([\s\S]*?)`;/g)].map((found) => found[1] as string);
		const fill = (text: string, values: Record<string, string>) => text.replace(/\$\{([^}]+)\}/g, (_all, expression: string) => values[expression.trim()] ?? `<${expression}>`);
		const pkg = manifests.find((text) => text.includes("[package]"));
		expect(pkg && fill(pkg, { "orgHandle ?? finalOrgName": "acme", packageName: "api", finalVersion: "0.1.0", distributionLine: 'distribution = "2201.14.0"\n', integrationName: "Api" })).toBe(
			packageManifest({ org: "acme", name: "api", title: "Api", distribution: "2201.14.0" }),
		);
		const workspace = manifests.find((text) => text.includes("[workspace]") && text.includes("sanitizeName"));
		expect(workspace && fill(workspace, { "projectRequest.workspaceName": "Shop", "sanitizeName(projectRequest.packageName)": "api" })).toBe(workspaceManifest("Shop", "api"));
		const files = [...source.slice(source.indexOf("export async function createBIProjectPure")).matchAll(/path\.join\(projectRoot, '([a-z_]+\.bal)'\)/g)].map((found) => found[1]);
		expect(files.sort()).toEqual([...SOURCE_FILES, ...APP_ONLY_FILES, "lib.bal"].sort());
	});
});

describe("what the language server is told", () => {
	it("reports the new sources and manifests as created, and leaves the editor files out", () => {
		const cwd = temp();
		const created = create(cwd, "order_sync");
		const changes = createdFileChanges(created);
		expect(changes.every((change) => change.type === "created")).toBe(true);
		expect(changes.map((change) => change.path).sort()).toEqual(
			[join(cwd, "Ballerina.toml"), join(cwd, "order_sync", "Ballerina.toml"), ...[...SOURCE_FILES, ...APP_ONLY_FILES].map((file) => join(cwd, "order_sync", file))].sort(),
		);
	});

	it("reports an existing project's manifest as changed", () => {
		const cwd = temp();
		create(cwd, "first");
		const second = create(cwd, "second");
		const changes = createdFileChanges(second);
		expect(changes.find((change) => change.path === join(cwd, "Ballerina.toml"))).toEqual({ path: join(cwd, "Ballerina.toml"), type: "changed" });
		expect(changes.filter((change) => change.type === "changed")).toHaveLength(1);
	});
});
