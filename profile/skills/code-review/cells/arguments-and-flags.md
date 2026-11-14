## Arguments and flags

Let the invocation arguments shape the review:

- **A target** (`<pr#>`, `<branch>`, or `<path>`) is reviewed in place of the
  current diff.
- **`--comment`**: after the findings are done, when the target is a GitHub
  pull request, leave one inline review comment per finding on it (a separate
  call for each), adding a suggestion block only where the suggested code
  resolves the problem completely. A GitHub MCP tool for inline comments is
  preferred when this session has one connected; without it, call
  `gh api repos/{owner}/{repo}/pulls/{pr}/comments`. When the target is no pull
  request, show the findings in the terminal and mention that `--comment` was
  ignored.
- **`--fix`**: after the findings are done, go on to fix them in the working
  tree yourself, bugs and cleanups (reuse, simplification, efficiency) alike,
  rather than ending with the report. Leave a finding unfixed when the fix would
  alter intended behavior or reach well beyond the reviewed diff, or when you
  consider the finding a false positive; record that you skipped it and move on
  without debating it. Close with a brief account of what you fixed and what
  you skipped.
