# Day 1 — AI comparison prompts

> **Status (2026-11-03): headless runs not possible here.** Both attempts with the desktop app's bundled
> CLI (`%APPDATA%\Claude\claude-code\2.1.309\...\claude.exe`) exited immediately with
> `Not logged in · Please run /login` and changed no files. Run them manually as described below.

## Manual procedure (Git Bash, from the repo root)
```bash
for run in run-a run-b; do mkdir -p ../day1-$run; tar --exclude=./node_modules --exclude=./.git -cf - . | tar -xf - -C ../day1-$run; done
rm -rf ../day1-run-a/qa/CONVENTIONS.md ../day1-run-a/qa/framework ../day1-run-a/qa/tests ../day1-run-a/qa/notes
```
Then in a logged-in terminal, one fresh session per copy (prompts below):
```bash
cd ../day1-run-a && claude -p "Add a test for DELETE /api/articles/{id} that covers the successful deletion." --permission-mode acceptEdits
```
```bash
cd ../day1-run-b && claude -p "Add a test for DELETE /api/articles/{id} that covers the successful deletion. Read qa/CONVENTIONS.md, qa/framework/ and the existing tests first." --permission-mode acceptEdits
```
Copy each generated spec to `qa/notes/day1_run_a_without.spec.ts` / `qa/notes/day1_run_b_with.spec.ts`,
then fill in `qa/notes/day1_comparison.md` (Step 7: copy each into `qa/tests/` renamed, run alone,
check `coverage-log/worker-0.jsonl` for a `DELETE /api/articles/<id>` line, remove it).

Planned runner: headless Claude Code (desktop-app bundled CLI 2.1.309), each in its own temp copy of the repo
(no root `node_modules`, no `.git`), working directory = copy root, GAD already running on :3001.

```
claude -p "<prompt>" --permission-mode acceptEdits
```

## Run A — without context
Copy changes: deleted `qa/CONVENTIONS.md`, `qa/framework/`, `qa/tests/`, and also `qa/notes/`
(it contains discovery/coverage notes that describe the framework). Kept `package.json`,
`playwright.config.ts` (which still points `globalSetup` at the deleted `framework/global-setup.ts`),
`tsconfig.json`, `.env*`, `node_modules`.

Prompt:
```
Add a test for DELETE /api/articles/{id} that covers the successful deletion.
```

## Run B — with context
Copy changes: none (everything intact).

Prompt:
```
Add a test for DELETE /api/articles/{id} that covers the successful deletion. Read qa/CONVENTIONS.md, qa/framework/ and the existing tests first.
```

## What actually ran
You chose to use fresh Claude subagents instead: one per temp copy, each told only its directory, the prompt above,
and "file edits only, no shell commands" (to match acceptEdits). Run B copy also had day1_prompts.md and
day1_comparison.md removed so it could not see the experiment design.
