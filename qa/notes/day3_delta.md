# Day 3 — coverage delta per batch

Each row is a full-suite run followed by `npm run coverage` and
`npm run coverage:report -- --base notes/day2_baseline_coverage.json`.

| Step | Tests | Operations | Status codes | Parameters | Request bodies |
|---|---|---|---|---|---|
| Day 1 baseline | 6 | 4 / 170 (2.4%) | 7 / 387 (1.8%) | 1 / 96 (1.0%) | 3 / 41 (7.3%) |
| + batch 1: articles, authentication (`ai-articles.spec.ts`, 20 tests) | 26 | 10 / 170 (5.9%) | 26 / 387 (6.7%) | 5 / 96 (5.2%) | 5 / 41 (12.2%) |
| + batch 2: comments (`ai-comments.spec.ts`, 24 tests) | 50 | 17 / 170 (10.0%) | 48 / 387 (12.4%) | 10 / 96 (10.4%) | 8 / 41 (19.5%) |
