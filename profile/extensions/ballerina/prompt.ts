/**
 * The `# Ballerina` section of the system prompt (announced by index.ts).
 *
 * The text is in the templates under `prompt/`, read top to bottom in the
 * order of `PARTS`: the opening rules, how to think and work, the BI project
 * layout and designer rules, when to look a library up and how to use
 * `bal discover`, the coding rules, data binding, concurrency, HTTP, SQL and
 * events, the langlibs, configuration through `config_status`, building,
 * running and testing with the shell, the common errors and the syntax
 * skeletons. Every tier gets the same text: the skeletons give every model
 * correct shapes to write from.
 *
 * Ballerina is thin in a model's training and its libraries move between
 * releases, so the text tells the model to settle a library fact with a
 * tool, not by reasoning: write it and let the compiler check it when the
 * memory is clear, look it up with `bal discover` first when it is not.
 * Learning a library goes to the `librarian` agent once three or more
 * lookups are likely.
 *
 * Byte-stable: a pure function of the tools the session can have. The
 * templates are read once, when this module loads, never at render time;
 * no dates, no environment probing. A passage that names a tool is marked
 * in its template (template.ts has the syntax) and follows `live`, the tools
 * the session can have (fixed for the process, pi's `--tools` and
 * `--exclude-tools` included), never the active `tools`, which grow when a
 * deferred tool loads (`lsp_diagnostics`, `task_output` and `task_stop` are
 * deferred) and would change these bytes mid-session.
 *
 * Two conditions recur. `write|edit` is a file tool: without one there is
 * no rule about how `.bal` files change. `write|edit lsp_diagnostics` means
 * the compiler's errors arrive after each edit: only then does the text
 * promise them. With a file tool and no `lsp_diagnostics` the text neither
 * promises nor denies the `<new-diagnostics>` block, which the base's `lsp`
 * feature adds whether or not its tool is live (the section sees tools, not
 * features; seeing features needs a base seam).
 */

import { readFileSync } from "node:fs";
import type { SectionSession } from "../../../extensions/sdk/extension.ts";
import type { LiveTools } from "../../../extensions/sdk/profile.ts";
import { parseTemplate, render, type Template } from "./template.ts";

/** The templates, in the order the section joins them. */
const PARTS = ["overview", "library-lookup", "code-rules", "domains", "langlibs", "running", "syntax-skeletons"] as const;

/**
 * Every tool a template may name in a block: the tools the section's
 * passages follow. A name outside it fails at load. The deferred
 * `SendMessage` is not here: the section never names it.
 */
export const SECTION_TOOLS: ReadonlySet<string> = new Set([
	"write",
	"edit",
	"lsp_diagnostics",
	"skill",
	"Agent",
	"ask_user_question",
	"task_output",
	"task_stop",
	"create_integration",
	"config_status",
]);

/** The file tools, in the order the text names them. */
const FILE_TOOLS = ["write", "edit"] as const;

/** Every value name a template may use. A name outside it fails at load. */
const VALUE_NAMES = ["fileTools", "anyFileTool"] as const;
export const SECTION_VALUES: ReadonlySet<string> = new Set(VALUE_NAMES);
type SectionValues = Record<(typeof VALUE_NAMES)[number], string>;

/**
 * The values a template may use (`{{name}}`), each a pure function of the
 * tools the session can have, so a value never names a tool it lacks:
 * `fileTools` lists the file tools joined by "and" ("`write` and `edit`"),
 * `anyFileTool` joined by "or". Both are empty without a file tool; the
 * templates use them only inside a `write|edit` block.
 */
export function valuesFor(live: LiveTools): SectionValues {
	const names = FILE_TOOLS.filter((tool) => live.has(tool)).map((tool) => `\`${tool}\``);
	return { fileTools: names.join(" and "), anyFileTool: names.join(" or ") };
}

/** A template's source, with the file's line endings and its final newline dropped. */
function source(part: string): string {
	return readFileSync(new URL(`./prompt/${part}.md`, import.meta.url), "utf8").replace(/\r\n/g, "\n").replace(/\n$/, "");
}

/** The parsed templates, checked once at load. */
export const TEMPLATES: readonly Template[] = PARTS.map((part) => parseTemplate(source(part), SECTION_TOOLS, `prompt/${part}.md`, SECTION_VALUES));

/** The section for the session: the same text on every tier; the tools the session can have (`live`) decide the passages that name a tool. */
export function ballerinaSection(session: SectionSession): string | undefined {
	const values = valuesFor(session.live);
	return TEMPLATES.map((template) => render(template, session.live, values)).join("\n\n");
}
