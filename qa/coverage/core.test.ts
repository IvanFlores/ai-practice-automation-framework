// Unit tests for the coverage tool itself (no server needed):  npm run test:coverage-tool
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildGaps, computeCoverage, matchOperation, parseSpec, type LoggedCall } from './core';

const spec = parseSpec({
  openapi: '3.0.1',
  servers: [{ url: '/api' }],
  paths: {
    '/articles': { get: { parameters: [{ in: 'query', name: '_limit' }], responses: { 200: {} } } },
    '/articles/{id}': {
      get: { parameters: [{ in: 'path', name: 'id', required: true }], responses: { 200: {}, 404: {} } },
      delete: { security: [{ bearerAuth: [] }], responses: { 200: {}, 401: {} } },
    },
    '/articles/search': { get: { responses: { 200: {} } } },
    '/likes/mine': { get: { parameters: [{ in: 'header', name: 'userid' }], responses: { 200: {} } } },
    '/users': { post: { requestBody: {}, responses: { 201: {}, 422: {} } } },
    '/api/books/{id}': { patch: { responses: { 200: {} } } },
  },
});

const call = (method: string, path: string, status: number, extra: Partial<LoggedCall> = {}): LoggedCall => ({
  method,
  path,
  status,
  query: [],
  hasBody: false,
  ...extra,
});

test('paths get the server prefix, and an already-prefixed path is not doubled', () => {
  assert.ok(spec.operations.some((o) => o.path === '/api/articles/{id}'));
  assert.ok(spec.operations.some((o) => o.method === 'PATCH' && o.path === '/api/books/{id}'));
  assert.equal(spec.notes.length, 1);
});

test('templates match real paths, and the literal path wins over the placeholder', () => {
  assert.equal(matchOperation(spec.operations, 'GET', '/api/articles/60')?.path, '/api/articles/{id}');
  assert.equal(matchOperation(spec.operations, 'GET', '/api/articles/search')?.path, '/api/articles/search');
  assert.equal(matchOperation(spec.operations, 'GET', '/api/articles/')?.path, '/api/articles');
});

test('wrong method, wrong depth and missing prefix do not match', () => {
  assert.equal(matchOperation(spec.operations, 'PUT', '/api/articles/60'), undefined);
  assert.equal(matchOperation(spec.operations, 'GET', '/api/articles/60/comments'), undefined);
  assert.equal(matchOperation(spec.operations, 'GET', '/articles/60'), undefined);
});

test('statuses, parameters, bodies and unmatched calls are diffed', () => {
  const report = computeCoverage(spec, [
    call('GET', '/api/articles/1', 200),
    call('GET', '/api/articles/1', 500),
    call('GET', '/api/articles', 200, { query: ['_limit'] }),
    call('GET', '/api/likes/mine', 200, { headers: ['UserId'] }),
    call('POST', '/api/users', 201, { hasBody: true }),
    call('GET', '/api/nope', 404),
  ]);
  const get = report.operations.find((o) => o.method === 'GET' && o.path === '/api/articles/{id}')!;
  assert.deepEqual(get.statuses, { documented: ['200', '404'], covered: ['200'], missing: ['404'], undocumented: [500] });
  assert.deepEqual(report.summary.operations, { covered: 4, total: 7, percent: 57.1 });
  assert.deepEqual(report.summary.statuses, { covered: 4, total: 10, percent: 40 });
  assert.deepEqual(report.summary.parameters, { covered: 3, total: 3, percent: 100 });
  assert.deepEqual(report.summary.requestBodies, { covered: 1, total: 1, percent: 100 });
  assert.deepEqual(report.unmatchedCalls, [{ method: 'GET', path: '/api/nope', status: 404, count: 1 }]);

  const gaps = buildGaps(report);
  assert.equal(gaps.filter((g) => g.type === 'operation').length, 3);
  assert.ok(gaps.some((g) => g.type === 'status' && g.path === '/api/articles/{id}' && g.method === 'GET' && g.status === '404'));
  assert.ok(gaps.some((g) => g.type === 'status' && g.method === 'DELETE' && g.secured && !g.operationCovered));
});
