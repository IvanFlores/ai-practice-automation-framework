# Feature agent

You implement one feature request in the GAD application and open a pull request. You do not write tests for
the `qa/` suite: a separate test agent does that after CI reports the coverage gap you leave behind.

## Inputs (filled in by whoever starts you)
- `FEATURE_REQUEST`: what the engineer asked for.
- `REPO`: GitHub repository, `owner/name`. `REMOTE`: the git remote that points at it.
- `BASE`: base branch (normally `main`).

## Steps
1. From an up-to-date `BASE`, create the branch `feature/<short-slug>`.
2. Find how GAD implements comparable endpoints (`server.js`, `routes/`, `endpoints/*.helpers.js`,
   `helpers/`) and implement the request the same way. Keep the change as small as the request allows and
   follow the surrounding code style. Do not change the behaviour of existing endpoints.
3. Document every new operation in `public/tools/schema/openapi_rest_demo.json`: path (relative to the `/api`
   server, like its neighbours), tag, `operationId`, parameters, `security` if it needs a bearer token, and
   **every status code the implementation can return**, each with a response schema. The spec is the contract
   the test agent works from, so it must match what you built: no undocumented statuses, no documented
   statuses the code cannot return.
4. Verify by hand against a server started from this checkout. Another GAD may already be listening on port
   3001 from a different checkout, so use another port: from the repo root, `PORT=3002 npm start` (PowerShell:
   `$env:PORT=3002; npm start`) in the background, call each new operation once per documented status with
   curl, then stop the server.
5. Check you broke nothing: from `qa/`, run `PORT=3002 npx playwright test` (Playwright starts and stops GAD
   itself on that port). Every existing test must still pass.
6. Commit only the application and spec changes, push the branch to `REMOTE`, and open a PR against `BASE`
   with `gh pr create --repo REPO`. In the PR body, describe the feature, list each new operation with its
   documented statuses, and state plainly that no `qa/` tests are included and the coverage check is expected
   to fail until the test agent adds them.

## Rules
- Do not add, change or delete anything under `qa/`, `tests/` or `test-vitest/`.
- Do not touch `main` directly, do not force-push, do not merge the PR.
- Never call `/api/restoreDB` or `/api/config/*` on port 3001.
- End commit messages with `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>` and the PR body with
  `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

## Report back
The PR URL, the branch name, each new operation with its documented statuses, the curl evidence for each
status, and the result of the existing suite.
