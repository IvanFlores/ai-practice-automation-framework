import { test } from '../framework/api';
import { expectJsonHas, expectStatus } from '../framework/assertions';

function newArticle() {
  const stamp = Date.now();
  return {
    title: `QA delete article ${stamp}`,
    body: `Article created by the qa suite to be deleted at ${stamp}`,
    // A day in the past: GAD reads "...Z" dates as local time and rejects "future" dates (see notes/discovery.md).
    date: new Date(stamp - 24 * 60 * 60 * 1000).toISOString(),
  };
}

test('DELETE /api/articles/{id} own article returns 200', async ({ api, authApi }) => {
  // Create the article to delete inside the test (no hardcoded IDs).
  const created = await authApi.post('/api/articles', { data: newArticle() });
  await expectStatus(created, 201);
  const { id } = await expectJsonHas(created, 'id');

  const res = await authApi.delete(`/api/articles/${id}`);

  // The spec documents 200 "Article deleted" with no response body schema, so only the status is asserted.
  await expectStatus(res, 200);

  // The article must be gone: GET /api/articles/{id} documents 404 "Article not found".
  const after = await api.get(`/api/articles/${id}`);
  await expectStatus(after, 404);
});
