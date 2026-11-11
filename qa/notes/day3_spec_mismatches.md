# Day 3: spec mismatches and unreachable statuses

Found while generating tests from the gap list. The spec is the source of truth (CONVENTIONS.md section 4).

## Spec mismatches (test kept, marked `test.fail`)
| Operation | Spec says | App returns | Test |
|---|---|---|---|
| HEAD /api/articles/{id} | 400 "Invalid ID supplied" (sent `HEAD /api/articles/not-an-id`) | 404 | `tests/ai-articles.spec.ts`: "HEAD /api/articles/{id} non-numeric id returns 400" |
| GET /api/comments/{id} | 400 "Invalid comment id supplied" (sent `GET /api/comments/not-an-id`; also tried `-1`, `1.5`, `0`, `%20`, `!!`) | 404 `{}` | `tests/ai-comments.spec.ts`: "GET /api/comments/{id} non-numeric id returns 400" |
| HEAD /api/comments/{id} | 400 "Invalid comment ID" (sent `HEAD /api/comments/not-an-id`; same other ids tried) | 404 | `tests/ai-comments.spec.ts`: "HEAD /api/comments/{id} non-numeric id returns 400" |

## Not reachable (no test written)
| Operation | Status | Why |
|---|---|---|
| PUT /api/articles/{id} | 404 | PUT on an unknown id creates the article (201, also documented), so "Article not found" never happens: `PUT /api/articles/<unused id>` with a valid body returns 201. `endpoints/articles-endpoint.helpers.js` has no 404 branch for PUT. |
| DELETE /api/articles/{id} | 400 | The spec gives no condition ("Bad Request") and DELETE takes no body. Non-numeric id (`/api/articles/abc`), unknown id and an already deleted id all return 404 `{}`; the handler has no 400 branch for DELETE. |
| PUT /api/comments/{id} | 404 | PUT on an unknown id creates the comment (201, also documented), so "Comment not found" never happens: `PUT /api/comments/<unused id>` with a valid body returns 201 (see the 201 test in `tests/ai-comments.spec.ts`). `endpoints/comments-endpoint.helpers.js` rewrites such a PUT to a POST and has no 404 branch for PUT. |
