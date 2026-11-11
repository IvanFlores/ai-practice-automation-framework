import assert from 'node:assert/strict';
import { test } from 'node:test';
import { placeTokens, renderPage, type HistoryRow } from './history';
import { sumUsage, transcriptDir, type PrTokens } from './tokens';

const call = (id: string, branch: string, timestamp: string, output: number, type = 'assistant') =>
  JSON.stringify({
    type,
    gitBranch: branch,
    timestamp,
    requestId: `req-${id}`,
    message: { id, usage: { input_tokens: 2, output_tokens: output, cache_creation_input_tokens: 10, cache_read_input_tokens: 100 } },
  });

test('sumUsage counts each call once, on the given branch only, up to the cut-off', () => {
  const lines = [
    call('a', 'feature', '2026-11-11T01:00:00Z', 5),
    call('a', 'feature', '2026-11-11T01:00:01Z', 50), // same call, later line with the full output count
    call('b', 'feature', '2026-11-11T02:00:00Z', 7),
    call('c', 'main', '2026-11-11T02:00:00Z', 1000),
    call('d', 'feature', '2026-11-11T02:00:00Z', 1000, 'user'),
    call('e', 'feature', '2026-11-11T05:00:00Z', 1000), // after the merge
    '{"type":"assistant","gitBranch":"feature"', // truncated line
    '',
  ];
  assert.deepEqual(sumUsage(lines, 'feature', '2026-11-11T03:00:00Z'), {
    messages: 2,
    input: 4,
    output: 57,
    cacheWrite: 20,
    cacheRead: 200,
    total: 281,
  });
  assert.equal(sumUsage(lines, 'feature').messages, 3);
  assert.equal(sumUsage(lines, 'nowhere').total, 0);
});

test('transcriptDir turns the project path into the folder name Claude Code uses', () => {
  assert.match(transcriptDir('C:/work/my-repo_1', '/home/u').replace(/\\/g, '/'), /\/home\/u\/\.claude\/projects\/C--work-my-repo-1$/);
});

const ratio = (covered: number, total: number) => ({ covered, total, percent: Math.round((covered / total) * 1000) / 10 });
const row = (sha: string, label: string): HistoryRow => ({
  date: `2026-11-1${sha.length}T00:00:00Z`,
  sha,
  label,
  tests: 1,
  testsFailed: false,
  operations: ratio(1, 10),
  statuses: ratio(1, 10),
  parameters: ratio(1, 10),
  requestBodies: ratio(1, 10),
});
const usage = (total: number, extra: Partial<PrTokens> = {}): PrTokens => ({
  branch: 'b',
  messages: 1,
  input: 0,
  output: total,
  cacheWrite: 0,
  cacheRead: 0,
  total,
  recordedAt: 'now',
  ...extra,
});

test('tokens land on the pinned commit, else on the merge row, else on no row', () => {
  const rows = [row('aaa1', 'batch commit'), row('bbb22', '#3 Add endpoint'), row('ccc333', '#30 Other')];
  const placed = placeTokens(rows, { prs: { '3': usage(30), '1': usage(10, { sha: 'aaa' }), '2': usage(20), '4': usage(40, { sha: 'zzz' }) } });
  assert.deepEqual(placed.map((p) => [p.pr, p.row]), [[1, 1], [2, null], [3, 2], [4, null]]);
  assert.deepEqual(placeTokens(rows, undefined), []);
});

test('page shows the token panel only when token data is given', () => {
  const rows = [row('aaa1', '#1 First')];
  const without = renderPage(rows, { generatedAt: 'now' });
  assert.ok(!without.includes('id="tokchart"'));
  assert.ok(!without.includes('AI tokens</th>'));
  const withTokens = renderPage(rows, { generatedAt: 'now', tokens: { prs: { '1': usage(2_500_000, { branch: '</script>' }) } } });
  assert.match(withTokens, /id="tokchart"/);
  assert.match(withTokens, /<b>2\.5M<\/b><span>AI tokens across 1 pull request</);
  assert.ok(!withTokens.includes('"branch":"</script>"'));
});
