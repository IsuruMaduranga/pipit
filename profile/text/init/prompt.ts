/**
 * The `/init` prompt: it has the model survey the repository and write the
 * project's instruction file, which every later session loads. The base
 * submits it as a user turn (extensions/commands/init/index.ts) for the file
 * a user writes in this product, `AGENTS.md` (lib/context/instructions.ts
 * `instructionTargets`), and the model does the work with its ordinary tools.
 *
 * The prompt names no tool, so it holds whichever tools the session has, and
 * it keeps the values of the project's secret files (Config.toml) out of the
 * file it writes.
 */

/** The prompt for the instruction file `file` (a name such as `AGENTS.md`). */
export function initPrompt(file: string): string {
	const article = /^[aeiou]/i.test(file) ? "an" : "a";
	return `Study this repository and write ${article} ${file} at its root: a short file that every future coding-agent session in this repository loads before it starts. Keep it lean. A line earns its place only if a future session would get something wrong, or waste time finding it out again, without it.

## 1. Survey
Read the repository yourself when it is small; for a large one, have a subagent survey it if you can. Collect:
- How to build, test and lint, especially project-specific scripts, unusual flags and how to run a single test. For a Ballerina package, that includes the \`bal\` commands the project uses and anything particular in its Ballerina.toml.
- The languages, frameworks and package managers, and whether this is one package or a tree of several.
- The architecture a newcomer only sees after reading several files together: how the system is divided and why. Not a directory listing.
- Setup traps: required environment variables, steps that fail without saying so, surprises in the development workflow.
- Instructions already written for other coding tools (.cursor/rules, .cursorrules, .github/copilot-instructions.md, .windsurfrules, .clinerules and similar), and whatever in README.md matters to an agent.

## 2. Ask about the gaps
Ask the user only what the repository cannot tell you, such as branch and pull request conventions, required local setup, testing quirks or how they want to be addressed. Skip what a manifest or the README already says. Do not mark any answer option as recommended: you are recording how this team works, not judging it.

## 3. Write ${file}
Start the file with:

\`\`\`
# ${file}

Guidance for AI coding agents working in this repository.
\`\`\`

Put in: commands an agent could not guess, style rules the team enforces beyond the language's defaults, how tests really run and what is odd about them, repository etiquette (branch names, commit and pull request conventions), required environment variables and setup, the traps and architecture you found in step 1, and the parts of other tools' instructions that matter.

Leave out: file-by-file structure or lists of components (an agent can read the tree), conventions any competent developer follows, general advice such as "write clean code", long reference material (name the file that holds it instead of copying it in), and anything that changes often (point to where it is kept). Never copy secret values into the file, such as the contents of Config.toml or of any credentials file.

Each rule must be concrete: "Ballerina code uses 4-space indentation" tells an agent something, "format code properly" does not. Do not invent sections: a topic that did not come from the repository or from the user does not appear.

If ${article} ${file} already exists, read it first, then propose specific changes as diffs and explain each one. Do not overwrite it without saying so. When subdirectories are separate projects, mention that ${article} ${file} inside a subdirectory is loaded when work reaches files there, and offer to write those too.

## 4. Report
Say which files you wrote and the main points of each. Remind the user that the file is a starting point for them to review and adjust, and that \`/init\` can be run again at any time to survey the repository afresh.`;
}

/** The prompt for the file this product writes. */
export const INIT_PROMPT = initPrompt("AGENTS.md");
