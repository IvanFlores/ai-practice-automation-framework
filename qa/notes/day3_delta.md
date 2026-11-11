# Day 3 — coverage delta per batch

Each row is a full-suite run followed by `npm run coverage` and
`npm run coverage:report -- --base notes/day2_baseline_coverage.json`.

| Step | Tests | Operations | Status codes | Parameters | Request bodies |
|---|---|---|---|---|---|
| Day 1 baseline | 6 | 4 / 170 (2.4%) | 7 / 387 (1.8%) | 1 / 96 (1.0%) | 3 / 41 (7.3%) |
| + batch 1: articles, authentication (`ai-articles.spec.ts`, 20 tests) | 26 | 10 / 170 (5.9%) | 26 / 387 (6.7%) | 5 / 96 (5.2%) | 5 / 41 (12.2%) |
| + batch 2: comments (`ai-comments.spec.ts`, 24 tests) | 50 | 17 / 170 (10.0%) | 48 / 387 (12.4%) | 10 / 96 (10.4%) | 8 / 41 (19.5%) |
| batch 3: likes (14 tests written, held back: `feature_likes` is off, see `day3_spec_mismatches.md`) | 50 | 17 / 170 (10.0%) | 48 / 387 (12.4%) | 10 / 96 (10.4%) | 8 / 41 (19.5%) |
| + batch 4: users (`ai-users.spec.ts`, 24 tests) | 74 | 23 / 170 (13.5%) | 67 / 387 (17.3%) | 15 / 96 (15.6%) | 10 / 41 (24.4%) |

## Result
- Baseline to end of Day 3: +19 operations, +60 status codes, +14 parameters, +7 request bodies; nothing lost.
- 68 AI-written tests are in the suite: 61 pass normally and 7 are expected failures (`test.fail`) that document
  spec mismatches. An expected failure does not count as coverage, because the documented status never comes back.
- Feedback rounds: articles 1, comments 2, likes 1, users 1 (the agent ran its own file and fixed its failures).
- Still open in the Day 1 scope: the likes tag (blocked by `feature_likes`), 4 statuses the app cannot return, and
  7 statuses where the app disagrees with the spec. All are listed in `day3_spec_mismatches.md`.
