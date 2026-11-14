#!/usr/bin/env node
// Build the diagram view's page (bundle/) from a ballerina-vscode checkout.
//
//   node profile/extensions/ballerina/visualize/build-bundle.mjs [checkout]
//
// The checkout defaults to ~/wso2/integrator/ballerina-vscode. It is only
// read: the build uses its already built lib/ folders and its installed
// esbuild, and runs no install or build there. The output replaces bundle/
// next to this script, with build.json recording the commits it came from.
//
// What the bundle leaves out, and how:
// - @wso2/ballerina-side-panel (the editing stack) is replaced by
//   page/side-panel-stub.js.
// - The Gilmer fonts are replaced by page/system-fonts.css (system faces).
// - A font that also ships as woff2 is bundled only as woff2; the other
//   formats in an @font-face list resolve to the woff2 file.
// The theme variables come from the checkout's Storybook themes, scoped to
// body.vscode-light and body.vscode-dark.
//
// Before bundling, tsc checks the page against the checkout's types
// (page/tsconfig.json, with its paths pointed at the checkout given here);
// any type error stops the build. esbuild alone strips types unchecked.

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const HERE = dirname(fileURLToPath(import.meta.url));
const PAGE = join(HERE, "page");
const OUT = join(HERE, "bundle");
const REPO = resolve(HERE, "../../../..");
const SUBMODULE = "submodules/wso2-vscode-extensions";

function fail(message) {
	console.error(`build-bundle: ${message}`);
	process.exit(1);
}

const checkout = resolve(process.argv[2] ?? join(homedir(), "wso2/integrator/ballerina-vscode"));
if (!existsSync(join(checkout, "rush.json"))) fail(`${checkout} is not a ballerina-vscode checkout (no rush.json). Pass the checkout's folder as the first argument.`);
const pkg = (name) => join(checkout, "packages", name);

// The built libraries the page imports, directly or through the diagrams.
const LIBS = [
	["@wso2/bi-diagram", join(pkg("bi-diagram"), "lib/index.js")],
	["@wso2/component-diagram", join(pkg("component-diagram"), "lib/index.js")],
	["@wso2/ballerina-core", join(pkg("ballerina-core"), "lib/index.js")],
	["@wso2/ui-toolkit", join(checkout, SUBMODULE, "workspaces/common-libs/ui-toolkit/lib/index.js")],
];
const missing = LIBS.filter(([, file]) => !existsSync(file));
if (missing.length > 0) {
	fail(
		`the checkout's libraries are not built: ${missing.map(([name, file]) => `${name} (${relative(checkout, file)})`).join(", ")}.\n` +
			`  Build them in the checkout first: git submodule update --init, then rush install and rush build -t @wso2/bi-diagram -t @wso2/component-diagram (rush.json says which Node it needs).`,
	);
}

// A dependency the packages resolve through the checkout's own installs.
function fromCheckout(request, from = pkg("bi-diagram")) {
	try {
		return realpathSync(dirname(createRequire(join(from, "package.json")).resolve(`${request}/package.json`)));
	} catch {
		fail(`${request} is not installed in the checkout (looked from ${relative(checkout, from)}). Run rush install there.`);
	}
}

function pnpmStore(name) {
	const store = join(checkout, "common/temp/node_modules/.pnpm");
	const versions = existsSync(store) ? readdirSync(store).filter((entry) => entry.startsWith(`${name.replace("/", "+")}@`)) : [];
	const byVersion = (entry) => entry.slice(entry.indexOf("@", 1) + 1).split(/[._-]/).map((part) => Number.parseInt(part, 10) || 0);
	versions.sort((a, b) => {
		const [x, y] = [byVersion(a), byVersion(b)];
		for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
		return 0;
	});
	return versions.map((entry) => join(store, entry, "node_modules", name)).filter((dir) => existsSync(join(dir, "package.json")));
}

// esbuild: the checkout's newest, else this repository's.
const esbuildDir = pnpmStore("esbuild").at(-1) ?? (existsSync(join(REPO, "node_modules/esbuild/package.json")) ? join(REPO, "node_modules/esbuild") : undefined);
if (!esbuildDir) fail("no esbuild found, neither in the checkout's common/temp/node_modules/.pnpm nor in this repository's node_modules. Run rush install in the checkout.");
const esbuild = createRequire(join(esbuildDir, "package.json"))(esbuildDir);

const codicons = pnpmStore("@vscode/codicons").at(-1) ?? fromCheckout("@vscode/codicons");

