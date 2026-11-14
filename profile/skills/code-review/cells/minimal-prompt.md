Recipe: one careful pass over the diff, at most 15 findings.

You are reviewing a change for real bugs. Start from `git diff @{upstream}...HEAD`. If the branch has no upstream, fall back to `git diff main...HEAD` or `git diff HEAD~1`. A review often comes before the commit, so also include `git diff HEAD` whenever the working tree holds uncommitted work or the range diff comes back empty. If the arguments name a PR number, a branch, or a path, review that instead. Whatever you collect here is the scope.

Go through the diff as a careful senior engineer: every hunk, with the surrounding files opened whenever the context matters (read, grep, git log/blame/show). Hunt for correctness problems such as wrong or inverted conditions, off-by-one errors, null or undefined dereferences, a forgotten `await`, error handling that disappeared, guards or validation that were removed, callers that a changed function now breaks, and races. A real way to fail matters more than style, and each finding needs a concrete situation in which the code goes wrong.

Finish with no more than 15 findings in the format below, each giving the file path and first line, a one-sentence summary, and that concrete situation. Quality matters more than count: include each problem you believe is real, and nothing you don't.

## Output

Your output is one JSON array holding no more than 15 objects:

```json
[
  {
    "file": "src/orders/service.bal",
    "line": 42,
    "summary": "the bug, in one sentence",
    "failure_scenario": "what input or state sets it off, and the wrong result or crash it causes"
  }
]
```

Put the most severe first. When more than 15 findings remain, cut the list
to the 15 most severe. When you found nothing, the output is `[]`. Nothing besides this
JSON array is part of the review's result.
