/**
 * The cases every notice's off switch must pass, one list for both notices:
 * a setting unset, true in the user file, false in the user file, and set in
 * the project file against the opposite value in the user file (the
 * project's value wins). Each case runs in a fresh temporary home with the
 * setting files written for it.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { describe, expect, it } from "vitest";
import { productProjectSettingsPath, productSettingsPath } from "../../extensions/lib/profile/product-settings.ts";
import { tempHome } from "../../test/unit/helpers/temp-home.ts";

type Folders = { home: string; cwd: string };

function write(path: string, key: string, value: boolean): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, JSON.stringify({ [key]: value }));
}

/**
 * Registers the matrix for setting `key`. `run(cwd)` starts a session in
 * `cwd` and returns what reached the user; `whenOn` is what it returns while
 * the notice is wanted.
 */
export function settingMatrix(key: string, run: (cwd: string) => Promise<string[]>, whenOn: string[]): void {
	const user = (value: boolean) => ({ home }: Folders) => write(productSettingsPath(home), key, value);
	const project = (value: boolean) => ({ home, cwd }: Folders) => write(productProjectSettingsPath(cwd, home), key, value);
	const cases: Array<[string, Array<(folders: Folders) => void>, boolean]> = [
		["shows the notice when no file sets the setting", [], true],
		["shows it when the user file sets true", [user(true)], true],
		["stays quiet when the user file sets false", [user(false)], false],
		["stays quiet when the project file's false overrides the user's true", [user(true), project(false)], false],
		["shows it when the project file's true overrides the user's false", [user(false), project(true)], true],
	];
	describe(`the ${key} setting`, () => {
		for (const [name, setUp, shown] of cases) {
			it(name, async () => {
				const folders = tempHome(`${key}-`);
				for (const step of setUp) step(folders);
				expect(await run(folders.cwd)).toEqual(shown ? whenOn : []);
			});
		}
	});
}
