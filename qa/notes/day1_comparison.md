# Day 1 — AI comparison: DELETE /api/articles/{id}

Runner: fresh Claude subagents, one temp copy each, file edits only (the headless CLI was not logged in).
Run B's spec was run alone against the real framework. Run A produced no file (`day1_run_a_without.md`).

| Check | Without context | With context |
|---|---|---|
| Imports `test` from `framework/api` | no: wrote nothing; cited GAD's mocha test | yes |
| Uses recorded fixture (call appears in coverage log) | no: 0 log lines | yes: `DELETE /api/articles/60` → 200 |
| Uses `authApi` where auth is needed | no: cited test uses mocha `authUser()` | yes: create and delete |
| Uses `expectStatus` | no | yes (3 calls: 201, 200, 404) |
| Naming pattern followed | no: `DELETE /articles/:id` | yes: `DELETE /api/articles/{id} own article returns 200` |
| File placement correct | no: GAD's `tests/test/` | yes: `tests/ai-article-delete.spec.ts` |
| Creates its own article first (no hardcoded ID) | yes, in the cited test | yes |
| Passes on first run | n/a: nothing to run | yes: 1 passed |

## Conclusions
Without context, the AI wrote no test: it found GAD's own mocha suite and called DELETE "already covered".
With context, it followed every convention and passed first time. Run A's outcome would silently hurt
Day 2: tests outside `qa/` never reach `coverage-log/`, so the operation stays at 0% while the AI reports
it as done. Run B asserted three statuses, and its follow-up `GET → 404` gets logged as coverage of another
operation. So CONVENTIONS.md now says "one status *under test* per test": setup and follow-up checks count
only for their own operation. It also says GAD's root `tests/` and `test-vitest/` don't count.
