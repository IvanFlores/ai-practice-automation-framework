# Day 1 — Discovery (GAD v2.9.x)

Everything below was verified with curl against http://localhost:3001 and by reading the repo.

## 0. Repository state
The working directory was empty at the start. I made a local `git clone` of the sibling checkout
`../gad-gui-api-demo` (commit `0916694`, "update tag from v2.8.9 to v2.9.0"; package.json says 2.9.1)
and pointed `origin` at https://github.com/jaktestowac/gad-gui-api-demo.git.
The server already listening on :3001 is `node server.js` started from that sibling checkout, so locally
`reuseExistingServer` reuses *that* process, not this checkout. In CI the webServer starts this checkout.

## 1. OpenAPI spec
- Served at: `GET /tools/schema/openapi_rest_demo.json` (loaded by `public/swagger/swagger-initializer.js`,
  embedded by `/tools/swagger.html`). The served file is byte-identical to the repo file.
- Repo file: `public/tools/schema/openapi_rest_demo.json` → `SPEC_FILE=public/tools/schema/openapi_rest_demo.json` (relative to repo root).
- Version: **OpenAPI 3.0.1** (not Swagger 2.0). `servers: [{url: "/api"}, ...]` → spec paths are relative
  to `/api` (spec `/articles/{id}` = real `/api/articles/{id}`).
- Security scheme: `bearerAuth` (http bearer). Operations with `security` need `Authorization: Bearer <token>`.
- Note for Day 2: the last path in the spec, `/api/books/{id}` (PATCH), already includes `/api`, so it
  resolves to `/api/api/books/{id}`. That's a spec defect, so the coverage tool has to normalise it.

## 2. Resources and operations (relevant subset; 160+ operations total)
| Method | Spec path | Documented statuses | Auth |
|---|---|---|---|
| POST | /login | 200, 401 | – |
| GET | /login | 200, 401 | bearer |
| GET | /articles | 200 | – |
| POST | /articles | 201, 400, 401, 422 | bearer |
| GET | /articles/{id} | 200, 404 | – |
| PUT | /articles/{id} | 200, 201, 400, 401, 404, 422 | bearer |
| PATCH | /articles/{id} | 200, 400, 401, 404, 422 | bearer |
| DELETE | /articles/{id} | 200, 400, 401 | bearer |
| GET | /users | 200 | – |
| POST | /users | 201, 400, 409, 422 | – |
| GET | /users/{id} | 200, 400, 404 | – |
| PUT/PATCH | /users/{id} | 200(/201), 400, 401, 404, 422 | bearer |
| DELETE | /users/{id} | 200, 401, 404 | bearer |
| GET | /comments, /comments/{id} | 200 / 200, 400, 404 | – |
| POST | /comments | 201, 400, 401, 422 | bearer |
| PUT/PATCH/DELETE | /comments/{id} | … 401, 404 … | bearer |
| POST | /likes | 200, 201, 400, 404, 422 | bearer |
| GET | /likes/article/{id}, /likes/comment/{id}, … | 200, 404 | – |
| GET | /health | 200 | – |
| GET | /restoreDB | 201 | – |

The rest (book-shop, flashposts, games, stats, messenger, …) are out of scope for Day 1.

## 3. Auth and DB restore
- Login: `POST /api/login`, body `{"email": string, "password": string}` (schema `UserLoginData`).
  - 200 → `{"access_token": "<JWT>"}` (schema `UserLoginToken`); token lifetime is 1 h (`exp - iat = 3600`).
  - 401 → `{"status":401,"message":"Incorrect email or password"}`.
- Missing token on a protected op → 401 `{"error":{"message":"Access token not provided!"}}`.
- DB restore: `GET /api/restoreDB` → **201** `{"message":"Database successfully restored","entities":{...}}`
  (restores `db/db-base.json`; 15 users, 59 articles, 227 comments). It needs no auth.
- Bearer token required for: every POST/PUT/PATCH/DELETE on articles, comments, likes, and PUT/PATCH/DELETE on users.
  `POST /users` (registration) and all GETs above are public.

## 4. Seeded test user
From `db/db-base.json` (seed file), id 1: `Moses.Armstrong@Feest.ca` / `test1`. Verified: login returns 200 + token.
Public user GETs mask `email`, `lastname`, `password` as `"****"`. `firstname` and `avatar` are visible.

## 5. Feature / bug flags
- `config/config-bugs.js`: all ~47 `bug_*` flags are `false` by default, including ones that touch my
  endpoints: `bug_articles_001/002`, `bug_validation_001..008`, `bug_404_if_article_created_recently`,
  `bug_disable_module_users`, `bug_disable_module_articles`. Live check `GET /api/config/bugs`: 0 flags true.
- `config/config-features.js`: only `feature_bug_hatch_module` and `feature_gad_talk_module` are true.
  Neither affects articles/users/login.
- Flags are **in-memory and changeable at runtime** via `POST /api/config/bugs` / `/api/config/features`
  (reset: `GET /api/config/reset`). If someone flips one on a shared instance, tests may fail for that reason.

## Observed behaviour worth knowing (verified)
- `POST /api/articles` without title → 422 `"One of mandatory field is missing"`. The server sets `user_id` from the token.
- **Date quirk**: `date` must not be "in the future". `isDateInFuture` (helpers/validation.helpers.js)
  treats a date without a `+hh:mm` offset (including `...Z`) as *local* time, so `new Date().toISOString()`
  is rejected with 422 on machines west of UTC (here UTC-4). Tests send a date one day in the past.
- `GET /api/articles/999999` and `GET /api/users/999999` → 404 with body `{}`.
- `DELETE /api/articles/{own id}` → 200 `{}`, then GET → 404.
- `POST /api/users` with an existing email → 409 `"Email not unique"`; missing fields → 422.

## Assumptions
- Health URL for `webServer`: `GET /api/health` (public, cheap, 200).
- `RESTORE_PATH=/api/restoreDB`. It returns 201, not 200, so global-setup treats any 2xx as success.
- Credentials come from the seed file (test data shipped with GAD), not real accounts.
