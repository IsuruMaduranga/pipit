Recipe: low effort. One pass over the diff, no verification, aiming for min(files changed, 4) findings.

## Turn 1: read

Read the unified diff in a single tool call. `git diff @{upstream}...HEAD; git diff HEAD`
takes in both committed and uncommitted changes; otherwise use
`git diff main...HEAD`, or the target named in the arguments. Leave out hunks
in test and fixture files (`test/`, `tests/`, `spec/`, `__tests__/`,
`*_test.*`, `*.test.*`, `fixtures/`, `testdata/`): at this level, test
changes are not reviewed. Start no subagents and don't read whole files.

## Turn 2: findings

Report bugs you can see in the hunk itself that would misbehave at run time: an
inverted or wrong condition, an off-by-one, a null or undefined dereference
where the neighboring lines show the value may be absent, a guard that was
taken out, a zero mistaken for "missing", a forgotten `await`, a pasted line
still naming the old variable, an exception swallowed where it ought to
propagate. Two cleanup cases count as well, judged from the hunk alone: new
code repeating a helper that is visible in the surrounding diff, and code the
diff leaves dead.

Leave out style, naming, performance, missing tests, and anything beyond the
hunk.

Aim for **min(files changed, 4) findings**, worst first, a single line each:
`src/orders/service.bal:42: what is wrong, and how it fails`. Short of that, take one more pass over the
largest changed file and over every block of **removed** code. Output `(none)`
only when that pass, too, finds the diff plainly correct.
