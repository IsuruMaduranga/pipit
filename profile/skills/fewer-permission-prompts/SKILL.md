---
name: fewer-permission-prompts
description: >
  Mine your session transcripts for the read-only shell commands and MCP tool
  calls that keep raising permission prompts, then add a ranked allowlist to
  this repository's Pipit settings so routine commands stop interrupting.
---

# Fewer permission prompts

Find the commands the user keeps approving, keep the ones that are safe by
construction, and turn them into standing allow rules for this repository.

## 1. Find the transcripts

Session transcripts are JSONL files under pi's agent directory, in
`<agent dir>/sessions/`, with one folder per working directory (the path with
its separators replaced by dashes, wrapped in `--`). For the bundled app the
agent directory is `~/.pipit/agent`, or `PIPIT_AGENT_DIR` when that is set; on
a plain pi install it is `PI_CODING_AGENT_DIR`, else `~/.pi/agent`.

Each line is one JSON entry. A tool call is an entry in an assistant message's
`content` with `"type": "toolCall"`, a `name` (such as `bash` or
`mcp__slack__slack_read_thread`), and its `arguments`; a shell call carries the
command line in `arguments.command`.

Scan recent sessions across all project folders, not only this one, so the
list reflects how the user really works. Cap the scan (for example, the 50
most recently modified transcripts) so it stays quick.

## 2. Count the calls

- For shell calls, parse the command line and take the leading command, seeing
  through `sudo`, `timeout`, environment-variable prefixes, pipes, and `&&`.
  Record the command with its first subcommand (`git status`, `gh pr view`,
  `bal build`, `ls`).
- For an MCP call, the whole tool name is the key.
- Count each across the scanned transcripts.

## 3. Keep only what is read-only

Keep commands that cannot change state. Read-only examples, by family:
- files and text: `cat`, `head`, `tail`, `wc`, `file`, `ls`, `pwd`, `find`,
  `grep`, `rg`;
- git: `git diff`, `git log`, `git show`, `git status`, `git branch`;
- GitHub CLI, viewing only: `gh pr diff`, `gh pr view`, `gh pr list`,
  `gh issue list`, `gh issue view`, `gh run view`, `gh run list`;
- containers and clusters: `docker logs`, `docker ps`, `kubectl describe`,
  `kubectl get`;
- the system: `df`, `du`, `ps`, `env`, `printenv`, `which`, `date`, `echo`;
- Ballerina: `bal version`, `bal search`, `bal tool list`;
- any MCP tool whose name says it reads, gets, lists, searches, or views.

Leave out every command that changes something (writing, deleting, renaming,
pushing, merging, publishing, installing, or starting a process with side
effects), however often the user approved it: a one-off approval each time is the right mode for those. That
includes `bal push`, `bal run` (it starts a service), `git push`,
`npm install`, and `rm`. A build or test command is safe only as an exact rule
the user clearly wants (`Bash(bal build)`, `Bash(bal test)`), since it runs
project code. When in doubt, leave it out and say why.

**Never allow a pattern that amounts to running arbitrary code.** A wildcard
rule for any of the following lets the model run anything, and the same goes
for anything else of the same kind:
- interpreters: `node`, `python`/`python3`, `java`, `ruby`, `perl`, `php`,
  `deno`, `bun`, `lua`;
- shells and remote shells: `sh`, `bash`, `zsh`, `fish`, `ssh`, `eval`, `exec`;
- package runners: `npx`, `uvx`, `bunx`, `uv run`;
- task-runner wildcards: `make *`, `just *`, `npm run *`, `pnpm run *`,
  `yarn run *`, `bun run *`, `go run *`, `cargo run *`, `bal run *` (a rule for
  one exact script, such as `Bash(npm run typecheck)`, is acceptable; the
  wildcard `Bash(npm run *)` is not);
- `sudo`, `gh api *`, `kubectl exec`, `docker exec` and `docker run`.

## 4. Leave out what never prompts

Common read-only commands (plain `cat`, `ls`, `git status`, `grep`, and the
like) already run without a prompt in auto mode, and so do `bal search`,
`bal discover`, and `bal version`, so they need no rule. When you are not sure
whether a command is covered, include it: a redundant allow rule does no harm,
while a useful one left out keeps prompting.

## 5. Choose the narrowest pattern

- Many variants of one command (`git diff`, `git diff --stat`,
  `git diff HEAD~3`): `Bash(git diff *)`. The space before `*` is required
  for the prefix to match.
- One exact invocation used often: `Bash(foo)`, with no wildcard.
- MCP tools: the full tool name as it is; it is already specific.
- Never widen a pattern so far that it breaks the rules in step 3.

The lowercase tool name works too (`bash(git log *)`).

## 6. Rank

Sort by count, highest first. Drop anything seen fewer than about 3 times,
and keep at most the top 20 or so, so the list is easy to skim.

## 7. Show the list

Present it as a markdown table with the rank, the rule, how often it was seen,
and a one-line note on what it covers, for example:

| Rank | Rule | Seen | Covers |
|------|------|------|--------|
| 1 | `Bash(git diff *)` | 131 | diff checks |
| 2 | `Bash(bal build)` | 64 | package builds |
| 3 | `mcp__github__get_pull_request` | 38 | pull request reads |

## 8. Write the rules

Merge them into this repository's Pipit settings,
`~/.pipit/projects/<slug>/settings.json`, under `permissions.allow`. The slug is
the repository root's path (the working directory outside a repository) with
every character other than letters, digits, and `-` replaced by `-`. Write
there, not in `~/.pipit/settings.json`: this list is per repository by design.
Create the file if it does not exist. Keep the existing keys and allow
entries, skip rules that are already there, remove nothing, and leave the
order of unrelated fields alone. Add nothing to `permissions.deny` or
`permissions.ask`, and change no other setting.

## 9. Report

Tell the user how many rules you added (with a few examples), which ones were
already in the allowlist, and what you left out and why (for example: "left
out `rm` and `git push`, which change state; left out `cat`, `ls`, and
`git status`, which already run without a prompt").
