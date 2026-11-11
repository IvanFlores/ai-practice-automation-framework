import { test, expect, type Api } from '../framework/api';
import { expectJsonHas, expectStatus } from '../framework/assertions';

function newArticle() {
  const stamp = Date.now();
  return {
    title: `QA ai article ${stamp}`,
    body: `Body written by the qa suite at ${stamp}`,
    // A day in the past: GAD rejects dates it considers in the future (see notes/discovery.md).
    date: new Date(stamp - 24 * 60 * 60 * 1000).toISOString(),
  };
}

/** Creates an article owned by the logged-in user and returns its id. */
async function createArticle(authApi: Api): Promise<unknown> {
  const res = await authApi.post('/api/articles', { data: newArticle() });
  await expectStatus(res, 201);
  const article = await expectJsonHas(res, 'id');
  return article.id;
}

/**
 * Malformed JSON for the documented "400 Bad request - malformed JSON" cases.
 * Sent as a Buffer so Playwright does not re-serialize it into valid JSON.
 */
const MALFORMED_JSON = { data: Buffer.from('{"title": '), headers: { 'Content-Type': 'application/json' } };

// ---------- authentication: GET /api/login ----------

test('GET /api/login valid token returns 200', async ({ authApi }) => {
  const res = await authApi.get('/api/login');

  await expectStatus(res, 200);
});

test('GET /api/login without token returns 401', async ({ api }) => {
  const res = await api.get('/api/login');

  await expectStatus(res, 401);
});

// ---------- GET /api/articles ----------

test('GET /api/articles list returns 200', async ({ api }) => {
  const res = await api.get('/api/articles');

  await expectStatus(res, 200);
  const articles: unknown = await res.json();
  expect(Array.isArray(articles), 'body is a JSON array of articles').toBe(true);
});

// ---------- POST /api/articles ----------

test('POST /api/articles malformed JSON returns 400', async ({ authApi }) => {
  const res = await authApi.post('/api/articles', MALFORMED_JSON);

  await expectStatus(res, 400);
});

test('POST /api/articles missing title returns 422', async ({ authApi }) => {
  const { body, date } = newArticle();

  const res = await authApi.post('/api/articles', { data: { body, date } });

  await expectStatus(res, 422);
});

// ---------- PUT /api/articles/{id} ----------

test('PUT /api/articles/{id} existing article returns 200', async ({ authApi }) => {
  const id = await createArticle(authApi);
  const update = newArticle();

  const res = await authApi.put(`/api/articles/${id}`, { data: update });

  await expectStatus(res, 200);
  const article = await expectJsonHas(res, 'id', 'user_id', 'title', 'body', 'date');
  expect(article.title).toBe(update.title);
});

test('PUT /api/articles/{id} unknown id returns 201', async ({ authApi }) => {
  const res = await authApi.put(`/api/articles/${Date.now()}`, { data: newArticle() });

  await expectStatus(res, 201);
  await expectJsonHas(res, 'id', 'user_id', 'title', 'body', 'date');
});

test('PUT /api/articles/{id} malformed JSON returns 400', async ({ authApi }) => {
  const id = await createArticle(authApi);

  const res = await authApi.put(`/api/articles/${id}`, MALFORMED_JSON);

  await expectStatus(res, 400);
});

test('PUT /api/articles/{id} without token returns 401', async ({ api, authApi }) => {
  const id = await createArticle(authApi);

  const res = await api.put(`/api/articles/${id}`, { data: newArticle() });

  await expectStatus(res, 401);
});

test('PUT /api/articles/{id} missing title returns 422', async ({ authApi }) => {
  const id = await createArticle(authApi);
  const { body, date } = newArticle();

  const res = await authApi.put(`/api/articles/${id}`, { data: { body, date } });

  await expectStatus(res, 422);
});

// ---------- PATCH /api/articles/{id} ----------

test('PATCH /api/articles/{id} new body returns 200', async ({ authApi }) => {
  const id = await createArticle(authApi);
  const body = `Patched by the qa suite at ${Date.now()}`;

  const res = await authApi.patch(`/api/articles/${id}`, { data: { body } });

  await expectStatus(res, 200);
  const article = await expectJsonHas(res, 'id', 'user_id', 'title', 'body', 'date');
  expect(article.body).toBe(body);
});

test('PATCH /api/articles/{id} malformed JSON returns 400', async ({ authApi }) => {
  const id = await createArticle(authApi);

  const res = await authApi.patch(`/api/articles/${id}`, MALFORMED_JSON);

  await expectStatus(res, 400);
});

test('PATCH /api/articles/{id} without token returns 401', async ({ api, authApi }) => {
  const id = await createArticle(authApi);

  const res = await api.patch(`/api/articles/${id}`, { data: { body: 'patched without token' } });

  await expectStatus(res, 401);
});

test('PATCH /api/articles/{id} unknown id returns 404', async ({ authApi }) => {
  const res = await authApi.patch(`/api/articles/${Date.now()}`, { data: { body: 'patched unknown article' } });

  await expectStatus(res, 404);
});

test('PATCH /api/articles/{id} empty title returns 422', async ({ authApi }) => {
  const id = await createArticle(authApi);

  const res = await authApi.patch(`/api/articles/${id}`, { data: { title: '' } });

  await expectStatus(res, 422);
});

// ---------- DELETE /api/articles/{id} ----------

test('DELETE /api/articles/{id} own article returns 200', async ({ authApi }) => {
  const id = await createArticle(authApi);

  const res = await authApi.delete(`/api/articles/${id}`);

  await expectStatus(res, 200);
  await expectStatus(await authApi.get(`/api/articles/${id}`), 404);
});

test('DELETE /api/articles/{id} without token returns 401', async ({ api, authApi }) => {
  const id = await createArticle(authApi);

  const res = await api.delete(`/api/articles/${id}`);

  await expectStatus(res, 401);
});

// ---------- HEAD /api/articles/{id} ----------

test('HEAD /api/articles/{id} seeded article returns 200', async ({ api }) => {
  // Read-only request on seed data (article 1 from db-base.json).
  const res = await api.head('/api/articles/1');

  await expectStatus(res, 200);
});

test('HEAD /api/articles/{id} non-numeric id returns 400', async ({ api }) => {
  test.fail(true, 'spec mismatch: app returns 404');
  const res = await api.head('/api/articles/not-an-id');

  await expectStatus(res, 400);
});

test('HEAD /api/articles/{id} unknown id returns 404', async ({ api }) => {
  const res = await api.head(`/api/articles/${Date.now()}`);

  await expectStatus(res, 404);
});
