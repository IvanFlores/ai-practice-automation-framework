# Day 2 — Coverage tool, Day 1 baseline, AI estimate vs tool

## The tool
- `coverage/core.ts`: parses the spec, matches logged calls to operations, diffs, builds the gap list.
- `coverage/cli.ts`: the CLI. `coverage/core.test.ts`: 4 unit tests for the tool (`npm run test:coverage-tool`).
- Run from `qa/` after the tests: `npm run coverage` (`npm run coverage -- --help` lists the options).
- Outputs: console summary, `coverage-report/coverage.json` (full per-operation detail) and
  `coverage-report/gaps.json` (flat gap list). `coverage-report/` is gitignored; the Day 1 snapshots are
  `notes/day2_baseline_coverage.json` and `notes/day2_baseline_gaps.json`.
- Exit codes: 0 ok, 1 a `--min-*` threshold or `--fail-on-unmatched` failed, 2 no spec or no logged calls.

### What it measures
| Dimension | Covered when |
|---|---|
| Operation (method + path) | at least one logged call matches it |
| Status code | a matching call returned that documented code |
| Path parameter | its operation was called |
| Query parameter | a matching call sent that name (`params` or `?a=b`) |
| Header parameter | a matching call passed that header via `opts.headers` |
| Request body | the operation documents one and a matching call sent `data` |

### Decisions
- **Matching.** Spec paths get the `/api` server prefix. `/api/books/{id}` already has it and is left as is.
  When several templates fit, the most literal wins (`/api/articles/search` over `/api/articles/{id}`).
- **Setup calls count.** The log cannot tell a setup call from a call under test, so every recorded call counts.
  In the baseline this matters for one operation: `POST /users` is only ever called by the `createUser` helper.
  Without it the baseline would be 3/170 operations, 6/387 statuses, 2/41 bodies.
- **Header names are now logged.** `framework/api.ts` adds `headers` (names passed via `opts.headers`) to each
  log line, so the spec's one header parameter (`userid` on `GET /likes/article/mylikes`) can be measured.
  The bearer token is not listed: the spec models it as security, not as a parameter.
- **Also reported:** calls matching no documented operation, and returned statuses the spec does not document.
  The baseline has neither.
- **Not measured:** response schemas, parameter values, cookies.

### Gap list format (`gaps.json`)
A JSON array, one object per missing item. `type` is `operation`, `status`, `parameter` or `requestBody`.
An uncovered operation produces its `operation` gap plus one gap per status, parameter and body, each with
`operationCovered: false`, so filter on `type` or on `operationCovered` to pick a granularity.
```json
{"type":"status","method":"POST","path":"/api/articles","operationId":"postArticle","tags":["articles"],
 "secured":true,"operationCovered":true,"status":"400"}
```

## Day 1 baseline (6 tests, 9 logged calls)
| Dimension | Whole spec | Day 1 scope (tags articles, users, authentication, comments, likes) |
|---|---|---|
| Operations | 4 / 170 (2.4%) | 4 / 28 (14.3%) |
| Status codes | 7 / 387 (1.8%) | 7 / 92 (7.6%) |
| Parameters | 1 / 96 (1.0%) | 1 / 19 (5.3%) |
| Request bodies | 3 / 41 (7.3%) | 3 / 11 (27.3%) |

| Operation | Hit | Missing | Calls |
|---|---|---|---|
| POST /api/login | 200, 401 | – | 3 |
| POST /api/articles | 201, 401 | 400, 422 | 2 |
| GET /api/articles/{id} | 200, 404 | – | 2 |
| POST /api/users (setup only) | 201 | 400, 409, 422 | 2 |

Gaps: 679 in total (166 operations, 380 status codes, 95 parameters, 38 request bodies). 36 of the 39 tags
are at 0%; comments and likes are untouched, as intended on Day 1.

## AI estimate vs tool
Two fresh subagents got the same prompt: read the spec, `qa/tests/` and `qa/framework/` only; no shell, no
notes, no coverage log, no tool output. Both used file search (pattern counts over the spec) as well as reading.

| Metric | Tool | AI run 1 | AI run 2 |
|---|---|---|---|
| Operations | 4 / 170 | 4 / 170 | 4 / 170 |
| Status codes | 7 / 387 | 7 / 387 | 7 / 387 |
| Parameters | 1 / 96 | 1 / 96 | 1 / 96 |
| Request bodies | 3 / 41 | 3 / 41 | 3 / 41 |
| Number of spec paths (side remark) | 136 | 153 | 138 |

- **Accuracy:** both runs matched the tool on all eight numbers and named the same four operations and
  seven statuses. Both also spotted that `GET /restoreDB` in global-setup is deliberately unrecorded.
- **Variance:** none on the requested metrics. The only disagreement is the count of spec paths, which was
  not asked for: 153 and 138, both wrong (136). The numbers they counted by pattern were right; the one
  they tallied by hand was not.
- **Caveats:** this is the easiest possible case: 6 tests, 9 calls, literal URLs, no query parameters. The
  estimate was correct because the AI effectively ran a counting tool (search) over the spec. It also assumes
  every call returns what the test asserts; only the log knows what the server actually returned. Expect
  the estimate to drift once tests build paths dynamically or share helpers across files. Two runs is too
  few to claim the estimate is stable.

## CI step
- `npm run ci` (from `qa/`): tool unit tests, Playwright tests, then `coverage --fail-on-unmatched`.
- Day 3 replaced the fixed thresholds and the draft workflow with `.github/workflows/qa-pr-coverage.yml`,
  which compares each PR with its base branch and fails if coverage drops.
