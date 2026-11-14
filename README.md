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

## See an integration's diagrams

In an interactive session started inside a BI project, run `/visualize`.
Pipit opens a browser page that draws the integration the way the BI designer
in VS Code does: the overview of services, listeners, connections and the
automation, and the flow of each resource, the automation and each function.
The page is view only and updates within a second after a `.bal` file or
`Ballerina.toml` changes, including files moved, renamed or deleted and new
integrations in the project. Running `/visualize` again opens the same page.
The command returns at once, so you can keep working while it starts.

The page needs the BI designer's language server. The first `/visualize` on a
machine downloads it (about 73 MB) from the `v6.0.1` release of
`ballerina-platform/ballerina-vscode` into `~/.pipit/language-server/`, and
checks its size and SHA-256. It runs on Ballerina 2201.14 (Update 14) with
the distribution's own Java 25. Without it, the session uses
`bal start-language-server`, which gives diagnostics but no diagrams.

- If the session had already started the other language server, Pipit offers
  to reload the session; the conversation is kept. Run `/visualize` again
  after the reload.
- The page is served on `127.0.0.1` at an address with a random token, and
  stops when the session ends.
- On Windows, `/visualize` explains that it is not available, and the session
  keeps the stock language server.
- With `-p` or `--mode`, `/visualize` prints why it needs the interactive
  terminal and starts nothing.

### Rebuild the diagram view's page

The page is a bundle committed under
`profile/extensions/ballerina/visualize/bundle/`. It is built from a
`ballerina-vscode` checkout whose libraries are already built:

```bash
node profile/extensions/ballerina/visualize/build-bundle.mjs ~/wso2/integrator/ballerina-vscode
```

The script reads the checkout and changes nothing in it. It records the
commits it built from in `bundle/build.json`.

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
