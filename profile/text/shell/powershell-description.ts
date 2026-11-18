/**
 * The `powershell` tool's model-facing description (pure).
 *
 * The body is the same on every machine except for one section about the
 * detected PowerShell edition: PowerShell 7+, Windows PowerShell 5.1, or
 * unknown, which is treated as 5.1. The tool spawns a fresh process per call
 * in the session's working directory (lib/shell-run/shell-spawn.ts), with
 * -NonInteractive, so the text says that neither a directory change nor
 * shell state carries over and that console prompts cannot be answered. The
 * addendum describes the background runs, the deferred task tools and the
 * `Start-Sleep` guard (tools/powershell/guards.ts); index.ts cuts its
 * sentences that name a tool which is off.
 */

import type { PowerShellEditionName } from "../../../extensions/sdk/profile.ts";

/** The section for each PowerShell edition. */
export const EDITION_SECTIONS: Record<PowerShellEditionName, string> = {
	core: `PowerShell edition: PowerShell 7 or later (pwsh)
   - The chain operators \`&&\` and \`||\` work as they do in bash. Write \`cmd1 && cmd2\` rather than \`cmd1; cmd2\` when cmd2 should run only after cmd1 succeeds.
   - You can use \`??\` (null-coalescing), \`?.\` (null-conditional) and the ternary \`$cond ? $a : $b\`.
   - Files are written as UTF-8 without a BOM by default.`,
	desktop: `PowerShell edition: Windows PowerShell 5.1 (powershell.exe)
   - There are no \`&&\` or \`||\` chain operators: using them is a parse error. To run B only when A succeeds, write \`A; if ($?) { B }\`; to run both regardless, \`A; B\`.
   - There are no ternary (\`?:\`), null-coalescing (\`??\`) or null-conditional (\`?.\`) operators. Use \`if\`/\`else\` and explicit \`$null -eq\` tests.
   - Do not add \`2>&1\` to native programs. In 5.1 that turns every stderr line into an error record (NativeCommandError) and sets \`$?\` to \`$false\` even when the program exited with 0. The tool already collects stderr, so leave it alone.
   - Files are written as UTF-16 LE with a BOM by default. For files other programs will read, pass \`-Encoding utf8\` to \`Out-File\` or \`Set-Content\`.
   - \`ConvertFrom-Json\` gives a PSCustomObject, not a hashtable, and has no \`-AsHashtable\` switch.`,
	unknown: `PowerShell edition: not detected, so write for Windows PowerShell 5.1 to be safe
   - Avoid \`&&\`, \`||\`, the ternary \`?:\`, \`??\` and \`?.\`: they exist only in PowerShell 7 and later and fail to parse in 5.1.
   - To run B only when A succeeds: \`A; if ($?) { B }\`. To run both regardless: \`A; B\`.`,
};

/** The sentence naming the edit tool, which index.ts cuts when it is off. */
export const POWERSHELL_EDIT_LINE = "    - To change a file: the edit tool\n";

