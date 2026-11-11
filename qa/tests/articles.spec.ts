import { test } from '../framework/api';
import { expectJsonHas, expectStatus } from '../framework/assertions';

function newArticle() {
  const stamp = Date.now();
  return {
    title: `QA article ${stamp}`,
    body: `Body written by the qa suite at ${stamp}`,
    // A day in the past: GAD reads "...Z" dates as local time and rejects "future" dates (see notes/discovery.md).
    date: new Date(stamp - 24 * 60 * 60 * 1000).toISOString(),
  };
}

test('GET /api/articles/{id} seeded article returns 200', async ({ api }) => {
  // Read-only GET of seed data (article 1 from db-base.json).
  const res = await api.get('/api/articles/1');

  await expectStatus(res, 200);
  await expectJsonHas(res, 'id', 'user_id', 'title', 'body', 'date');
});

test('GET /api/articles/{id} unknown id returns 404', async ({ api }) => {
  const res = await api.get(`/api/articles/${Date.now()}`);

  await expectStatus(res, 404);
});

test('POST /api/articles valid article returns 201', async ({ authApi }) => {
  const res = await authApi.post('/api/articles', { data: newArticle() });

  await expectStatus(res, 201);
  await expectJsonHas(res, 'id', 'user_id', 'title', 'body', 'date');
});

test('POST /api/articles without token returns 401', async ({ api }) => {
  const res = await api.post('/api/articles', { data: newArticle() });

  await expectStatus(res, 401);
});
