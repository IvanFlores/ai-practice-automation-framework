# QA conventions (GAD API tests)

Playwright + TypeScript API tests for GAD. The OpenAPI spec is the source of truth:
`../public/tools/schema/openapi_rest_demo.json` (OpenAPI 3.0.1, paths relative to `/api`).

## 1. Structure
```
qa/
  playwright.config.ts      baseURL, webServer, globalSetup (workers: 1)
  framework/api.ts          Api client + `test` fixtures (api, authApi) + `expect`
  framework/assertions.ts   expectStatus, expectJsonHas
  framework/global-setup.ts wipes coverage-log/, restores the DB
  tests/<resource>.spec.ts  one file per resource: articles.spec.ts, auth.spec.ts, ...
  tests/ai-<topic>.spec.ts  AI-generated tests, e.g. tests/ai-article-delete.spec.ts
  coverage-log/             generated: worker-<n>.jsonl, one line per HTTP call
  coverage/                 coverage tool: cli.ts, core.ts (see section 7)
```
- Import `test` (and `expect`, `Api` if needed) from `../framework/api`, never from `@playwright/test`.
- Import assertions from `../framework/assertions`.
- Tests live only in `qa/tests/`. Anything elsewhere does not run. GAD's own `../tests/` (mocha) and
  `../test-vitest/` are not part of this suite and produce no coverage: never count them as "already covered".

## 2. Naming
Pattern: `<METHOD> <path> <condition> returns <status>`. The path is the real URL with spec-style placeholders.
- `POST /api/articles without token returns 401`
- `GET /api/articles/{id} unknown id returns 404`

## 3. Fixtures
- `api`: anonymous client. Use it for public operations and for "without token → 401" tests.
- `authApi`: logged in as `GAD_EMAIL`/`GAD_PASSWORD` (from `qa/.env`), sends `Authorization: Bearer <token>`.
  Use it for every operation the spec marks with `security: bearerAuth`.
- Both write every call to `coverage-log/`. **Never** use the raw `request` fixture, `fetch`, axios or a
  new `request.newContext()` in tests: those calls are not recorded and count as zero coverage.
- Methods: `get`, `head`, `post`, `put`, `patch`, `delete`.
- Pass query params via `{ params: {...} }` and bodies via `{ data: {...} }`. Do not build JSON strings by hand.

## 4. Assertions
- First line after the call: `await expectStatus(res, <status>)`. Never `expect(res.status()).toBe(...)`.
- Then, for JSON responses, `await expectJsonHas(res, 'id', 'title', ...)`. It returns the parsed body.
- Assert what the OpenAPI spec documents (status code and schema `required` fields), not what the app
  happens to return today. If the app disagrees with the spec, the test fails. Never bend a test to match a bug.
  Note the mismatch in `notes/` instead.
- **Spec mismatch procedure.** First make sure the request is right (auth, body, IDs). If the app still returns a
  different status than the spec documents, keep the test asserting the spec, put
  `test.fail(true, 'spec mismatch: app returns <status>');` as the first line of its body (the suite stays green and
  the test starts failing the day the app is fixed), and add a row to `notes/day3_spec_mismatches.md`.
- If a documented status cannot be triggered through the public API at all, write no test for it and list it in
  the same notes file under "Not reachable". Never invent a contrived request just to hit a number.

## 5. Data
- `globalSetup` restores the DB (`GET /api/restoreDB`) once per run. There is no restore between tests.
- Each test creates the records it needs, with unique values from `Date.now()` (titles, emails).
- Parent resources are created inside the test (e.g. create the article before commenting on, liking or
  deleting it). Do not hardcode IDs, except for read-only GETs of seed data (e.g. article 1).
- Never modify or delete seed data (anything from `db-base.json`, above all seed user 1: `authApi` logs in as it).
  To test PUT/PATCH/DELETE on a user, create one with `POST /api/users`, log in with `api.post('/api/login', ...)`
  and use `api.withToken(access_token)`.
- Never call `/api/config/*` or `/api/restoreDB` from a test: flags and restores affect every other test.
- `date` fields: send a past ISO date (e.g. `new Date(Date.now() - 86_400_000).toISOString()`).
  GAD rejects dates it considers in the future.

## 6. How to add a test
1. Pick an operation from the spec and list its documented status codes and whether it needs `bearerAuth`.
2. Open the matching `tests/<resource>.spec.ts` (create it if the resource is new; AI-written files use `tests/ai-<topic>.spec.ts`).
3. Write the happy path first, then one test per documented error. One status code *under test* per test:
   the one in the test name. Setup calls (create the parent) and follow-up checks may use `expectStatus` too,
   but they are logged as coverage of *their* operation, so they never replace that operation's own test.
4. Use `authApi` for secured operations and `api` for public ones and for the 401 case.
5. Create any data the test needs inside the test. Assert with `expectStatus`, then `expectJsonHas`.
6. Name it `<METHOD> <path> <condition> returns <status>`.
7. Run `npx playwright test tests/<file>` from `qa/` and make sure it passes before finishing.

## 7. Coverage
- After a run, `npm run coverage` diffs `coverage-log/` against the spec and writes
  `coverage-report/coverage.json` and `coverage-report/gaps.json`. `npm run ci` runs tests plus the gated check.
- Every recorded call counts, including setup calls. Pick the next test from `gaps.json`.
- To cover a documented header parameter, pass it via `{ headers: {...} }`: header names are logged.
- Locally, Playwright reuses whatever GAD already listens on `PORT` (3001 in `.env`), which may be another
  checkout. To test this checkout's code, run on a free port: `PORT=3002 npx playwright test`
  (PowerShell: `$env:PORT=3002; npx playwright test`). Playwright then starts and stops GAD itself.
- On a PR, CI writes `pr-gaps.json`: the gaps that PR introduced. `npm run pr:gaps -- <pr> --repo <owner/name>`
  downloads it. The two-agent pipeline that uses it is described in `agents/README.md`.
- Coverage over time: every push to `main` adds a row to `history.jsonl` on the `coverage-history` branch and
  redraws `index.html` there (`.github/workflows/qa-coverage-history.yml`, `npm run coverage:history`).
