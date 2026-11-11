# Day 1 — covered vs deliberately untested

Spec: `public/tools/schema/openapi_rest_demo.json` (paths relative to `/api`).

## Covered by hand-written tests (operation → status asserted)
| Operation | Status | Test |
|---|---|---|
| GET /articles/{id} | 200 | articles.spec.ts › `GET /api/articles/{id} seeded article returns 200` |
| GET /articles/{id} | 404 | articles.spec.ts › `GET /api/articles/{id} unknown id returns 404` |
| POST /articles | 201 | articles.spec.ts › `POST /api/articles valid article returns 201` |
| POST /articles | 401 | articles.spec.ts › `POST /api/articles without token returns 401` |
| POST /login | 200 | auth.spec.ts › `POST /api/login valid credentials returns 200` |
| POST /login | 401 | auth.spec.ts › `POST /api/login wrong password returns 401` |

Exercised as **setup only** (recorded in the coverage log, but no test asserts it as its subject):
- POST /users → 201 (`createUser` helper in auth.spec.ts; asserts 201 with `expectStatus`).
- POST /login → 200 (inside the `authApi` fixture).

Day 2's coverage tool will count these as hit. Decide there whether setup calls count as coverage.

## Deliberately left untested (targets for the AI later)
- **DELETE /articles/{id}** (200, 400, 401). Target of the Day 1 AI experiment.
- **All comments endpoints**: GET /comments, POST /comments, GET/PUT/PATCH/DELETE /comments/{id}, GET /comments/search.
- **All likes endpoints**: POST /likes, GET /likes/article/{id}, GET /likes/article, GET /likes/comment/{id}, GET /likes/article/mylikes.

## Also untested (out of Day 1 scope, not deliberate gaps)
- Remaining article ops: GET /articles, PUT /articles/{id}, PATCH /articles/{id}, GET /articles/search;
  documented errors POST /articles 400/422 and GET /articles/{id} 200 with a self-created article.
- Remaining user ops: GET /users, GET /users/{id}, PUT/PATCH/DELETE /users/{id}, GET /users/search;
  POST /users 400/409/422.
- GET /login (token validation).
- Every other resource in the spec (book-shop, flashposts, labels, games, stats, …).
