import { test, expect } from '../framework/api';
import { expectJsonHas, expectStatus } from '../framework/assertions';

/** A day in the past: GAD rejects dates it considers in the future (see notes/discovery.md). */
function pastDate(): string {
  return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
}

// ---------- GET /api/articles/{id}/stats ----------

test('GET /api/articles/{id}/stats existing article returns 200', async ({ api, authApi }) => {
  const stamp = Date.now();
  const created = await authApi.post('/api/articles', {
    data: { title: `QA ai stats article ${stamp}`, body: 'five words in this body', date: pastDate() },
  });
  await expectStatus(created, 201);
  const { id } = await expectJsonHas(created, 'id');
  const commented = await authApi.post('/api/comments', {
    data: { article_id: id, body: `QA ai stats comment ${stamp}`, date: pastDate() },
  });
  await expectStatus(commented, 201);
  const { id: commentId } = await expectJsonHas(commented, 'id');
  // GAD answers a write before the record is readable, so wait until the comment is visible.
  await expect
    .poll(async () => (await authApi.get(`/api/comments/${commentId}`)).status(), { timeout: 5_000 })
    .toBe(200);

  const res = await api.get(`/api/articles/${id}/stats`);

  await expectStatus(res, 200);
  const stats = await expectJsonHas(res, 'id', 'comments', 'words');
  expect(String(stats.id)).toBe(String(id));
  expect(stats.comments, 'number of comments on the article').toBe(1);
  expect(stats.words, 'number of words in the article body').toBe(5);
});

test('GET /api/articles/{id}/stats unknown id returns 404', async ({ api }) => {
  const res = await api.get(`/api/articles/${Date.now()}/stats`);

  await expectStatus(res, 404);
  expect(await res.json(), 'body is the documented empty object').toEqual({});
});
