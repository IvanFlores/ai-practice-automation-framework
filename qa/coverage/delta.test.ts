import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeCoverage, parseSpec, type LoggedCall } from './core';
import { COMMENT_MARKER, computeDelta, coverageDropped, describeGap, formatHtml, formatMarkdown } from './delta';

const spec = parseSpec({
  openapi: '3.0.1',
  servers: [{ url: '/api' }],
  paths: {
    '/articles/{id}': {
      get: { tags: ['articles'], responses: { 200: {}, 404: {} } },
      delete: { tags: ['articles'], responses: { 200: {}, 401: {} } },
    },
    '/games': { get: { tags: ['games'], responses: { 200: {}, 400: {}, 500: {} } } },
  },
});
const call = (method: string, path: string, status: number): LoggedCall => ({ method, path, status, query: [], hasBody: false });

const base = computeCoverage(spec, [call('GET', '/api/articles/1', 200)]);
const head = computeCoverage(spec, [call('GET', '/api/articles/1', 404), call('DELETE', '/api/articles/1', 200)]);

test('delta reports the change, what is newly covered and what was lost', () => {
  const delta = computeDelta(head, base);
  assert.equal(delta.metrics[0]!.deltaCovered, 1);
  assert.equal(delta.metrics[0]!.deltaPercent, 33.4);
  assert.deepEqual(delta.newlyCovered.operations, ['DELETE /api/articles/{id}']);
  assert.deepEqual(delta.newlyCovered.statuses, ['GET /api/articles/{id} -> 404', 'DELETE /api/articles/{id} -> 200']);
  assert.deepEqual(delta.lost, { operations: [], statuses: ['GET /api/articles/{id} -> 200'] });
  assert.equal(coverageDropped(delta), false);
  assert.equal(coverageDropped(computeDelta(base, head)), true);
});

test('gaps introduced by a PR: new spec behaviour without a test, and coverage it removed', () => {
  const bigger = parseSpec({
    openapi: '3.0.1',
    servers: [{ url: '/api' }],
    paths: {
      '/articles/{id}': { get: { tags: ['articles'], responses: { 200: {}, 404: {} } } },
      '/articles/{id}/stats': { get: { tags: ['articles'], responses: { 200: {}, 404: {} } } },
    },
  });
  const before = computeCoverage(parseSpec({ openapi: '3.0.1', servers: [{ url: '/api' }], paths: { '/articles/{id}': { get: { tags: ['articles'], responses: { 200: {}, 404: {} } } } } }), [call('GET', '/api/articles/1', 200)]);
  const after = computeCoverage(bigger, [call('GET', '/api/articles/1', 200)]);
  const delta = computeDelta(after, before);
  assert.deepEqual(delta.introducedGaps.map(describeGap), [
    'GET /api/articles/{id}/stats: never called',
    'GET /api/articles/{id}/stats -> 200',
    'GET /api/articles/{id}/stats -> 404',
  ]);
  assert.equal(coverageDropped(delta), true);
  assert.match(formatMarkdown(delta), /Gaps introduced by this PR:\*\* 3/);
  assert.deepEqual(computeDelta(after, after).introducedGaps, []);
});

test('top gaps: missing statuses of called operations first, then uncovered operations', () => {
  const gaps = computeDelta(head, base).topGaps;
  assert.deepEqual(gaps.map((g) => `${g.kind} ${g.method} ${g.path}`), [
    'missing-statuses GET /api/articles/{id}',
    'missing-statuses DELETE /api/articles/{id}',
    'uncovered-operation GET /api/games',
  ]);
});

test('without a base there is no delta, and both renderers still work', () => {
  const delta = computeDelta(head, null);
  assert.equal(delta.hasBase, false);
  assert.equal(delta.metrics[0]!.deltaCovered, null);
  assert.equal(coverageDropped(delta), false);
  const md = formatMarkdown(delta);
  assert.ok(md.startsWith(COMMENT_MARKER));
  assert.match(md, /No baseline/);
  assert.match(formatHtml(head, delta, { title: 'T <x>', generatedAt: 'now' }), /<title>T &lt;x&gt;<\/title>/);
});
