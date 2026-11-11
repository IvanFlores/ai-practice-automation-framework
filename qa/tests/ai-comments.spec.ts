import { test, expect, type Api } from '../framework/api';
import { expectJsonHas, expectStatus } from '../framework/assertions';

/** A day in the past: GAD rejects dates it considers in the future (see notes/discovery.md). */
function pastDate(): string {
  return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
}

/** Creates an article owned by the logged-in user and returns its id. */
async function createArticle(authApi: Api): Promise<unknown> {
  const stamp = Date.now();
  const res = await authApi.post('/api/articles', {
    data: { title: `QA ai comments article ${stamp}`, body: `Parent article for comment tests ${stamp}`, date: pastDate() },
  });
  await expectStatus(res, 201);
  const article = await expectJsonHas(res, 'id');
  return article.id;
}

function newComment(articleId: unknown) {
  return {
    article_id: articleId,
    body: `QA ai comment ${Date.now()}`,
    date: pastDate(),
  };
}

/** Creates an article plus a comment on it, both owned by the logged-in user. */
async function createComment(authApi: Api): Promise<{ id: unknown; articleId: unknown }> {
  const articleId = await createArticle(authApi);
  const res = await authApi.post('/api/comments', { data: newComment(articleId) });
  await expectStatus(res, 201);
  const comment = await expectJsonHas(res, 'id');
  return { id: comment.id, articleId };
}

/**
 * Malformed JSON for the documented "400 Bad request - malformed JSON" cases.
 * Sent as a Buffer so Playwright does not re-serialize it into valid JSON.
 */
const MALFORMED_JSON = { data: Buffer.from('{"body": '), headers: { 'Content-Type': 'application/json' } };

// ---------- GET /api/comments ----------

test('GET /api/comments list returns 200', async ({ api }) => {
  const res = await api.get('/api/comments');

  await expectStatus(res, 200);
  const comments: unknown = await res.json();
  expect(Array.isArray(comments), 'body is a JSON array of comments').toBe(true);
});

// ---------- POST /api/comments ----------

test('POST /api/comments valid comment returns 201', async ({ authApi }) => {
  const articleId = await createArticle(authApi);
  const data = newComment(articleId);

  const res = await authApi.post('/api/comments', { data });

  await expectStatus(res, 201);
  const comment = await expectJsonHas(res, 'id', 'user_id', 'article_id', 'body', 'date');
  expect(comment.body).toBe(data.body);
});

test('POST /api/comments malformed JSON returns 400', async ({ authApi }) => {
  const res = await authApi.post('/api/comments', MALFORMED_JSON);

  await expectStatus(res, 400);
});

test('POST /api/comments without token returns 401', async ({ api, authApi }) => {
  const articleId = await createArticle(authApi);

  const res = await api.post('/api/comments', { data: newComment(articleId) });

  await expectStatus(res, 401);
});

test('POST /api/comments missing body returns 422', async ({ authApi }) => {
  const articleId = await createArticle(authApi);
  const { article_id, date } = newComment(articleId);

  const res = await authApi.post('/api/comments', { data: { article_id, date } });

  await expectStatus(res, 422);
});

// ---------- GET /api/comments/{id} ----------

test('GET /api/comments/{id} existing comment returns 200', async ({ api, authApi }) => {
  const { id } = await createComment(authApi);

  const res = await api.get(`/api/comments/${id}`);

  await expectStatus(res, 200);
  await expectJsonHas(res, 'id', 'user_id', 'article_id', 'body', 'date');
});

test('GET /api/comments/{id} non-numeric id returns 400', async ({ api }) => {
  test.fail(true, 'spec mismatch: app returns 404');
  const res = await api.get('/api/comments/not-an-id');

  await expectStatus(res, 400);
});

test('GET /api/comments/{id} unknown id returns 404', async ({ api }) => {
  const res = await api.get(`/api/comments/${Date.now()}`);

  await expectStatus(res, 404);
});

// ---------- PUT /api/comments/{id} ----------

test('PUT /api/comments/{id} existing comment returns 200', async ({ authApi }) => {
  const { id, articleId } = await createComment(authApi);
  const update = newComment(articleId);

  const res = await authApi.put(`/api/comments/${id}`, { data: update });

  await expectStatus(res, 200);
  const comment = await expectJsonHas(res, 'id', 'user_id', 'article_id', 'body', 'date');
  expect(comment.body).toBe(update.body);
});

