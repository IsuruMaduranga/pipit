# Pipit (code name)

Pipit is the terminal coding agent for WSO2 Integrator. "Pipit" is a code
name: the product's real name, command and package names are set in one file,
`profile/brand.json`, and change there.

This first profile is for BI: WSO2 Integrator projects written in Ballerina.

## How the repository is built

The repository is a copy of a base agent harness plus this product's
profile:

| Path | Owner | What it holds |
|---|---|---|
| `profile/` | this product | The brand, the model-facing text, the bundled agents, skills and themes, the Ballerina extension and the product's tests |
| `README.md`, `.github/`, `docs/` | this product | Repository files |
| everything else | the base | The harness: tools, permissions, the request pipeline, the terminal interface. Never edited here |

`.base-sync.json` records which commit of the base the copy holds.

## Run it from this tree

Node 22.19 or later is required.

```bash
npm ci
mkdir -p node_modules/@wso2 && ln -sfn ../.. node_modules/@wso2/pipit-extension
node app/bin.mjs
```

The link makes this tree the extension package the app loads. The app keeps
its state in `~/.pipit`, so sign in once with `/login`.

## Check a change

```bash
npx tsc --noEmit
npx vitest run profile/test     # this product's tests
scripts/test-base.sh            # the base's tests, on the base's fixture profile
node scripts/sync-base.mjs --check
```

The base's own tests under `test/` assume a profile with every feature on, so
they run on the base's fixture profile, not on this one.

## Bring in a newer base

Only `scripts/sync-base.mjs` writes the files the base owns. To move to a
newer commit or tag of the base:

```bash
node scripts/sync-base.mjs <base repository: a path or a URL> <tag, branch or commit>
npm ci
npx tsc --noEmit && npx vitest run profile/test && scripts/test-base.sh
```

The sync copies the base at that commit, deletes the files the base dropped,
keeps this product's version and stamps both `package.json` files from
`profile/brand.json`. It leaves the paths this product owns alone. A typecheck
error after a sync means the base's profile contract changed: fix the profile
until it compiles.

`node scripts/sync-base.mjs --check` fails when a file the base owns differs
from the recorded commit. A change the base needs is made in the base's own
repository and arrives with the next sync.

A file of this product that must sit outside `profile/` is listed under
`"own"` in `.base-sync.json`.