/** The description with the edition section left as a slot. */
const TEMPLATE = `Runs a PowerShell command, with an optional timeout. Every command starts in the session's working directory; a change of directory (\`cd\`, \`Set-Location\`) does not last into the next command, and neither does shell state such as variables and functions.

IMPORTANT: use this tool for terminal work in PowerShell, such as git, npm, docker and cmdlets. Do not use it to read, write or change files: the dedicated tools are for that.

{{EDITION}}

Before you run a command:

1. Check the location:
   - When the command creates files or directories, first run \`Get-ChildItem\` (or \`ls\`) to make sure the parent directory exists and is the right one.

2. Run it:
   - Put double quotes around paths that contain spaces.
   - Read the command's output.

PowerShell syntax reminders:
   - Variables start with $: $name = "value"
   - The escape character is the backtick (\`), not the backslash
   - Cmdlets are named Verb-Noun: Get-ChildItem, Set-Location, New-Item, Remove-Item
   - Familiar aliases: cat (Get-Content), rm (Remove-Item), ls (Get-ChildItem), cd (Set-Location)
   - The pipe | passes objects from one command to the next, not lines of text
   - Filter and reshape with Where-Object, Select-Object and ForEach-Object
   - Strings expand variables: "Hello $name", or "Hello $($item.Name)" for an expression
   - The registry is reached through drives such as \`HKLM:\\SOFTWARE\\...\` and \`HKCU:\\...\`, not \`HKEY_LOCAL_MACHINE\\...\`
   - Environment variables: read \`$env:NAME\`, set \`$env:NAME = "value"\`. Neither \`Set-Variable\` nor an \`export\` line sets them
   - To run a program whose path has spaces, use the call operator: \`& "C:\\Program Files\\Tool\\tool.exe" arg1 arg2\`

Unix commands that PowerShell lacks, each with the PowerShell form to use:
   - Line counts (wc -l): \`@(Get-Content file).Count\`
   - Creating a directory tree (mkdir -p): \`New-Item -Force -ItemType Directory path\`; PowerShell has no \`-p\`
   - Deleting a tree (rm -rf): \`Remove-Item path -Force -Recurse\`
   - First or last lines (head, tail): \`Get-Content file -Tail N\` or \`-TotalCount N\`; in a pipeline, \`| Select-Object -Last N\` or \`-First N\`
   - Finding a program (which): \`(Get-Command name).Source\`
   - Creating an empty file (touch): \`if (!(Test-Path path)) { New-Item path -ItemType File }\`. Do not use \`New-Item -Force\` on a file that exists, since it empties it
   - Symbolic links (ln -s): \`New-Item -ItemType SymbolicLink -Target target -Path link\`
   - File modes (chmod, chown): not used on Windows; reach for \`icacls\` only when access rights really must change
   - Discarding errors (2>/dev/null): \`2>$null\`, rarely needed because the tool collects stderr anyway
   - A variable for one command (VAR=x cmd): set \`$env:VAR = 'x'\` first, then run the command; there is no inline prefix
   - bash's \`if [ -f x ]\`, \`for x in *\` and backtick substitution are syntax errors here: write \`if (Test-Path x)\`, \`foreach ($x in ...)\` and \`$(cmd)\`

Exit codes: \`-ErrorAction SilentlyContinue\` hides the error text, but the failed cmdlet still makes this tool report exit code 1. To make a cmdlet failure harmless, wrap it as \`try { Cmdlet ... -ErrorAction Stop } catch {}\`. A non-terminating error only reaches the \`catch\` when \`-ErrorAction Stop\` turns it into a terminating one; otherwise the exit code is still 1.

Prompts and blocking: the tool runs PowerShell with -NonInteractive and with stdin connected to nothing, so a console prompt reads end-of-input or fails at once, while a GUI prompt can hang until the timeout.
   - Never use \`pause\`, \`Read-Host\`, \`$Host.UI.PromptForChoice\`, \`Get-Credential\` or \`Out-GridView\`
   - Destructive cmdlets such as \`Remove-Item\`, \`Stop-Process\` and \`Clear-Content\` may ask for confirmation: add \`-Confirm:$false\` when the action should go ahead, and \`-Force\` for read-only or hidden items
   - Never run \`git rebase -i\`, \`git add -i\` or anything else that opens an interactive editor

Multi-line text for native programs (commit messages, file contents):
   - Use a single-quoted here-string, so PowerShell leaves \`$\` and backticks alone. The closing \`'@\` must stand alone at the very start of its line, because PowerShell rejects it with any indentation. For example:
<example>
git commit -m @'
Subject line of the commit.
More detail, with a literal $ sign.
'@
</example>
   - Prefer \`@'...'@\` (literal) to \`@"..."@\` (expands variables) unless you want the expansion
   - When arguments contain \`-\`, \`@\` or other characters PowerShell would read as operators, put the stop-parsing token before them: \`git log --% --format=%H\`

Using the tool:
  - \`command\` is required.
  - \`timeout\` is optional, in milliseconds, up to 600000 (10 minutes). Without it, a command stops after 120000 ms (2 minutes).
  - A short, clear \`description\` of what the command does helps the user follow along.
  - Output longer than 30000 characters is saved to a file: you get the beginning of it and the path to the rest.
  - \`run_in_background\` runs the command in the background. Use it when you do not need the result now; you are told when it finishes, so there is no need to check on it.
  - Unless the user asks otherwise, do not use PowerShell for work a dedicated tool does:
    - To read a file: the read tool, not Get-Content
${POWERSHELL_EDIT_LINE}    - To write a file: the write tool, not Set-Content or Out-File
    - To tell the user something: plain text in your reply, not Write-Output or Write-Host
  - With several commands:
    - Independent commands can run in parallel: make several powershell calls in one message.
    - Commands that depend on each other go in one call, chained as the edition section above shows.
    - Separate commands with \`;\` only when later ones should run even if earlier ones fail.
    - Do not separate commands with line breaks (line breaks inside quoted strings and here-strings are fine).
  - Do not start commands with \`cd\` or \`Set-Location\` to the project: every command already starts there.
  - Do not \`Start-Sleep\` without a reason:
    - Commands that can run now should run now, with no pause between them.
    - For a long command whose end you want to hear about, use \`run_in_background\`; no sleep is needed.
    - Do not rerun a failing command in a sleep loop. Find out why it fails, or try another way.
    - A background command you started with \`run_in_background\` tells you when it ends, so do not poll it.
    - When you must poll something outside your control, run a check instead of sleeping first.
    - When a sleep is unavoidable, keep it short so the user is not kept waiting.
  - Git habits:
    - Make a new commit instead of amending an earlier one.
    - Before a destructive command (git push --force, git checkout --, git reset --hard), look for a safer way to reach the same goal, and use the destructive one only when it really is the best choice.
    - Unless the user asks for it, do not bypass hooks (--no-verify) or commit signing (-c commit.gpgsign=false, --no-gpg-sign). When a hook fails, find and fix the cause.`;

