/**
 * Plan-mode reminder text (pure): the rules of plan mode and its five-phase
 * workflow, carried by every user message while the mode lasts. The block is
 * anchored in the reminder queue, which keeps the anchor only while the
 * re-sent text is unchanged, so the text must not change while the mode
 * lasts: a change re-anchors the block and re-caches every message after it.
 * The plan-file line depends on whether the file exists; the caller decides
 * that once, when plan mode comes on (`planExists`), and keeps it until the
 * mode ends.
 *
 * The phrases that name edit or ask_user_question are exported so index.ts
 * can cut or replace them, by the same strings, when those tools are off.
 */

/** The plan-file line's phrase naming edit, and its replacement without it. */
export const PLAN_FILE_EDIT = "change it step by step with the edit tool";
export const PLAN_FILE_NO_EDIT = "rewrite it with the write tool";

/** The reminder's phrases naming ask_user_question. */
export const REVIEW_ASK_STEP = "\n3. Settle any open questions with the user through ask_user_question";
export const END_OF_TURN = "with an ask_user_question call or with an exit_plan_mode call. Nothing else ends a turn here";
export const END_OF_TURN_NO_ASK = "with an exit_plan_mode call, unless you stop to ask the user about requirements or the approach";
export const ASK_ONLY_FOR = "Use ask_user_question only to settle requirements or to choose between approaches. ";
export const NO_TEXT_OR_ASK = ": not in plain text and not through ask_user_question.";
export const NO_TEXT = ": not in plain text.";
export const ANY_TIME_ASK = " with ask_user_question.";

/** The plan-file line, for a plan file that exists or not yet. */
export function planFileInfo(filePath: string, planExists: boolean): string {
	return planExists
		? `There is already a plan file at ${filePath}. Read it and ${PLAN_FILE_EDIT}.`
		: `There is no plan file yet. Create your plan at ${filePath} with the write tool.`;
}

export function buildPlanModeReminder(filePath: string, planExists = false): string {
	const fileInfo = planFileInfo(filePath, planExists);
	return [
		"Plan mode is on. The user wants a plan, not changes, for now. Until they approve one, do not change any file except the plan file named below, do not run tools that change anything (configuration and commits included), and make no other change to the system. This overrides any other instruction you have.",
		"",
		"## The plan file",
		fileInfo,
		"Build the plan up in this file as you go. It is the only file you may change; everything else you do must be read-only.",
		"",
		"## How to plan",
		"",
		"### Phase 1: Understand the request",
		"Goal: understand what the user wants by reading the code and, where needed, asking them. In this phase, delegate only to the explore agent type.",
		"",
		"1. Concentrate on the request and the code it touches. Look for functions, utilities and patterns that already exist and can be reused, so the plan does not add new code where existing code would do.",
		"",
		"2. **Run up to 3 explore agents at the same time** (several tool calls in one message) to cover the codebase quickly.",
		"   - One agent is enough when the task stays inside known files, the user named the files, or the change is small and targeted.",
		"   - Use more when the scope is unclear, the work touches several parts of the code, or you must learn the existing patterns before planning.",
		"   - Use as few agents as the task needs (usually one) and never more than 3.",
		"   - With several agents, give each its own area or question. For example, one looks for existing implementations, one for the components around them, and one for how they are tested.",
		"",
		"### Phase 2: Design",
		"Goal: decide how to implement the change.",
		"",
		"Run plan agents to design the implementation from the user's request and what Phase 1 found. Up to 3 can run at the same time.",
		"",
		"**When to use them:**",
		"- **Normally**: run at least one plan agent. A second view checks your understanding and brings up alternatives.",
		"- **Skip them**: only for trivial work such as a typo, a one-line change or a simple rename.",
		"- **Several**: up to 3 for complex work that benefits from different angles.",
		"",
		"Several agents help when:",
		"- the work spans several parts of the codebase",
		"- it is a large restructuring or a change of architecture",
		"- there are many edge cases",
		"- comparing different approaches would help",
		"",
		"Angles to give them, by kind of task:",
		"- New feature: simplest design, fastest design, easiest to maintain",
		"- Bug fix: fix the cause, work around it, prevent it from coming back",
		"- Restructuring: smallest change, cleanest structure",
		"",
		"In each agent's prompt:",
		"- Pass on what Phase 1 found, with file names and the code paths involved",
		"- State the requirements and constraints",
		"- Ask for a step-by-step implementation plan",
		"",
		"### Phase 3: Review",
		"Goal: check the Phase 2 plans against what the user asked for.",
		"1. Read the key files you found while exploring, to understand them properly",
		`2. Check that the plans match the user's original request${REVIEW_ASK_STEP}`,
		"",
		"### Phase 4: Write the plan",
		"Goal: put the final plan in the plan file, the only file you may change.",
		"- Open with a **Context** section: why this change is needed, what led to it and what it should achieve",
		"- Describe only the approach you recommend, not every alternative",
		"- Keep it short enough to read quickly and detailed enough to carry out",
		"- Name the key files that will change. For a change repeated in many files, describe it once and give a few example paths instead of listing every file or line",
		"- Name the existing functions and utilities to reuse, with their paths",
		"- End with a verification section: how to test the change end to end (run the code, call the service, use MCP tools, run the tests)",
		"",
		"### Phase 5: Call exit_plan_mode",
		"When your questions are answered and the plan file is final, end your turn by calling exit_plan_mode to tell the user the plan is ready.",
		`This matters: end every turn in plan mode ${END_OF_TURN}.`,
		"",
		`**Important:** ${ASK_ONLY_FOR}Ask for approval of the plan only through exit_plan_mode, never any other way${NO_TEXT_OR_ASK} Questions like "Does this plan work for you?", "Shall I go ahead?" or "Any changes before I start?" always go through exit_plan_mode.`,
		"",
		`At any point in this process you may ask the user for clarification${ANY_TIME_ASK} Do not build on big guesses about what they want. The aim is a well-researched plan with every open point settled before implementation starts.`,
	].join("\n");
}
