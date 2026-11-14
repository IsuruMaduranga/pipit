---
name: simplify
description: >
  Tidy the code that just changed: reuse what exists, simplify, cut waste, and
  put abstractions at the right altitude, then apply the fixes. A quality pass
  only: it does not hunt for bugs (that is /code-review).
argument-hint: "[<target>]"
---

Recipe: four cleanup reviewers in parallel, then apply what they find.

Make the code that just changed smaller, clearer, and more idiomatic while its
behavior stays exactly the same. You are not looking for bugs here; that is
what `/code-review` does.

## Step 0: Collect the diff

Get the changes with `git diff @{upstream}...HEAD`; without an upstream, use
`git diff main...HEAD` or `git diff HEAD~1`. Cleanup often runs before a
commit, so when there are uncommitted changes, or the range comes back empty,
add `git diff HEAD` to the scope as well. When the arguments name a PR number,
a branch, or a path, review that target instead. Files the change does not
touch are context, not scope.

## Step 1: Review on four axes, in parallel

Start **four review agents** through the Agent tool, all in one message so
they run at the same time. Give each the diff and one of the axes below. Each
reports its findings as `file`, `line`, a one-line `summary`, and the price of
leaving it as it is (duplication, waste, or upkeep). If this session has
no Agent tool, don't stop with an error: work through the four axes yourself,
one after another, in this context.

### Reuse

The change rebuilds something that already exists. Search shared and utility
modules and the files next to the change, and say which existing helper should be
called. Typical cases: a hand-written block that a library or langlib function
already does (in Ballerina, `array:filter`, `string:trim`,
`value:cloneWithType`); two new functions that differ only in a type or a
constant; a new record type that repeats an existing one where a type
reference (`*Existing;`) would do.

### Simplification

The same behavior, said shorter and straighter. Flag state that is redundant or
could be derived, near-duplicate copies of the same code, deep nesting, dead
parameters, unused imports, conditions that are always true, and dead code left
behind. In Ballerina: manual error plumbing (`if result is error { return
result; }`) that `check` replaces; loops that build arrays where a query
expression or a langlib call reads better (whichever the file already favors);
nested `if` chains over a union type that `is` narrowing or a `match` statement
flattens; an `is ()` check whose only job is a default, where `x ?: fallback`
says it. Name the simpler form.

### Efficiency

Plain waste, not micro-optimization: computing or fetching the same thing
twice; a query or remote call inside a loop that could run once outside it;
independent operations run one after another; blocking work added to startup
or a hot path; immutable data rebuilt on every call that could be a
module-level `final` or `readonly` value; a copy (`clone`, `cloneWithType`)
where a read-only reference would do. Flag, too, long-lived objects built from
closures or captured scopes: they keep the whole enclosing scope alive, which
leaks memory when that scope holds large values; a class or struct holding
just the fields it uses has no such problem. Name the cheaper option.

### Altitude

The fix or the abstraction sits at the wrong depth. A special case piled onto
shared infrastructure to patch a symptom suggests the fix is too shallow: a
simpler, more general change to the mechanism underneath is better. A
"flexible" parameter, generic helper, or option nothing uses should be inlined
to its one concrete case. New indirection with a single implementation and no
second one in sight should go. Business logic buried in a resource function
belongs in a plain function the service calls, and transport details do not
belong in domain code. Name the change.

## Step 2: Apply the fixes

Once all four reviewers have reported, fold together findings about the same
line or mechanism, then fix the rest yourself. Keep to the file's existing
style, and don't reformat lines the change did not touch. Skip a finding when
its fix would change intended behavior or need changes far outside the
reviewed diff, or when you judge it a false positive; note the skip instead of
arguing it.

Then check that nothing broke: the project still builds (for a Ballerina
package, `bal build`, or the diagnostics reported after your edits) and its
tests still pass (`bal test` when the package has tests, or the project's own
test command). A cleanup that changes behavior is a bug you introduced: if a
check fails, fix it or undo that cleanup.

## Step 3: Report

Say in a few sentences what you cleaned up, in plain words, and what you
considered but left alone, with the reason in one clause. If the change was
already clean, say so and stop.