/** The background-run sentence naming task_stop, and its form when task_stop is off. */
export const POWERSHELL_TASK_TOOLS =
	": you get a task id at once and a task notification when it ends, and task_stop stops it (deferred, so load it with tool_search first). In a one-shot print or json session the command instead runs to the end within the foreground timeout and returns its output directly.";
export const POWERSHELL_NO_TASK_TOOLS =
	": you get a task id at once and a task notification when it ends. In a one-shot print or json session the command instead runs to the end within the foreground timeout and returns its output directly.";

/** The sleep-guard clause naming monitor. */
export const POWERSHELL_MONITOR_CLAUSE = " To wait until a condition holds, use the monitor tool (deferred, so load it first with tool_search select:monitor).";

/** The sentence pointing at yield, cut when yield is off. */
export const POWERSHELL_YIELD_CLAUSE = " When nothing else is left for you to do until background work reports, call yield to wait for it.";

/** The notes after the body: background runs, the sleep guard and waiting. */
export const POWERSHELL_ADDENDUM = `\n\nA background run starts at once${POWERSHELL_TASK_TOOLS} A command in the foreground that begins with \`Start-Sleep\` is blocked.${POWERSHELL_MONITOR_CLAUSE}${POWERSHELL_YIELD_CLAUSE}`;

/** The body for the detected edition, without the addendum. */
export function powerShellDescriptionBody(edition: PowerShellEditionName): string {
	return TEMPLATE.replace("{{EDITION}}", EDITION_SECTIONS[edition]);
}

/** The description the `powershell` tool ships: the body for the edition, then the addendum. */
export function powerShellToolDescription(edition: PowerShellEditionName): string {
	return `${powerShellDescriptionBody(edition)}${POWERSHELL_ADDENDUM}`;
}
