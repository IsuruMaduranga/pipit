/**
 * The bash tool's model-facing texts (pure): the description in its forms,
 * and the parameter texts.
 *
 * Three forms: a short one for frontier and workhorse models, which gains a
 * bullet against shell reads when auto mode is off, and a long one for cheap
 * and tiny models that is the same in every mode (lib/profile/tool-variants.ts).
 * On the tiny tier, which has dedicated grep, find and ls tools
 * (tools/search-tools/tools.ts), the long form's two `find` bullets give way
 * to a pointer at those tools. The shell tool spawns each command afresh in
 * the session's working directory (lib/shell-run/shell-tool.ts), so the texts
 * say that a directory change is lost between calls.
 *
 * Sentences naming monitor, Agent or edit are cut by index.ts
 * when those tools are off; their exact strings are listed there.
 */

import type { DescriptionForm } from "../../../extensions/sdk/profile.ts";

/** Sentences naming monitor or edit, which index.ts cuts when the tool is off. */
export const BASH_MONITOR_WAIT = " A `sleep` in the foreground is blocked; to wait until something is true, run an until-loop under monitor.";
export const BASH_MONITOR_STREAM = "  - To follow a background process event by event, use the monitor tool: every line it prints reaches you as a notification. To wait only for the end of a command, run it with run_in_background instead.\n";
export const BASH_MONITOR_SLEEP = "  - A command that opens with a long `sleep` is blocked. To wait for a condition, run an until-loop under monitor (for example `until <check>; do sleep 2; done`) and you are notified when the loop ends. Do not string short sleeps together to get past the block.\n";
export const BASH_EDIT_LINE = " - To change a file: the edit tool, not sed or awk\n";

/** The short form's bullet against shell reads, sent only when auto mode is off. */
export const BASH_AVOID_SHELL_READS_LINE = "- IMPORTANT: do not run `cat`, `head`, `tail`, `echo`, `sed` or `awk` through this tool when a dedicated tool does the job, unless the user asked for the shell command or you have checked that no dedicated tool can do it. The dedicated tools are easier for the user to follow and review.\n";

/** The short form outside auto mode. */
export const BASH_SHORT_DESCRIPTION = `Runs a bash command and returns what it printed.

- Each call begins in the session's working directory; a \`cd\` in one call has no effect on the next. Use absolute paths: a \`cd\` inside a compound command can cause a permission prompt. Shell state such as variables and functions is not kept either.
${BASH_AVOID_SHELL_READS_LINE}- You see the output; the user may not.
- \`timeout\` is in milliseconds: 120000 by default, at most 600000 for a command in the foreground.
- \`run_in_background\` detaches the command: it goes on running across turns, and you are woken when it exits. Do not add \`&\`.${BASH_MONITOR_WAIT}

# Git
- Interactive flags (\`-i\`, as in \`git rebase -i\` or \`git add -i\`) cannot work here.
- Use the \`gh\` command for GitHub: pull requests, issues, the API.
- Only commit or push at the user's request. On the default branch, create a branch first.
- If a system reminder in the conversation gives attribution lines, end commit messages and pull request descriptions with them.`;

