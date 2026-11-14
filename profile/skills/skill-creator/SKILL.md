---
name: skill-creator
description: Use this skill when the user asks to create, define or save a new skill, custom instruction set, or reusable behavior for the assistant.
---

# Skill Creator

When asked to create a new skill, follow these steps.

## Step 1: gather requirements

If the request is vague, ask one focused question with `ask_user_question` before going on:
- What task or scenario should the skill apply to?
- What rules or guidance should it enforce?

If the request is clear enough, skip the question.

## Step 2: write the skill definition

Compose its three parts:

**Name** (`name`)
- Lowercase kebab-case, two or three words: `api-design`, `error-handler`, `test-writer`.
- No spaces or special characters.

**Trigger** (`description`)
- One or two sentences saying *when* to use the skill, starting with "Use this skill when...".
- Be specific: the agent reads it to decide when to load the skill with the `skill` tool.

**Body**: optional, but recommended for anything non-trivial
- The detailed rules, constraints and examples.
- Markdown headers and bullet lists.
- Focus on what the agent should do differently while the skill is active.
- Concrete examples where they help (Ballerina code blocks for code rules).
- Name tools as they are: `read`, `write`, `edit`, `bash`, `config_status`, and shell commands such as `bal discover`.

## Step 3: save the skill

Ask where it belongs if the request does not say:
- **This project**: `.agents/skills/<name>/SKILL.md`, relative to the project root (the folder with the `[workspace]` `Ballerina.toml`). Checked in with the project, so the team shares it.
- **Every project of this user**: `~/.agents/skills/<name>/SKILL.md`.

Write the file with the `write` tool, in exactly this format:

```
---
name: <name>
description: <trigger>
---

<body>
```

- `name` matches the folder name.
- `description` is the trigger sentence from Step 2. Quote it (`description: "..."`) if it contains a colon followed by a space.
- Leave the body out only for a very simple skill.
- After writing, tell the user in one sentence that the skill was created, and where.

Do not announce that you are about to write: call `write` directly.
