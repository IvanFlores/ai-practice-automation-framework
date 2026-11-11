import assert from 'node:assert/strict';
import { test } from 'node:test';
import { labelFromCommitMessage, renderPage, upsert, type HistoryRow } from './history';

const ratio = (covered: number, total: number) => ({ covered, total, percent: Math.round((covered / total) * 1000) / 10 });
const row = (sha: string, date: string, covered: number): HistoryRow => ({
  date,
  sha,
  label: `commit ${sha}`,
  tests: covered,
  testsFailed: false,
  operations: ratio(covered, 170),
  statuses: ratio(covered, 387),
  parameters: ratio(1, 96),
  requestBodies: ratio(3, 41),
});

test('labels: merge commits become "#N title", other commits their first line', () => {
  assert.equal(labelFromCommitMessage('Merge pull request #3 from a/b\n\nAdd article stats endpoint'), '#3 Add article stats endpoint');
  assert.equal(labelFromCommitMessage('Fix typo\n\nbody'), 'Fix typo');
  assert.equal(labelFromCommitMessage(''), '(no message)');
});

test('upsert keeps date order and replaces a re-measured commit', () => {
  let rows = upsert([], row('bbb', '2026-11-11T00:00:00Z', 10));
  rows = upsert(rows, row('aaa', '2026-11-10T00:00:00Z', 4));
  rows = upsert(rows, row('bbb', '2026-11-11T00:00:00Z', 12));
  assert.deepEqual(rows.map((r) => [r.sha, r.operations.covered]), [['aaa', 4], ['bbb', 12]]);
});

test('page renders with zero, one and many rows, as a document or a fragment', () => {
  const many = [row('aaa', '2026-11-10T00:00:00Z', 4), row('bbb', '2026-11-11T00:00:00Z', 23)];
  const page = renderPage(many, { repo: 'o/r', generatedAt: 'now' });
  assert.ok(page.startsWith('<!doctype html>'));
  assert.match(page, /4 → 23 of 170/);
  assert.match(page, /"sha":"bbb"/);
  assert.ok(renderPage(many, { fragment: true, generatedAt: 'now' }).startsWith('<title>'));
  assert.match(renderPage([], { generatedAt: 'now' }), /0 measurements/);
  const hostile = renderPage([{ ...row('ccc', '2026-11-12T00:00:00Z', 5), label: '</script><b>x' }], { generatedAt: 'now' });
  assert.ok(!hostile.includes('</script><b>x'));
});
