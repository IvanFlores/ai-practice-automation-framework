# Day 3: spec mismatches and unreachable statuses

Found while generating tests from the gap list. The spec is the source of truth (CONVENTIONS.md section 4).

## Spec mismatches (test kept, marked `test.fail`)
| Operation | Spec says | App returns | Test |
|---|---|---|---|
| HEAD /api/articles/{id} | 400 "Invalid ID supplied" (sent `HEAD /api/articles/not-an-id`) | 404 | `tests/ai-articles.spec.ts`: "HEAD /api/articles/{id} non-numeric id returns 400" |
| GET /api/comments/{id} | 400 "Invalid comment id supplied" (sent `GET /api/comments/not-an-id`; also tried `-1`, `1.5`, `0`, `%20`, `!!`) | 404 `{}` | `tests/ai-comments.spec.ts`: "GET /api/comments/{id} non-numeric id returns 400" |
| HEAD /api/comments/{id} | 400 "Invalid comment ID" (sent `HEAD /api/comments/not-an-id`; same other ids tried) | 404 | `tests/ai-comments.spec.ts`: "HEAD /api/comments/{id} non-numeric id returns 400" |
| GET /api/users/{id} | 400 "Invalid user id supplied" (sent `GET /api/users/not-an-id`; also tried `-1`, `1.5`, `0`, `%20`, `!!`) | 404 `{}` | `tests/ai-users.spec.ts`: "GET /api/users/{id} non-numeric id returns 400" |
| HEAD /api/users/{id} | 400 "Invalid user ID" (sent `HEAD /api/users/not-an-id`; same other ids tried) | 404 | `tests/ai-users.spec.ts`: "HEAD /api/users/{id} non-numeric id returns 400" |
| PUT /api/users/{id} | 201 "User created" (sent `PUT /api/users/<unused id>` with a valid UserUpdate body and the token of a freshly created user) | 401 "Access token for given user is invalid!": the auth check in `endpoints/users-endpoint.helpers.js` requires the token's user to own the id in the URL, so an unused id is rejected before the create branch | `tests/ai-users.spec.ts`: "PUT /api/users/{id} unknown id returns 201" |
| PATCH /api/users/{id} | 404 "User not found" (sent `PATCH /api/users/<unused id>` `{"firstname": ...}` with the token of a freshly created user) | 401 "Access token for given user is invalid!" (same ownership check runs before any lookup) | `tests/ai-users.spec.ts`: "PATCH /api/users/{id} unknown id returns 404" |
| GET /api/book-shop-manage/items/by-book/{bookId} | 200 with one `BookShopItem` (sent `GET /api/book-shop-manage/items/by-book/1` as seed delivery coordinator, user 11) | 200 with the array of all items: the handler in `endpoints/book-shop/book-shop-manage-endpoint.helpers.js` has no `by-book` route (it only knows the undocumented `GET /items?book_id=1`), so the URL falls into "get all items" | `tests/ai-book-shop-manage.spec.ts`: "GET /api/book-shop-manage/items/by-book/{bookId} book with item returns 200" |
| GET /api/book-shop-manage/items/by-book/{bookId} | 404 "Item not found" (sent `GET /api/book-shop-manage/items/by-book/<unused id>`, also `99999`) | 200 with the array of all items (same missing route) | `tests/ai-book-shop-manage.spec.ts`: "GET /api/book-shop-manage/items/by-book/{bookId} unknown book id returns 404" |
| GET /api/book-shop-manage/users | 200 with `Users` (array of `User`: email, firstname, lastname, avatar) (sent `GET /api/book-shop-manage/users?id=2`) | 200 `{"2":{"name":"Danial Dicki"}}`: an object keyed by user id, not an array | `tests/ai-book-shop-manage.spec.ts`: "GET /api/book-shop-manage/users existing user id returns 200" |
| GET /api/book-shop-manage/users | 404 "User not found" (sent `GET /api/book-shop-manage/users?id=<unused id>`, also `99999999`) | 200 `{}`. The app answers 404 "User not found" only when the required `id` query parameter is left out | `tests/ai-book-shop-manage.spec.ts`: "GET /api/book-shop-manage/users unknown user id returns 404" |
| GET /api/book-shop-manage/team | 200 with `BookShopTeamMember[]` (required: id, user_id, role_id, joined_at) (sent `GET /api/book-shop-manage/team` as user 11) | 200 with members shaped `{id, user_name, avatar, role_name, created_at}`: no user_id, role_id or joined_at | `tests/ai-book-shop-manage.spec.ts`: "GET /api/book-shop-manage/team as delivery coordinator returns 200" |
| GET /api/book-shop-manage/team | 401 "Unauthorized" (operation is marked `bearerAuth`; sent `GET /api/book-shop-manage/team` without token) | 200 with the team list: the handler answers `/team` before it verifies the token | `tests/ai-book-shop-manage.spec.ts`: "GET /api/book-shop-manage/team without token returns 401" |

## Not reachable (no test written)
| Operation | Status | Why |
|---|---|---|
| PUT /api/articles/{id} | 404 | PUT on an unknown id creates the article (201, also documented), so "Article not found" never happens: `PUT /api/articles/<unused id>` with a valid body returns 201. `endpoints/articles-endpoint.helpers.js` has no 404 branch for PUT. |
| DELETE /api/articles/{id} | 400 | The spec gives no condition ("Bad Request") and DELETE takes no body. Non-numeric id (`/api/articles/abc`), unknown id and an already deleted id all return 404 `{}`; the handler has no 400 branch for DELETE. |
| PUT /api/comments/{id} | 404 | PUT on an unknown id creates the comment (201, also documented), so "Comment not found" never happens: `PUT /api/comments/<unused id>` with a valid body returns 201 (see the 201 test in `tests/ai-comments.spec.ts`). `endpoints/comments-endpoint.helpers.js` rewrites such a PUT to a POST and has no 404 branch for PUT. |
| PUT /api/users/{id} | 404 | The spec documents both 201 "User created" and 404 "User not found" for an unknown id; the 201 reading is kept as the test (see mismatches table). In the app, `PUT /api/users/<unused id>` and `PUT /api/users/not-an-id` with a valid body and a valid token both return 401 "Access token for given user is invalid!"; `endpoints/users-endpoint.helpers.js` has no 404 branch for PUT. |
| PATCH /api/book-shop-manage/orders/{id} | 422 ("Order has no items" half only) | The 422 status itself is covered by the "not enough funds" test in `tests/ai-book-shop-manage.spec.ts`. The "no items" condition was not tested: `endpoints/book-shop/book-shop-manage-endpoint.helpers.js` has no empty-order check, and moving an empty order to "sent" would run `registerSentOrder` against the caller's account, i.e. write a payment-history row for the seed staff account (user 11). Not sent, to keep seed data untouched. |


## Blocked: likes (batch 3 held back from the suite)
GAD ships with the feature flag `feature_likes: false` (`config/config-features.js`). With it off, every `/api/likes*`
request answers 404 `{}` (only malformed JSON gets 400), so the documented behaviour cannot be exercised.
The AI batch still wrote 14 tests: 8 would be expected failures and 5 of the 6 passing ones pass only because the
module is disabled, which would count as coverage for the wrong reason. The file is therefore kept out of `tests/`
as `notes/day3_likes_batch_blocked.spec.ts`. To cover likes, the flag has to be enabled for the test environment
(e.g. in `framework/global-setup.ts` via `POST /api/config/features`), then the batch regenerated: with the flag on,
the handler is expected to answer 200 to GETs by unknown id and to read an undocumented `userid` header on POST.