function git(args, cwd = checkout) {
	try {
		return execFileSync("git", ["--no-optional-locks", ...args], { cwd, encoding: "utf8" }).trim();
	} catch {
		return undefined;
	}
}

const FONT = /\.(woff2?|ttf|eot|otf)$/i;
const THEMES = { light: "lightTheme.css", dark: "darkTheme.css" };

/** The bundle's substitutions: the side-panel stub, the Gilmer replacement, woff2-only fonts and the scoped themes. */
const viewPlugin = {
	name: "diagram-view",
	setup(build) {
		build.onResolve({ filter: /^@wso2\/ballerina-side-panel$/ }, () => ({ path: join(PAGE, "side-panel-stub.js") }));
		build.onResolve({ filter: /(^|\/)fonts\.css$/ }, (args) => {
			const target = resolve(args.resolveDir, args.path);
			return /resources\/assets\/font\/fonts\.css$/.test(target) ? { path: join(PAGE, "system-fonts.css") } : undefined;
		});
		build.onResolve({ filter: /\.(woff2?|ttf|eot|otf)([?#].*)?$/i }, (args) => {
			const clean = args.path.replace(/[?#].*$/, "");
			const target = resolve(args.resolveDir, clean);
			if (/gilmer/i.test(basename(target))) return { errors: [{ text: `a Gilmer font is still referenced (${target}); the bundle must not ship it` }] };
			const woff2 = target.replace(FONT, ".woff2");
			if (!target.endsWith(".woff2") && existsSync(woff2)) return { path: woff2 };
			return undefined;
		});
		build.onResolve({ filter: /^theme:(light|dark)$/ }, (args) => ({ path: args.path.slice("theme:".length), namespace: "theme" }));
		build.onLoad({ filter: /.*/, namespace: "theme" }, (args) => {
			const file = join(pkg("bi-diagram"), ".storybook", THEMES[args.path]);
			if (!existsSync(file)) return { errors: [{ text: `the theme ${relative(checkout, file)} is missing from the checkout` }] };
			const css = readFileSync(file, "utf8");
			if (!/^body\s*\{/m.test(css)) return { errors: [{ text: `${relative(checkout, file)} no longer starts its variables with "body {"; update build-bundle.mjs` }] };
			return { contents: css.replace(/^body\s*\{/m, `body.vscode-${args.path} {`), loader: "css" };
		});
	},
};

/** Typecheck the page with tsc against this checkout's React and diagram types; exits on any error. */
function typecheckPage() {
	let tsc;
	try {
		tsc = createRequire(join(REPO, "package.json")).resolve("typescript/bin/tsc");
	} catch {
		fail("TypeScript is not installed in this repository (node_modules/typescript); run npm ci first.");
	}
	const types = (name) => join(pkg("bi-diagram"), "node_modules", "@types", name);
	for (const dir of [types("react"), types("react-dom")]) {
		if (!existsSync(join(dir, "index.d.ts"))) fail(`the checkout has no React types at ${relative(checkout, dir)}. Run rush install there.`);
	}
	const dir = `${OUT}.typecheck-${process.pid}`;
	rmSync(dir, { recursive: true, force: true });
	mkdirSync(dir, { recursive: true });
	writeFileSync(
		join(dir, "tsconfig.json"),
		JSON.stringify({
			extends: join(PAGE, "tsconfig.json"),
			compilerOptions: {
				paths: {
					react: [types("react")],
					"react/*": [join(types("react"), "*")],
					"react-dom/*": [join(types("react-dom"), "*")],
					"@wso2/bi-diagram": [join(pkg("bi-diagram"), "lib/index.d.ts")],
					"@wso2/component-diagram": [join(pkg("component-diagram"), "lib/index.d.ts")],
				},
			},
			include: [join(PAGE, "*.tsx")],
		}),
	);
	const result = spawnSync(process.execPath, [tsc, "-p", join(dir, "tsconfig.json"), "--pretty", "false"], { encoding: "utf8" });
	rmSync(dir, { recursive: true, force: true });
	if (result.status !== 0) fail(`the page does not typecheck against the checkout:\n${(result.stdout + result.stderr).trim()}`);
	console.log("page typecheck: clean");
}

typecheckPage();

const temp = `${OUT}.building-${process.pid}`;
rmSync(temp, { recursive: true, force: true });
mkdirSync(temp, { recursive: true });
const started = Date.now();
let result;
try {
	result = await esbuild.build({
		entryPoints: [join(PAGE, "main.tsx")],
		bundle: true,
		outdir: temp,
		format: "esm",
		minify: true,
		metafile: true,
		target: "es2020",
		jsx: "automatic",
		legalComments: "none",
		define: { "process.env.NODE_ENV": '"production"', global: "globalThis" },
		loader: { ".svg": "file", ".png": "file", ".gif": "file", ".woff2": "file", ".woff": "file", ".ttf": "file", ".eot": "file", ".otf": "file" },
		assetNames: "assets/[name]-[hash]",
		logLevel: "warning",
		plugins: [viewPlugin],
		// One React and one Emotion for the page and every package.
		alias: {
			"@wso2/bi-diagram": pkg("bi-diagram"),
			"@wso2/component-diagram": pkg("component-diagram"),
			react: fromCheckout("react"),
			"react-dom": fromCheckout("react-dom"),
			"@emotion/react": fromCheckout("@emotion/react"),
			"@emotion/styled": fromCheckout("@emotion/styled"),
			"@vscode/codicons": codicons,
		},
		nodePaths: [join(checkout, "common/temp/node_modules")],
	});
} catch (error) {
	rmSync(temp, { recursive: true, force: true });
	fail(`esbuild failed: ${error.message}`);
}

writeFileSync(
	join(temp, "index.html"),
	`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>Integration view</title>
<link rel="stylesheet" href="main.css">
</head>
<body>
<div id="root"></div>
<script type="module" src="main.js"></script>
</body>
</html>
`,
);

function files(dir) {
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		return statSync(path).isDirectory() ? files(path) : [path];
	});
}

// What must never ship.
const built = files(temp);
const leaks = built.filter((file) => /gilmer/i.test(basename(file)) || (/\.(css|js)$/.test(file) && /Gilmer-[A-Za-z]+\.(woff2?|ttf|eot)/.test(readFileSync(file, "utf8"))));
if (leaks.length > 0) {
	rmSync(temp, { recursive: true, force: true });
	fail(`the Gilmer font reached the bundle: ${leaks.map((file) => relative(temp, file)).join(", ")}`);
}
const fonts = built.filter((file) => FONT.test(file)).map((file) => relative(temp, file));
const notWoff2 = fonts.filter((file) => !file.endsWith(".woff2"));

const dirty = [
	git(["status", "--porcelain", "--", "packages/bi-diagram", "packages/component-diagram", "packages/ballerina-core"]),
	git(["status", "--porcelain", "--", "workspaces/common-libs/ui-toolkit"], join(checkout, SUBMODULE))?.replace(/^(.{3})/gm, `$1${SUBMODULE}/`),
]
	.filter(Boolean)
	.join("\n");
const record = {
	checkout: {
		commit: git(["rev-parse", "HEAD"]),
		[SUBMODULE]: git(["rev-parse", "HEAD"], join(checkout, SUBMODULE)),
		localChangesInDiagramPackages: dirty ? dirty.split("\n") : [],
	},
	esbuild: esbuild.version,
	sidePanel: "stubbed (page/side-panel-stub.js)",
	gilmer: "left out (page/system-fonts.css)",
	fonts,
};
writeFileSync(join(temp, "build.json"), `${JSON.stringify(record, null, "\t")}\n`);

rmSync(OUT, { recursive: true, force: true });
renameSync(temp, OUT);

let raw = 0;
let gzip = 0;
for (const file of files(OUT).sort()) {
	const bytes = readFileSync(file);
	const zipped = gzipSync(bytes, { level: 9 }).length;
	raw += bytes.length;
	gzip += zipped;
	console.log(`${relative(REPO, file).padEnd(80)} ${String(Math.round(bytes.length / 1024)).padStart(6)} KiB  gzip ${String(Math.round(zipped / 1024)).padStart(5)} KiB`);
}
console.log(`total ${Math.round(raw / 1024)} KiB, gzip ${Math.round(gzip / 1024)} KiB; built in ${Date.now() - started} ms with esbuild ${esbuild.version}`);
console.log(`from ${checkout} at ${record.checkout.commit ?? "an unknown commit"}${dirty ? " (local changes in the diagram packages: see build.json)" : ""}`);
if (notWoff2.length > 0) console.log(`fonts with no woff2 form, kept as they ship: ${notWoff2.join(", ")}`);
if (result.warnings.length > 0) console.log(`${result.warnings.length} esbuild warning(s) above`);