test('PUT /api/comments/{id} unknown id returns 201', async ({ authApi }) => {
  const articleId = await createArticle(authApi);

  const res = await authApi.put(`/api/comments/${Date.now()}`, { data: newComment(articleId) });

  await expectStatus(res, 201);
  await expectJsonHas(res, 'id', 'user_id', 'article_id', 'body', 'date');
});

test('PUT /api/comments/{id} malformed JSON returns 400', async ({ authApi }) => {
  const { id } = await createComment(authApi);

  const res = await authApi.put(`/api/comments/${id}`, MALFORMED_JSON);

  await expectStatus(res, 400);
});

test('PUT /api/comments/{id} without token returns 401', async ({ api, authApi }) => {
  const { id, articleId } = await createComment(authApi);

  const res = await api.put(`/api/comments/${id}`, { data: newComment(articleId) });

  await expectStatus(res, 401);
});

test('PUT /api/comments/{id} missing body returns 422', async ({ authApi }) => {
  const { id, articleId } = await createComment(authApi);
  const { article_id, date } = newComment(articleId);

  const res = await authApi.put(`/api/comments/${id}`, { data: { article_id, date } });

  await expectStatus(res, 422);
});

// ---------- PATCH /api/comments/{id} ----------

test('PATCH /api/comments/{id} new body returns 200', async ({ authApi }) => {
  const { id } = await createComment(authApi);
  const body = `Patched by the qa suite at ${Date.now()}`;

  const res = await authApi.patch(`/api/comments/${id}`, { data: { body } });

  await expectStatus(res, 200);
  const comment = await expectJsonHas(res, 'id', 'user_id', 'article_id', 'body', 'date');
  expect(comment.body).toBe(body);
});

test('PATCH /api/comments/{id} malformed JSON returns 400', async ({ authApi }) => {
  const { id } = await createComment(authApi);

  const res = await authApi.patch(`/api/comments/${id}`, MALFORMED_JSON);

  await expectStatus(res, 400);
});

test('PATCH /api/comments/{id} without token returns 401', async ({ api, authApi }) => {
  const { id } = await createComment(authApi);

  const res = await api.patch(`/api/comments/${id}`, { data: { body: 'patched without token' } });

  await expectStatus(res, 401);
});

test('PATCH /api/comments/{id} unknown id returns 404', async ({ authApi }) => {
  const res = await authApi.patch(`/api/comments/${Date.now()}`, { data: { body: 'patched unknown comment' } });

  await expectStatus(res, 404);
});

test('PATCH /api/comments/{id} empty body field returns 422', async ({ authApi }) => {
  const { id } = await createComment(authApi);

  const res = await authApi.patch(`/api/comments/${id}`, { data: { body: '' } });

  await expectStatus(res, 422);
});

// ---------- DELETE /api/comments/{id} ----------

test('DELETE /api/comments/{id} own comment returns 200', async ({ authApi }) => {
  const { id } = await createComment(authApi);

  const res = await authApi.delete(`/api/comments/${id}`);

  await expectStatus(res, 200);
  await expectStatus(await authApi.get(`/api/comments/${id}`), 404);
});

test('DELETE /api/comments/{id} without token returns 401', async ({ api, authApi }) => {
  const { id } = await createComment(authApi);

  const res = await api.delete(`/api/comments/${id}`);

  await expectStatus(res, 401);
});

test('DELETE /api/comments/{id} unknown id returns 404', async ({ authApi }) => {
  const res = await authApi.delete(`/api/comments/${Date.now()}`);

  await expectStatus(res, 404);
});

// ---------- HEAD /api/comments/{id} ----------

test('HEAD /api/comments/{id} existing comment returns 200', async ({ api, authApi }) => {
  const { id } = await createComment(authApi);

  const res = await api.head(`/api/comments/${id}`);

  await expectStatus(res, 200);
});

test('HEAD /api/comments/{id} non-numeric id returns 400', async ({ api }) => {
  test.fail(true, 'spec mismatch: app returns 404');
  const res = await api.head('/api/comments/not-an-id');

  await expectStatus(res, 400);
});

test('HEAD /api/comments/{id} unknown id returns 404', async ({ api }) => {
  const res = await api.head(`/api/comments/${Date.now()}`);

  await expectStatus(res, 404);
});
