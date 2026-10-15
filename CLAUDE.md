# CLAUDE.md: Token-Saving Rules (All Projects)

Keep token usage low. Be efficient in what you read, what you write, and what you say. These rules apply to every project unless a project-specific section below says otherwise.

## Project (fill in per project)
- **Name:** Worship Tiles
- **Type:** Mobile web game (installable PWA, portrait)
- **Stack:** Plain HTML, CSS, vanilla JS (ES modules), Canvas 2D, Web Audio, localStorage; GitHub Pages
- **Design doc:** `docs/Worship-Tiles-Web-MDD.md` (build phases in section 10)
- **Key constraints:** no frameworks, no build step, no dependencies, relative paths only (GitHub Pages subpath), public-domain songs only

## Reading files
- Read the design doc in full **once per session**. After that, read only the section you need (Grep for the heading, then read that range).
- Read only the files the task touches. Do not scan the whole repo "to get oriented".
- Use Grep or Glob to locate things before opening a file. Read line ranges, not whole files, when a file is over about 150 lines.
- Never open large data, asset, lock, build-output, or generated files (`node_modules`, `package-lock.json`, `Pods`, `.build`, `DerivedData`, `dist`, minified files, big JSON or content banks) unless the task is specifically about them. Grep for a single entry instead.
- Do not re-read a file you just edited or wrote.

## Writing code
- Make small, targeted edits. Do not rewrite a whole file to change a few lines.
- Do not regenerate or paste back large blocks of existing content (data lists, content banks, long configs). Edit the single entry.
- Build in phases when the design doc defines them. One phase at a time, and do not start the next until asked.
- Do not add features, refactors, comments, or files that were not requested.
- Reuse existing functions, components, styles, and assets before writing new ones.
- Prefer the simplest approach that works. No new dependencies or packages unless I approve them or the task truly requires one.
- Match the existing code style and naming. Do not reformat untouched code.

## Responses
- Be brief. After finishing a task, give 1 to 3 sentences: what changed and which files.
- Do not repeat code back in chat after writing it to a file.
- Do not restate my request, summarize your plan at length, or explain what is obvious from the diff.
- No preamble, no recap, no "next steps" list unless I ask.
- If something is ambiguous and the answer would change the work substantially, ask one short question. Otherwise pick the simplest reasonable option and mention it in one line.

## Commands and testing
- Do not run the same command twice. Keep output short (pipe through `head`, `tail`, or `wc -l` when output could be long).
- Do not launch servers, simulators, browsers, or screenshot loops unless I ask. Prefer a quick script, a type check, or a Grep check over visual testing.
- Run only the tests or build step relevant to the change, not the whole suite, unless I ask.
- When a build or test fails, read only the relevant part of the error, fix it, and re-run once. If it still fails, stop and tell me what you found instead of looping.

## Debugging
- Look at the specific error and the specific lines involved first. Do not read unrelated files hoping to spot the cause.
- State the likely cause in one sentence before changing code.
- Make one fix at a time. Do not stack speculative changes.

## Git
- Commit once per finished task or phase with a short, clear message. Do not push unless I ask.
- Do not commit secrets, keys, or `.env` files. Keep them out of the repo and out of chat.

## Context hygiene
- Stay on one task per session. Suggest `/clear` when switching to an unrelated task.
- Suggest `/compact` if the conversation gets long, before it becomes expensive.
- Do not spawn subagents unless I ask for one.
- If a task is large, propose a short phased plan (a few lines) and wait for me to pick the first phase.

