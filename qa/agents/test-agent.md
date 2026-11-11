# Test agent

A pull request changed the API and its coverage check failed: the OpenAPI spec now documents behaviour that no
test exercises. You close exactly those gaps with tests in the `qa/` suite and push them to the same PR branch.

## Inputs (filled in by whoever starts you)
- `PR`: pull request number. `REPO`: GitHub repository, `owner/name`. `REMOTE`: the git remote for it.

## Steps
1. Check out the PR's head branch and make sure it is up to date with `REMOTE` (`gh pr view PR --repo REPO
   --json headRefName`). Work only inside `qa/`.
2. Read `qa/CONVENTIONS.md` completely and follow it exactly. Read two existing test files as style examples
   (`tests/articles.spec.ts`, `tests/ai-comments.spec.ts`), the framework (`framework/api.ts`,
   `framework/assertions.ts`) and `notes/discovery.md`.
3. Get your work list from the CI artifact, not from your own reading of the diff. From `qa/`:
   `npm run pr:gaps -- PR --repo REPO`
   It downloads the coverage artifact of the PR's latest `qa-pr-coverage` run and prints the path of
   `pr-gaps.json`: the gaps this PR introduced. Each entry has `type` (`operation`, `status`, `parameter`,
   `requestBody`), `method`, `path`, `secured`, and `status` or `parameter` where relevant. If the list is
   empty, stop and report that there is nothing to do.
4. For each operation in the list, read its definition in `../public/tools/schema/openapi_rest_demo.json`
   (request and response schemas are under `components.schemas`). The spec is your source of truth. You may
   read the implementation to understand how to reach a status, never to decide what to assert.
5. Write the tests in `tests/ai-<topic>.spec.ts` (a new file, or an existing `ai-` file for the same
   resource): one test per documented status code, asserting the status and the `required` fields of the
   documented response schema. Cover query and header parameters from the list where a test does so naturally.
6. Run them against a server started from this checkout. Another GAD may be listening on port 3001 from a
   different checkout that lacks the new endpoint, so use another port: `PORT=3002 npx playwright test
   tests/<your file>` (PowerShell: `$env:PORT=3002; npx playwright test ...`). Playwright starts and stops GAD
   itself. Read the failures and fix your tests; at most four rounds. If the app disagrees with the spec,
   follow the "Spec mismatch procedure" in CONVENTIONS.md section 4 instead of changing the expectation.
7. Confirm the gaps are closed and nothing else broke, still on port 3002:
   `PORT=3002 npx playwright test`, then `npm run coverage -- --fail-on-unmatched`, then `npx tsc --noEmit`.
   Every entry of `pr-gaps.json` should now be absent from `coverage-report/gaps.json`, except statuses you
   recorded as a spec mismatch or as not reachable.
8. Commit only your test file (and `notes/day3_spec_mismatches.md` if you added rows) and push to the PR
   branch. Then add a PR comment with `gh pr comment PR --repo REPO` listing the tests added and any gap
   left open, with the reason.

## Rules
- Do not change application code, the spec, `framework/`, `coverage/`, `CONVENTIONS.md` or existing tests.
  If a gap can only be closed by changing one of those, leave it open and say so.
- Do not force-push, do not merge the PR, do not push to any branch other than the PR's head branch.
- Never call `/api/restoreDB` or `/api/config/*` from a test or by hand.
- End commit messages with `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>` and the PR comment with
  `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

## Report back
The tests written (operation and status each covers), the full-suite result, the coverage numbers after your
tests, the commit hash pushed, and every gap left open with the evidence.
