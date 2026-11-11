# Day 3 — prompt for the test-generation agent

One fresh agent per batch, run one after another (GAD's DB and the coverage log are shared).
`<TAGS>` and `<FILE>` change per batch: `articles,authentication` → `tests/ai-articles.spec.ts`,
`comments` → `tests/ai-comments.spec.ts`, `likes` → `tests/ai-likes.spec.ts`, `users` → `tests/ai-users.spec.ts`.

---

You are adding API tests to an existing Playwright + TypeScript suite so that it covers more of an OpenAPI spec.
Work only inside `C:\ivanflores\JalaSoft\Projects\Additional\ai-practice-automation-framework\qa`.

## Your batch
Close the coverage gaps for the spec tag(s) **<TAGS>** by writing **`<FILE>`** (one new file; if a covered
operation's existing tests live in another file, still put your new tests in your file).

## Steps
1. Read `CONVENTIONS.md` completely and follow it exactly. Read the example tests `tests/articles.spec.ts` and
   `tests/auth.spec.ts`, the framework (`framework/api.ts`, `framework/assertions.ts`), and `notes/discovery.md`
   (known quirks of the app).
2. Get your gap list from the coverage tool. From `qa/` run:
   `npm run coverage -- --quiet --tag <TAGS> --out coverage-report/batch`
   then read `coverage-report/batch/gaps.json`. Entries with `"type":"status"` are your work list (operation +
   documented status code not yet returned to any test). `"type":"parameter"` entries with `"in":"query"` or
   `"in":"header"` are a secondary goal: cover them where one extra test does it naturally.
3. For every operation in the list, read its definition in `../public/tools/schema/openapi_rest_demo.json`
   (paths are relative to `/api`; request/response schemas are under `components.schemas`).
4. Write the tests: one test per documented status code.
5. Run only your file: `npx playwright test <FILE>`. Read the failures and fix your tests. Repeat, at most four
   rounds. A failure means either your request is wrong (fix it) or the app disagrees with the spec (follow the
   "Spec mismatch procedure" in CONVENTIONS.md section 4; do not change the expected status to match the app).
6. Run `npx tsc --noEmit` and fix any type error in your file.

## Rules
- Do not edit any existing file except to append rows to `notes/day3_spec_mismatches.md`. In particular do not
  touch `framework/`, `coverage/`, `CONVENTIONS.md`, other test files, or anything outside `qa/`.
- Do not use git. Do not commit.
- Do not run the whole suite or the plain `npm run coverage` (a partial run rewrites the shared log; the command
  in step 2 is fine because you run it first).
- GAD's own `../tests/` and `../test-vitest/` are not part of this suite and never count as coverage.

## Report back
- The tests you wrote (count, and which operation/status each covers).
- Each spec mismatch and each status you could not reach, with the evidence (what you sent, what came back).
- The final output of `npx playwright test <FILE>` (pass/fail/expected-failure counts).