/** The long form (every permission mode). */
export const BASH_LONG_DESCRIPTION = `Runs a bash command and returns what it printed.

Each command begins in the session's working directory. A change of directory (\`cd\`) is lost when the command ends, and so is shell state (variables, functions).

IMPORTANT: avoid running \`cat\`, \`head\`, \`tail\`, \`echo\`, \`sed\` or \`awk\` through this tool when a dedicated tool does the job, unless the user asked for the shell command or you have checked that no dedicated tool can do it:

 - To read a file: the read tool, not cat, head or tail
${BASH_EDIT_LINE} - To write a file: the write tool, not echo with a redirect or cat with a heredoc
 - To tell the user something: plain text in your reply, not echo or printf
The shell can do these things too, but the dedicated tools are easier for the user to follow, review and approve.

# Running commands
 - Before a command creates files or directories, run \`ls\` to check that the parent directory exists and is the right place.
 - Put double quotes around any path that contains spaces, for example: ls "My Documents/report.txt"
 - Stay in the working directory: use absolute paths instead of \`cd\`, unless the user asks you to change directory. Never put \`cd <working directory>\` in front of a \`git\` command; git already works on the current tree, and the compound command causes a permission prompt.
 - \`timeout\` is optional, in milliseconds, up to 600000 (10 minutes) for a command in the foreground. Without it, a command stops after 120000 ms (2 minutes).
 - \`run_in_background\` runs the command in the background. Use it when you do not need the output right away: you are notified when the command finishes, so there is no need to check on it, and no need for a trailing \`&\`.
 - Git habits:
  - Make a new commit instead of amending an earlier one.
  - Before a destructive command (git push --force, git checkout --, git reset --hard), look for a safer way to reach the same goal, and use the destructive one only when it really is the best choice.
  - Unless the user asks for it, do not bypass hooks (--no-verify) or commit signing (-c commit.gpgsign=false, --no-gpg-sign). When a hook fails, find and fix the cause.
 - Do not \`sleep\` without a reason:
  - Commands that can run now should run now, with no pause between them.
${BASH_MONITOR_STREAM}  - For a long command whose end you want to hear about, use \`run_in_background\`; no sleep is needed.
  - Do not rerun a failing command in a sleep loop. Find out why it fails.
  - A background command you started with \`run_in_background\` tells you when it ends, so do not poll it.
${BASH_MONITOR_SLEEP} - Run \`find\` from \`.\` or a specific directory, never from \`/\`: walking the whole filesystem can use up the machine's resources.
 - In \`find -regex\` with alternatives, list the longest alternative first: \`'.*\\.\\(tsx\\|ts\\)'\` finds both kinds of file, while \`'.*\\.\\(ts\\|tsx\\)'\` misses the \`.tsx\` files without any warning.


# Making a git commit

Commit only when the user asks you to; if you are not sure they want one, ask. When they do, follow these steps.

Independent commands can go in one response as parallel tool calls; the steps below say which ones to batch.

Rules for git:
- Never change the git configuration.
- Without an explicit request from the user, never run destructive git commands (reset --hard, push --force, clean -f, branch -D, checkout ., restore .). Running them unasked can destroy work.
- Never skip hooks (--no-verify, --no-gpg-sign and the like) unless the user explicitly asks.
- Never force-push to main or master; if the user asks for it, warn them first.
- Make a NEW commit; amend only when the user explicitly asks. A pre-commit hook that fails means the commit did not happen, so an --amend at that point would change the commit before it and can lose work. After a hook failure, fix the problem, stage again and make a new commit.
- Stage files by name. "git add -A" and "git add ." can pick up secrets (.env, credential files) or large binaries.
- Never commit unless the user explicitly asks for a commit.

1. Run these at the same time, each as its own bash call:
  - git status, to see untracked files. Never pass -uall: it can exhaust memory on large repositories.
  - git diff, to see staged and unstaged changes.
  - git log, to see recent commit messages and match their style.
2. Look at everything that will be committed (what was already staged and what you add) and draft a message:
  - Say what kind of change it is (a new feature, an improvement to one, a fix, a restructuring, tests, documentation) and use the verb that fits: "add" for something wholly new, "update" for an improvement, "fix" for a bug fix.
  - Leave out files that probably hold secrets (.env, credentials.json and similar). If the user asks to commit them, warn them.
  - Keep the message to one or two sentences about why the change was made more than what it does.
3. Then run these at the same time:
   - Stage the relevant untracked files.
   - Commit, ending the message with the attribution lines a system reminder in the conversation gives, if there are any.
   - Run git status once the commit is done, to check it worked.
   Note: that git status has to wait for the commit, so run it after the commit, not alongside it.
4. If a pre-commit hook makes the commit fail, fix the problem and make a NEW commit.

Also:
- Run nothing besides git commands here: no reading or exploring code.
- Do not call the Agent tool here
- Do not push unless the user explicitly asks you to.
- IMPORTANT: never use git commands with -i (such as git rebase -i or git add -i); they wait for input this tool cannot give.
- IMPORTANT: git rebase does not accept --no-edit, so do not pass it.
- When there is nothing to commit (no untracked files and no changes), do not make an empty commit.
- Always pass the commit message through a heredoc so its formatting survives, like this:
<example>
git commit -m "$(cat <<'EOF'
   The commit message.
   EOF
   )"
</example>

# Opening a pull request
Use the gh command in bash for everything on GitHub: issues, pull requests, checks and releases. When you are given a GitHub URL, use gh to fetch what you need from it.

IMPORTANT: when the user asks for a pull request, follow these steps.

1. Run these bash commands at the same time to learn the state of the branch since it left the main branch:
   - git status, for untracked files (never with -uall)
   - git diff, for staged and unstaged changes
   - whether the branch has an upstream on the remote and is behind or ahead of it, to know whether you must push
   - git log and \`git diff [base-branch]...HEAD\`, for the whole history of the branch since it left the base branch
2. Look at every change the pull request will contain, across ALL of its commits and not only the latest one, and draft a title and a description:
   - Keep the title short, under 70 characters
   - Put details in the description, not in the title
3. Then run these at the same time:
   - Create a branch if one is needed
   - Push with -u if needed
   - Open the pull request with gh pr create in the format below, passing the description through a heredoc so it keeps its formatting. End the description with the attribution lines a system reminder in the conversation gives, if there are any.
<example>
gh pr create --title "Short title of the change" --body "$(cat <<'EOF'
## Summary
<one to three bullet points>

## Test plan
[A markdown checklist of how to test the change...]
EOF
)"
</example>

Also:
- Do not call the Agent tool here
- Give the user the pull request's URL when you are done.

# Other common commands
- Read the comments on a GitHub pull request: gh api repos/owner/repo/pulls/123/comments`;

