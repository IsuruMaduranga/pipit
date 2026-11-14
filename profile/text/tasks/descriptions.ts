/**
 * The task tools' model-facing texts (pure): the task_create, task_update,
 * task_get and task_list descriptions and their parameter texts.
 */

export const TASK_CREATE_DESCRIPTION = `Add a task to this session's task list. The list keeps your progress on multi-step work visible to the user and keeps you from losing steps. Each task gets an id and can later carry an owner, metadata and links to other tasks: change it with task_update, read it with task_list and task_get.

## When to add tasks

Add them without being asked when:
- the work has three or more distinct steps
- the work needs planning or many separate operations
- you are in plan mode and want to track the work the plan describes
- the user asks for a task list or a to-do list
- the user hands you several things to do, as a numbered or comma-separated list
- new instructions arrive: record what the user asked for as tasks right away

While you work, mark a task in_progress (with task_update) before you start it, keep only one task in_progress at once, and set it to completed as soon as it is done, adding any follow-up tasks you discovered.

## When not to

Do the work directly, without tasks, when:
- there is a single, simple task
- the work takes fewer than three easy steps
- tracking it would add nothing
- the request is a question or conversation, not work

## Fields

- **subject**: a short title in the imperative, such as "Fix the retry count in the order service"
- **description**: what has to be done
- **activeForm** (optional): the same in the present continuous, shown while the task is in_progress, such as "Fixing the retry count". Without it the subject is shown.

New tasks start as \`pending\`.

## Tips

- Give tasks specific subjects that name the result
- Link tasks that depend on each other afterwards with task_update (addBlocks, addBlockedBy)
- Look at task_list first so you do not add a task twice
`;

export const TASK_UPDATE_DESCRIPTION = `Change a task on the task list: its status, its details or its links to other tasks.

## Finishing a task

- Mark a task completed as soon as its work is done, or deleted when it is no longer needed or another task has replaced it.
- IMPORTANT: always close the tasks you own when you finish them, then check task_list for the next one.
- Mark a task completed only when it is entirely done. If you hit errors or a blocker, or cannot finish, leave it in_progress and add a task for what is blocking it.
- A task is not completed while:
  - tests fail
  - the change is only partly made
  - errors remain unresolved
  - files or dependencies it needs could not be found

## Removing a task

- Set the status to \`deleted\` for a task that no longer applies or was created by mistake. This removes it for good.

## Changing details

- Update the subject or description when the requirements change or become clearer, and add links when one task turns out to depend on another.

## Fields

- **status**: see the order below
- **subject**: a new title, in the imperative (such as "Run the tests")
- **description**: a new description
- **activeForm**: the present continuous form shown while the task is in_progress (such as "Running the tests")
- **owner**: the agent that owns the task, by name
- **metadata**: keys to merge into the task's metadata; a key set to null is removed
- **addBlocks**: tasks that cannot start until this one is completed
- **addBlockedBy**: tasks that must be completed before this one can start

## Status order

\`pending\`, then \`in_progress\`, then \`completed\`. \`deleted\` removes the task.

## Stale data

Read the task's current state with \`task_get\` before you change it.

## Examples

Start work on a task:
\`\`\`json
{"taskId": "1", "status": "in_progress"}
\`\`\`

Finish it:
\`\`\`json
{"taskId": "1", "status": "completed"}
\`\`\`

Remove a task:
\`\`\`json
{"taskId": "3", "status": "deleted"}
\`\`\`

Take ownership of a task:
\`\`\`json
{"taskId": "2", "owner": "builder"}
\`\`\`

Make task 2 wait for task 1:
\`\`\`json
{"taskId": "2", "addBlockedBy": ["1"]}
\`\`\`
`;

export const TASK_GET_DESCRIPTION = `Read one task from the task list by its id.

## When to use it

- Before starting a task, to get its full description and context
- To see its links: which tasks it holds up, and which hold it up
- When a task has been assigned to you, to get everything it asks for

## What it returns

- **subject**: the title
- **status**: 'pending', 'in_progress' or 'completed', and the owner if there is one
- **description**: what has to be done, in full
- **blocks**: tasks waiting for this one
- **blockedBy**: tasks that must be completed before this one can start
- **metadata**: any metadata stored on the task

## Tips

- Check that blockedBy has no open tasks before you start work.
- task_list shows every task in short form.
`;

export const TASK_LIST_DESCRIPTION = `Show every task on the task list in short form.

## When to use it

- To find work that can start now: pending, without an owner and not blocked
- To see how far the work as a whole has come
- To find blocked tasks and what blocks them
- After finishing a task, to find work that is now unblocked or the next task to take
- When several tasks are open, **work through them in id order** (lowest first): earlier tasks often prepare the ground for later ones

## What it returns

One line per task with:
- **id**: the task's id, for task_get and task_update
- **subject**: its title
- **owner**: the agent that owns it, if any
- **status**: one of 'pending', 'in_progress', 'completed'
- **blocked by**: open tasks that must be completed first; a task cannot start while any are open

For a task's full details, call task_get with its id.
`;

export const TASK_CREATE_PARAMS = {
	subject: `A short title for the task`,
	description: `What has to be done`,
	activeForm: `The present continuous form shown while the task is in_progress (such as "Running the tests")`,
	metadata: `Any metadata to store on the task`,
} as const;

export const TASK_UPDATE_PARAMS = {
	taskId: `The id of the task to change`,
	subject: `A new title for the task`,
	description: `A new description for the task`,
	activeForm: `The present continuous form shown while the task is in_progress (such as "Running the tests")`,
	status: `The task's new status`,
	addBlocks: `Ids of tasks that wait for this one`,
	addBlockedBy: `Ids of tasks this one waits for`,
	owner: `The task's new owner`,
	metadata: `Metadata keys to merge into the task; a key set to null is removed.`,
} as const;

export const TASK_GET_PARAMS = {
	taskId: `The id of the task to read`,
} as const;
