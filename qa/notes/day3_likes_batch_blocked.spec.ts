import { test, expect, type Api } from '../framework/api';
import { expectJsonHas, expectStatus } from '../framework/assertions';

/*
 * GAD ships with the feature flag `feature_likes` off (config/config-features.js), and tests must not call
 * /api/config/* (CONVENTIONS.md section 5). With the flag off every /api/likes* request with a parseable body
 * is answered 404 `{}`. So in this file:
 *  - every documented 200/201/422/400(mylikes) test is a spec mismatch marked `test.fail` (app returns 404);
 *  - the 404 tests pass, but the 404 comes from the disabled module, not from the unknown id.
 * See notes/day3_spec_mismatches.md.
 */

/** A day in the past: GAD rejects dates it considers in the future (see notes/discovery.md). */
function pastDate(): string {
  return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
}

/** Creates an article owned by the logged-in user. Returns its id and the owner's user id. */
async function createArticle(authApi: Api): Promise<{ articleId: unknown; userId: unknown }> {
  const stamp = Date.now();
  const res = await authApi.post('/api/articles', {
    data: { title: `QA ai likes article ${stamp}`, body: `Parent article for like tests ${stamp}`, date: pastDate() },
  });
  await expectStatus(res, 201);
  const article = await expectJsonHas(res, 'id', 'user_id');
  return { articleId: article.id, userId: article.user_id };
}

/** Creates an article plus a comment on it, both owned by the logged-in user. */
async function createComment(authApi: Api): Promise<{ commentId: unknown; articleId: unknown; userId: unknown }> {
  const { articleId, userId } = await createArticle(authApi);
  const res = await authApi.post('/api/comments', {
    data: { article_id: articleId, body: `QA ai likes comment ${Date.now()}`, date: pastDate() },
  });
  await expectStatus(res, 201);
  const comment = await expectJsonHas(res, 'id');
  return { commentId: comment.id, articleId, userId };
}

/**
 * Malformed JSON for the documented "400 Bad request - malformed JSON" case.
 * Sent as a Buffer so Playwright does not re-serialize it into valid JSON.
 */
const MALFORMED_JSON = { data: Buffer.from('{"article_id": '), headers: { 'Content-Type': 'application/json' } };

// ---------- POST /api/likes ----------

test('POST /api/likes new like for article returns 201', async ({ authApi }) => {
  test.fail(true, 'spec mismatch: app returns 404');
  const { articleId, userId } = await createArticle(authApi);

  const res = await authApi.post('/api/likes', { data: { article_id: articleId, user_id: userId, date: pastDate() } });

  await expectStatus(res, 201);
  const like = await expectJsonHas(res, 'user_id', 'date');
  expect(like.article_id).toBe(articleId);
});

test('POST /api/likes already liked article returns 200', async ({ authApi }) => {
  test.fail(true, 'spec mismatch: app returns 404');
  const { articleId, userId } = await createArticle(authApi);
  const data = { article_id: articleId, user_id: userId, date: pastDate() };
  await expectStatus(await authApi.post('/api/likes', { data }), 201);

  const res = await authApi.post('/api/likes', { data });

  await expectStatus(res, 200);
});

test('POST /api/likes malformed JSON returns 400', async ({ authApi }) => {
  const res = await authApi.post('/api/likes', MALFORMED_JSON);

  await expectStatus(res, 400);
});

test('POST /api/likes unknown article returns 404', async ({ authApi }) => {
  const { userId } = await createArticle(authApi);

  const res = await authApi.post('/api/likes', { data: { article_id: Date.now(), user_id: userId, date: pastDate() } });

  await expectStatus(res, 404);
});

test('POST /api/likes both article_id and comment_id returns 422', async ({ authApi }) => {
  test.fail(true, 'spec mismatch: app returns 404');
  const { commentId, articleId, userId } = await createComment(authApi);

  const res = await authApi.post('/api/likes', {
    data: { article_id: articleId, comment_id: commentId, user_id: userId, date: pastDate() },
  });

  await expectStatus(res, 422);
});

// ---------- GET /api/likes/article/{id} ----------

test('GET /api/likes/article/{id} existing article returns 200', async ({ api, authApi }) => {
  test.fail(true, 'spec mismatch: app returns 404');
  const { articleId } = await createArticle(authApi);

  const res = await api.get(`/api/likes/article/${articleId}`);

  await expectStatus(res, 200);
  await expectJsonHas(res, 'likes');
});

test('GET /api/likes/article/{id} unknown id returns 404', async ({ api }) => {
  const res = await api.get(`/api/likes/article/${Date.now()}`);

  await expectStatus(res, 404);
});

// ---------- GET /api/likes/article ----------

test('GET /api/likes/article with article id returns 200', async ({ api, authApi }) => {
  test.fail(true, 'spec mismatch: app returns 404');
  const { articleId } = await createArticle(authApi);

  const res = await api.get('/api/likes/article', { params: { id: String(articleId) } });

  await expectStatus(res, 200);
  await expectJsonHas(res, 'likes');
});

test('GET /api/likes/article without article id returns 404', async ({ api }) => {
  const res = await api.get('/api/likes/article');

  await expectStatus(res, 404);
});

// ---------- GET /api/likes/comment/{id} ----------

test('GET /api/likes/comment/{id} existing comment returns 200', async ({ api, authApi }) => {
  test.fail(true, 'spec mismatch: app returns 404');
  const { commentId } = await createComment(authApi);

  const res = await api.get(`/api/likes/comment/${commentId}`);

  await expectStatus(res, 200);
  await expectJsonHas(res, 'likes');
});

test('GET /api/likes/comment/{id} unknown id returns 404', async ({ api }) => {
  const res = await api.get(`/api/likes/comment/${Date.now()}`);

  await expectStatus(res, 404);
});

// ---------- GET /api/likes/article/mylikes ----------

test('GET /api/likes/article/mylikes with article id and userid returns 200', async ({ api, authApi }) => {
  test.fail(true, 'spec mismatch: app returns 404');
  const { articleId, userId } = await createArticle(authApi);

  const res = await api.get('/api/likes/article/mylikes', {
    params: { id: String(articleId) },
    headers: { userid: String(userId) },
  });

  await expectStatus(res, 200);
  await expectJsonHas(res, 'likes');
});

test('GET /api/likes/article/mylikes without required id and userid returns 400', async ({ api }) => {
  test.fail(true, 'spec mismatch: app returns 404');
  const res = await api.get('/api/likes/article/mylikes');

  await expectStatus(res, 400);
});

test('GET /api/likes/article/mylikes unknown article id returns 404', async ({ api, authApi }) => {
  const { userId } = await createArticle(authApi);

  const res = await api.get('/api/likes/article/mylikes', {
    params: { id: Date.now() },
    headers: { userid: String(userId) },
  });

  await expectStatus(res, 404);
});
