Recipe: maximum effort. 10 finder angles with up to 8 candidates each, one verifier per candidate, then a pass for gaps, at most 15 findings.

This review aims for **recall** at maximum effort: no real bug should get
past you. A bug you miss goes out with the release, which costs more than a false alarm,
so report what you are unsure about.

## Step 0: Collect the diff

Start from `git diff @{upstream}...HEAD`. If the branch has no upstream, fall back to `git diff main...HEAD` or `git diff HEAD~1`. A review often comes before the commit, so also include `git diff HEAD` whenever the working tree holds uncommitted work or the range diff comes back empty. If the arguments name a PR number, a branch, or a path, review that instead. Whatever you collect here is the scope.

## Step 1: Find candidates (10 angles: 5 for bugs, 3 for cleanup, one for altitude, one for conventions; at most 8 candidates per angle)

Hand the **10 angles below to 10 independent finders** through the Agent tool, one angle each. A finder reports **at most 8 candidates**. Each candidate states `file`, `line`, `summary` (one line), and `failure_scenario` (a concrete way it fails).
Angles must not overrule each other: if two of them flag one line for two different reasons, both candidates stay.
No Agent tool in this session? Then don't fail: run every angle, and later every verification, yourself in this context, one at a time.

### Angle A: line by line

Take the hunks one line at a time. After each hunk, open the complete function
it sits in: unchanged lines in a function the diff touches are in scope too,
since the change can expose an old bug or fail to fix it. Ask of every line
what input, state, timing, or platform would make it misbehave. The usual
suspects: a condition that is inverted or simply wrong, an off-by-one, a null
or undefined dereference, a forgotten `await`, a zero mistaken for "missing",
a pasted line still naming the old variable, an exception caught and silently
dropped, an unescaped regex metacharacter.

### Angle B: what the diff removes

Each deleted or rewritten line used to guarantee something. Say what, then find
where the new code guarantees it. When nothing does, that is a candidate: a
check that vanished, an error path no longer handled, validation that accepts
more than before, a removed test that was guarding a real case.

### Angle C: across files

Search for the callers of every function the diff modifies, and test each call
site against the new behavior: an extra precondition, a changed return shape,
an error that was not thrown before, a new reliance on timing or order. Look
the other way as well: does some other part of the same diff make a call this
function makes unsafe?

### Angle D: language traps

Every language and framework has its well-known traps; flag each one the diff
brings in. Some examples. JavaScript: zero read as false, `==` coercion, a loop
variable captured by a closure. Python: mutable default arguments, closures
that bind late. Go: writing to a nil map, capturing the range variable.
Ballerina: a `check` that passes an error up to a caller that cannot handle
it, `checkpanic` or an unchecked cast (`<T>`) on a value that can fail at run
time, an optional (`T?`) value used as if it were present, a `match` over an
open set with no default arm, `cloneWithType` on a payload that may not fit,
mutable module-level state reached from a service without `isolated` or
`lock`. Anywhere: SQL built by string concatenation, time-zone and
daylight-saving drift, comparing floats for equality.

### Angle E: wrappers and proxies

When the diff adds or changes a type that wraps another one (a cache, proxy,
decorator, adapter, or client wrapper), make sure each of its methods calls
through to the wrapped object and does not loop back through a registry,
session, or global. For instance, a caching layer that keeps a `delegate` yet
resolves ids with `session.get(...)` instead of `delegate.get(...)` ends up
calling itself again. Make sure, too, that the wrapper forwards every method
its callers rely on.

### Reuse

Angles A to E hunt bugs. This angle and the next two hunt cleanup
opportunities in the changed code. Look for new code that duplicates what the
codebase already provides: search the shared and utility modules, and the files
beside the change, and when you find an existing helper, name it as the thing
to call.

### Simplification

Look for complexity the diff adds that the job does not need: state that
duplicates other state or could be computed, copies of the same code with small
differences, nesting several levels deep, code nothing reaches any more. Say
what the simpler version would be.

### Efficiency

Look for waste the diff brings in: the same value computed or fetched more than
once, independent steps run in sequence instead of together, slow blocking work
added to startup or a hot path. Long-lived objects created from closures count
too: a closure holds its whole surrounding scope for the object's lifetime, so a
large value in that scope is never freed, while a class or struct holding just
the fields it uses has no such problem. Say what the cheaper version would be.

### Altitude

Ask whether each change fixes the cause, at the depth where it lives, or only
papers over a symptom. Special cases bolted onto shared code are the warning
sign. When a simpler, more general change to the mechanism underneath would do,
prefer it and describe it.

### Conventions (AGENTS.md and PIPIT.md)

Collect the instruction files that cover the changed code: the global ones
(`~/.agents/AGENTS.md`, the `AGENTS.md` in pi's agent directory, and
`~/.pipit/PIPIT.md`), the `AGENTS.md` and `PIPIT.md` at the repository root,
and any `AGENTS.md` or `PIPIT.md` in a folder above a changed file (a folder's
file covers only what is inside that folder). Open those that exist and look
for lines in the diff that plainly break a rule they state.

A breach counts only when you can quote the rule word for word and point at
the line that breaks it; taste and loose interpretation do not count. Put the
instruction file's path and the quoted rule into the finding, so the report can
cite both. When no instruction file covers the change, this angle reports
nothing.

Findings from the cleanup, altitude, and conventions angles use the same
fields as bug findings, but their `failure_scenario` describes the price paid
(duplication, wasted work, a maintenance burden, the instruction-file rule that
is broken) rather than a crash. If the output limit forces a cut, bugs stay and
these go first.

## Step 2: Verify (a single vote with three possible outcomes)

First merge duplicates: candidates about the same line or the same mechanism
become one, and the one with the clearest failure scenario survives. Then give
every surviving candidate **its own verifier** through the Agent tool. The
verifier receives the diff, the files that matter, and the candidate, and
returns one verdict:

- **CONFIRMED**: it names the input or state that triggers the problem and the
  wrong output or crash that results, quoting the line.
- **PLAUSIBLE**: the mechanism holds but the trigger is not certain (it depends
  on timing, environment, or configuration). It names what would settle it.
- **REFUTED**: the claim does not match the code, or a guard elsewhere already
  prevents it. It quotes the line that proves this.

CONFIRMED and PLAUSIBLE candidates stay; REFUTED ones go.

Recall comes first at this level: a single vote other than REFUTED is enough
to keep a finding, and doubt alone is never a reason to drop one.

## Step 3: Look for what was missed

Start **one more finder** that plays a fresh reviewer and receives the verified
list. Its only task is defects the list does not contain yet: it rereads the
diff and the functions around each hunk, and it neither re-derives nor
re-checks listed items. Typical blind spots of a first pass: code that moved or was
extracted and left a guard or anchor behind; less famous traps such as a
dataclass default that is evaluated only once, `hash()` results that change
between runs, a lock that now covers less code, or a predicate method that
changes state; test setup and teardown that no longer mirror each other; a
configuration default whose value flipped.

It may add **at most 8 candidates**, each a defect not on the list. When nothing
new turns up it adds nothing; it never pads.

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
to the 15 most severe. When verification leaves nothing, the output is `[]`. Nothing besides this
JSON array is part of the review's result.
