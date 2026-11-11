import { test, expect } from '../framework/api';
import { expectJsonHas, expectStatus } from '../framework/assertions';

const STATS = '/api/stats';

/** Properties the spec schema `UserActivityStats` documents for one user's entry. */
const ACTIVITY_KEYS = ['user', 'userActivityByDay', 'userActivityByMonth', 'userActivityByYear'];
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** Asserts one user's activity entry has the shape the spec schema `UserActivityStats` documents. */
function expectActivityEntry(entry: unknown, userId: number): void {
  const where = `activity entry of user ${userId}: ${JSON.stringify(entry)}`;
  expect(typeof entry === 'object' && entry !== null, `${where} is not an object`).toBe(true);
  const activity = entry as Record<string, Record<string, Record<string, unknown>>>;
  for (const key of ACTIVITY_KEYS) {
    expect(activity, `${where} is missing "${key}"`).toHaveProperty(key);
  }
  expect(activity.user.id).toBe(userId);
  expect(typeof activity.user.name).toBe('string');
  for (const [group, periods] of [
    ['userActivityByDay', DAYS],
    ['userActivityByMonth', MONTHS],
  ] as const) {
    for (const period of periods) {
      expect(activity[group], `${where}: ${group} is missing "${period}"`).toHaveProperty(period);
      expect(Number.isInteger(activity[group][period].articles), `${group}.${period}.articles is an integer`).toBe(true);
      expect(Number.isInteger(activity[group][period].comments), `${group}.${period}.comments is an integer`).toBe(true);
    }
  }
}

// The spec documents no response schema ("content": {}) for the operations below except the two activity ones,
// so their tests assert the status and that the body is a JSON object, nothing more.

// ---------- GET /api/stats/users ----------

test('GET /api/stats/users with chartType table returns 200', async ({ api }) => {
  const res = await api.get(`${STATS}/users`, { params: { chartType: 'table' } });

  await expectStatus(res, 200);
  await expectJsonHas(res);
});

// ---------- GET /api/stats/articles ----------

test('GET /api/stats/articles with chartType pie returns 200', async ({ api }) => {
  const res = await api.get(`${STATS}/articles`, { params: { chartType: 'pie' } });

  await expectStatus(res, 200);
  await expectJsonHas(res);
});

// ---------- GET /api/stats/publications/articles ----------

test('GET /api/stats/publications/articles returns 200', async ({ api }) => {
  const res = await api.get(`${STATS}/publications/articles`);

  await expectStatus(res, 200);
  await expectJsonHas(res);
});

// ---------- GET /api/stats/publications/comments ----------

test('GET /api/stats/publications/comments returns 200', async ({ api }) => {
  const res = await api.get(`${STATS}/publications/comments`);

  await expectStatus(res, 200);
  await expectJsonHas(res);
});

// ---------- GET /api/stats/activity/user ----------

test('GET /api/stats/activity/user returns 200', async ({ api }) => {
  const res = await api.get(`${STATS}/activity/user`);

  await expectStatus(res, 200);
  // UserActivityStats: an object keyed by user id; seed user 1 is always there.
  const stats = await expectJsonHas(res, '1');
  expectActivityEntry(stats['1'], 1);
});

// ---------- GET /api/stats/activity/user/{id} ----------

test('GET /api/stats/activity/user/{id} seed user returns 200', async ({ api }) => {
  const res = await api.get(`${STATS}/activity/user/1`);

  await expectStatus(res, 200);
  const stats = await expectJsonHas(res, ...ACTIVITY_KEYS);
  expectActivityEntry(stats, 1);
});

// ---------- GET /api/stats/api, /api/stats/nonapi (request counters: no counts asserted) ----------

test('GET /api/stats/api returns 200', async ({ api }) => {
  const res = await api.get(`${STATS}/api`);

  await expectStatus(res, 200);
  await expectJsonHas(res);
});

test('GET /api/stats/api/details returns 200', async ({ api }) => {
  const res = await api.get(`${STATS}/api/details`);

  await expectStatus(res, 200);
  await expectJsonHas(res);
});

test('GET /api/stats/nonapi returns 200', async ({ api }) => {
  const res = await api.get(`${STATS}/nonapi`);

  await expectStatus(res, 200);
  await expectJsonHas(res);
});

test('GET /api/stats/nonapi/details returns 200', async ({ api }) => {
  const res = await api.get(`${STATS}/nonapi/details`);

  await expectStatus(res, 200);
  await expectJsonHas(res);
});
