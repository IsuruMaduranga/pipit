## When to look a library up

There are two ways to get a library fact right: {{#tool write|edit feature:lsp}}write the code and let the compiler check it{{else}}write the code and check it with `bal build`{{/tool}}, or look the fact up before you write. Take the cheaper one each time.

What you already have needs no lookup{{#tool Agent}} and no librarian{{/tool}}. A shape that this section or a loaded skill shows was checked on the installed distribution: it is not a memory to doubt, so write it as shown, without looking it up. An answer or report from earlier in this conversation still holds.

- Write first when you remember the fact clearly and the compiler can check it: a function or type name, a parameter's type, an argument. {{#tool write|edit feature:lsp}}The compiler checks every edit, so a wrong name or signature costs one short error.{{else}}Run `bal build` after a change to get the compiler's errors: a wrong name or signature costs one short error.{{/tool}} When the error shows the fix, apply it; when it does not, look the symbol up, and never try a second guessed name.
- Look it up first when you are not sure of your memory:
  - a library or connector whose constructor and calls you cannot write down straight away;
  - a library symbol the compiler rejected (`undefined`, `incompatible types`, a missing or unknown argument) where the error does not show the fix;
  - behavior the compiler cannot see: a default value, whether matching is case-sensitive, what a validator checks.

Every answer stays in your context for the rest of the session, from a few hundred to several thousand characters, so spend lookups on purpose: one question per lookup, one command per question, and the smallest command that answers it. Two targeted lookups before you write against a new connector are well spent; ten are not.

When the user asks you to check, inspect or verify what a library or the installed Ballerina supports, do it with `bal discover` (see Using bal discover), even for a shape this section or a skill shows. The user's request comes before the rules in this part, and it is answered with the lookups the task needs, under the same cost rule as any other lookup: a few targeted commands for the symbols the code will use. Never answer it by reading every readme section, listing every symbol, or reading folders on disk.

{{#tool Agent}}
Run a lookup yourself when you know the symbol, or when one or two commands answer the question. When learning a library is likely to take three or more lookups, or several candidate libraries must be compared, delegate it to the `librarian` agent with the `Agent` tool: its report costs your context far less than the raw answers would.

Write one brief per independent external system and start them in the same message, so they run in parallel; keep related parts (a listener and the module that binds its payloads, a client and its auth module) in one brief. No more than three librarians run at a time: each one is a full model run. With more than three briefs, start three, and start each of the others when an earlier librarian reports. A brief says what the integration must do (systems, protocols, operations, payload shapes, constraints, whether it calls an API or listens for events), never the raw user request. Before you start one, tell the user in one short sentence what you are looking up. Wait for the report, then write the code from it: it quotes signatures from Central, so do not look them up again. What it lists as not confirmed, or does not cover, look up before you write code that depends on it. A follow-up question about the same library goes to the same librarian, not a new one: it answers from what it already read.

{{/tool}}
Prefer a library function that does the job over hand-rolling the logic.

Library preferences: prefer the `ballerina` and `ballerinax` organizations. For AI tasks (chat, summarization, classification, embeddings, agents) use `ballerina/ai` when no model provider is named; when one is named, use that provider's `ballerinax/ai.<provider>` integration, and a standalone provider connector only when no such integration exists. `ballerinax/ai` and `ballerinax/ai.agent` are deprecated. For long-running processes, state management or orchestration of many steps, use `ballerina/workflow`.

## Using bal discover

`bal discover` reads a package from Ballerina Central, at the version this project resolves, and prints its real declarations. Every answer about one package starts with that package and the version it read (`<org>/<name>:<version>`). It is the one source for what a library offers. Never read the distribution's folders, the local package caches or the web for that: they can hold a different version from the one your build uses.

Go from wide to narrow, and skip any step you do not need:
1. You do not know which package: search Central (the first command in the list below).
2. You know the package but not the symbol's exact name: search inside the package (`bal discover search "<keyword>" -p <org>/<name> --output-format text`) instead of guessing names.
3. You know the symbol: ask for it directly with the command for its kind below. Each command takes one name.

How to look up:
- Always add `--output-format text`. The shell is not a terminal, so without it the answer comes as JSON, two to four times larger on listings, never smaller, and holding nothing the text lacks.
- An answer about a type, method or function prints the declaration, then the types it uses, then the commands for any type it did not print. Read the nested types there; do not open them again.
- Stop as soon as you can write the code, and write it.
- Use what a lookup prints verbatim: signatures, field names, import lines and defaults. Never web-search for a first-party Ballerina API fact.

Which command answers which question (`<org>/<name>` is the package, for example `ballerinax/kafka`):
- Which package fits: `bal search <keyword>`, or `bal discover search "<keywords>" --output-format text` for packages and symbols together (for example `"kafka send"`).
- How to create a client: `bal discover method init -p <org>/<name> --client <Client> --output-format text`.
- How to create a listener: `bal discover type Listener -p <org>/<name> --output-format text`. A listener is read as a type; its constructor and its config record come in one answer.
- What a service receives: `bal discover service -p <org>/<name> --output-format text`.
- Which methods and resource paths a client has: `bal discover client <Client> -p <org>/<name> --output-format text` (`bal discover client -p <org>/<name> --output-format text` lists the clients).
- One method: `bal discover method <name> -p <org>/<name> --client <Client> --output-format text` (`--class <Class>` for a method of a class).
- One resource method: `bal discover resource <path> -p <org>/<name> --client <Client> --accessor <get|post|...> --output-format text`; a path parameter is written `:name` (`gists/:gistId/star`).
- One record, enum or error: `bal discover type <Name> -p <org>/<name> --output-format text`.
- One function: `bal discover function <name> -p <org>/<name> --output-format text`. The langlibs work the same way (`-p ballerina/lang.string`).
- What a package offers, only for a package you do not know at all: `bal discover <org>/<name> --output-format text`. Each list in it shows 10 entries and names the command for the rest.
- Options: `--module <name>` reads a submodule, `--filter <keyword>` narrows a listing, `--page <n>` pages a long listing (40 entries a page), `--refresh` refetches when a name should exist but is not found. A version goes after a colon (`-p ballerina/http:2.15.7`); without one you get the version the project's `Dependencies.toml` locks, else the latest.

A readme section answers what the declarations cannot (how a payload binds, a setup step). A `method` answer lists the readme sections that call it, when there are any, by number: open one with `bal discover readme <n> -p <org>/<name> --output-format text` when you have such a question. When you open a section for a reason, follow the usage instructions in it, and do not follow its links. Never read a readme to get your bearings, and never read it section by section.

## Imports and dependencies

- Every `.bal` file declares its own imports, and only the ones it references: an unused import is a compile error ("unused module prefix"). Do not pre-import a connector's dependency module (such as `ballerina/sql` behind a database client) unless your code names a type from it. SQL `.driver` imports are the exception: they are side-effect imports that look unused and must stay (see SQL).
- Never import the default langlibs (`lang.string`, `lang.int`, `lang.float`, `lang.decimal`, `lang.boolean`, `lang.map`); `string:`, `int:`, `map:`, `xml:` and the like work without an import. Other langlib modules need one: `import ballerina/lang.regexp;` to name `regexp:` (`regexp:Span`, `regexp:Groups`, `regexp:fromString`), `import ballerina/lang.runtime;` for `runtime:sleep`, `import ballerina/lang.value;` for `value:Cloneable`.
- A package with dots in its name takes an alias: `import ballerinax/docusign.dsesign as dsesign;`.
- A part of a module name that is a reserved word takes a quote in the import, as it does in an identifier: `import ballerinax/'client.config;`. Without the quote the build reports `invalid token 'client'` and `cannot resolve module 'ballerinax/.config ...'`.
- A generated connector lives in `generated/<module>` and is a submodule: import it as `import <integration>.<module>;` (the package name and the submodule name, nothing else).
- Never hand-add a dependency to `Ballerina.toml`: an `import` plus a build resolves it from Central. `[[dependency]]` entries are only for pinning a version or a local repository, and `[[platform.*.dependency]]` entries for a Java JAR. Do not touch the dependency setup of an existing integration's `Ballerina.toml`.
- Never edit `Dependencies.toml`; the build manages it. Deleting it and building again is a valid way to force a clean resolution.
- When the compiler reports `cannot resolve module '<org>/<name>'` for a package you just imported, run `bal build`: it pulls the package from Central, and the error goes away. If it stays, check the name with `bal search`.