/** The long form's two `find` bullets, which the tiny tier's search tools replace. */
const SHELL_FIND_LINES = ` - Run \`find\` from \`.\` or a specific directory, never from \`/\`: walking the whole filesystem can use up the machine's resources.
 - In \`find -regex\` with alternatives, list the longest alternative first: \`'.*\\.\\(tsx\\|ts\\)'\` finds both kinds of file, while \`'.*\\.\\(ts\\|tsx\\)'\` misses the \`.tsx\` files without any warning.
`;
const SEARCH_TOOLS_LINE = ` - Search with the dedicated tools instead of this shell: the find tool for file names, the grep tool for file contents, the ls tool to list a directory.
`;

/** The long form on the tiny tier, whose grep, find and ls tools replace shell searches. */
export const BASH_LONG_SEARCH_TOOLS_DESCRIPTION = BASH_LONG_DESCRIPTION.replace(SHELL_FIND_LINES, SEARCH_TOOLS_LINE);

/** The description for a form and permission mode; `searchTools` when the session has the dedicated search tools. */
export function bashDescription(form: DescriptionForm, autoMode: boolean, searchTools = false): string {
	if (form === "long") return searchTools ? BASH_LONG_SEARCH_TOOLS_DESCRIPTION : BASH_LONG_DESCRIPTION;
	return autoMode ? BASH_SHORT_DESCRIPTION.replace(BASH_AVOID_SHELL_READS_LINE, "") : BASH_SHORT_DESCRIPTION;
}

/** The parameter descriptions. */
export const BASH_PARAMS = {
	command: `The bash command to run`,
	timeout: `Optional limit in milliseconds (at most 600000 for a command in the foreground)`,
	description: `A short, plain description of what the command does, in the active voice. Describe the effect only; do not label commands with words like "complex" or "risk".

Write it for a reader who may not see the command: say what it does in ordinary words rather than repeating the command, its flags or its paths.

For a simple command (git, npm, everyday tools), five to ten words are enough:
- ls → "List the files in this directory"
- git status → "Show the state of the working tree"
- bal build → "Build the Ballerina package"

For a command that is hard to read at a glance (pipes, unusual flags), add enough to make it clear:
- find . -name "*.log" -mtime +7 -delete → "Delete log files older than a week"
- git reset --hard origin/main → "Drop local changes and match the remote main branch"
- curl -s url | jq '.items[].id' → "Fetch the JSON and list the item ids"`,
	run_in_background: `True to run the command in the background.`,
} as const;
