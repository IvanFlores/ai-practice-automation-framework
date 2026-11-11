# Context: continuing a 4-day AI-assisted API testing exercise (Day 1 is done)

Working directory: the `ai-practice-automation-framework` folder. It is a local git clone of GAD
(https://github.com/jaktestowac/gad-gui-api-demo, v2.9.0, cloned from the sibling `../gad-gui-api-demo`).
Never modify GAD's own source or its root `tests/` and `test-vitest/` folders. All my work lives in `qa/`,
which is untracked and uncommitted. Don't commit unless I ask. Don't create a `CLAUDE.md` or any other file
Claude Code auto-loads: the conventions experiment depends on them being absent.

## Read these first (they hold the details; don't re-discover)
- `qa/notes/discovery.md`: spec location/version, routes, auth, DB restore, flags, known quirks.
- `qa/CONVENTIONS.md`: rules for writing tests in this framework.
- `qa/notes/day1_untested.md`: covered vs deliberately untested operations.
- `qa/notes/day1_comparison.md`: result of the with/without-context AI experiment.
- `qa/framework/api.ts`, `qa/framework/assertions.ts`, `qa/framework/global-setup.ts`, `qa/playwright.config.ts`.

## What exists (Day 1)
- **Stack:** Playwright + TypeScript (strict, ESM, `"type": "module"`), API tests only, no browsers.
  devDeps are only `@playwright/test`, `typescript`, `tsx`, `@types/node`. `qa/.env` (gitignored) holds PORT,
  GAD_EMAIL/GAD_PASSWORD (seed user id 1 from `db/db-base.json`), RESTORE_PATH, SPEC_FILE. The config loads it
  with `process.loadEnvFile`.
- **Spec:** `public/tools/schema/openapi_rest_demo.json` is OpenAPI 3.0.1, served at
  `/tools/schema/openapi_rest_demo.json`. Paths are relative to server `/api`. Its last path is
  `/api/books/{id}`, which wrongly includes the `/api` prefix, so normalise it.
- **Config:** `workers: 1`, baseURL `http://localhost:${PORT}`, webServer `npm start` with `cwd: '..'`,
  health URL `/api/health`, `reuseExistingServer: !CI`.
- **global-setup:** deletes `qa/coverage-log/`, then calls `GET /api/restoreDB` (returns 201) with a plain
  request context, so it is NOT logged.
- **`Api` class (api.ts):** wraps APIRequestContext with get/post/put/patch/delete → `call()`. Every call
  appends one line to `qa/coverage-log/worker-<workerIndex>.jsonl`:
  `{"method":"GET","path":"/api/users/1","status":200,"query":["limit"],"hasBody":false}`.
  `path` has no query string. `query` holds the sorted names from `opts.params` plus `?a=b`.
  Fixtures: `api` (anonymous) and `authApi` (logs in via the recorded `POST /api/login`, then sends a bearer token).
  Also exported: `expect`, `LOG_DIR`, `LOGIN_PATH`, `CoverageEntry`.
- **Assertions:** `expectStatus(res, n)` and `expectJsonHas(res, ...keys)`, which returns the parsed body.
- **Tests (6, all passing, verified twice in a row):**
  - `tests/articles.spec.ts`: GET /api/articles/{id} 200 and 404; POST /api/articles 201 and 401.
  - `tests/auth.spec.ts`: POST /api/login 200 and 401. Each test creates its own user via POST /api/users,
    so those calls are setup only.
  - Deliberately untested: DELETE /api/articles/{id}, and all comments and likes endpoints.
- **AI experiment (fresh subagents, because the headless `claude -p` wasn't logged in):**
  - Without context, the AI wrote no test. It pointed to GAD's mocha `tests/test/articles.spec.js` as
    "already covered", which yields 0 coverage-log lines.
  - With context, it wrote `tests/ai-article-delete.spec.ts` (kept as `qa/notes/day1_run_b_with.spec.ts`).
    That test followed every convention and passed first time.
  - CONVENTIONS.md was then clarified: "one status *under test* per test"; setup and follow-up calls count
    only for their own operation; GAD's root `tests/` don't count as coverage.

## Gotchas
- GAD's date validator treats `...Z` dates as local time, so "now" is rejected with 422 west of UTC.
  Send dates one day in the past.
- Bug/feature flags are all off, but they can be flipped at runtime via `/api/config/bugs`.
- Setup and verification calls (e.g. the `authApi` login, POST /api/users) appear in the coverage log.
  Decide in Day 2 whether they count.
- Starting GAD on Windows PowerShell: `$env:PORT=3001; npm run start` (the Bash form `PORT=3001 npm ...`
  fails there). Run `npm install` in the repo root first if `node_modules` is missing.
- Run tests from `qa/`: `npx playwright test`.

## Next: Day 2
Build a coverage tool that reads the OpenAPI spec (SPEC_FILE) and `qa/coverage-log/*.jsonl`, matches logged
calls to spec operations (path templates such as `/articles/{id}` vs `/api/articles/60`, plus method and
documented status codes), and reports covered vs uncovered operations and statuses. I'll give the detailed
Day 2 task next. First, read the files above and confirm in a few lines that the framework still passes
(`npx playwright test` in `qa/`).
