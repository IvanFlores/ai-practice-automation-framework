import { test, expect, type Api } from '../framework/api';
import { expectJsonHas, expectStatus } from '../framework/assertions';

const SHOP_STATS = '/api/book-shop-stats';

/**
 * Seed user 14 (db-base.json): the only book-shop account with the role "admin" (role 1), the one role the seed
 * action "view-stats" allows. A book-shop account created through the API always gets the role "reader", so the
 * 200 tests have to log in as this seed user. The tests only read with it.
 */
const ADMIN = { email: 'v.cortez@test.test', password: '1234' };

/** Properties of the spec schemas (none of them lists `required`; all documented properties are asserted). */
const TOTALS = ['totalOrders', 'totalBooks', 'totalCost'];
const ORDER_MAPS = ['totalPartialCosts', 'totalBooksPerType', 'totalStatusesPerType'];
const USER_MAPS = ['costsPerUser', 'booksPerUser', 'booksPerUserPerOrderStatus'];

let counter = 0;

async function loginAs(api: Api, credentials: { email: string; password: string }): Promise<Api> {
  const login = await api.post('/api/login', { data: credentials });
  await expectStatus(login, 200);
  const { access_token } = await expectJsonHas(login, 'access_token');
  return api.withToken(String(access_token));
}

/** Registers a fresh user (no book-shop account) and logs in as it. */
async function createUser(api: Api): Promise<Api> {
  const stamp = `${Date.now()}${counter++}`;
  const user = {
    email: `qa.ai.shopstats.${stamp}@example.test`,
    firstname: 'Qa',
    lastname: `AiShopStats${stamp}`,
    password: `pw-${stamp}`,
    avatar: '.\\data\\users\\face_1591133479.7144732.jpg',
  };
  await expectStatus(await api.post('/api/users', { data: user }), 201);
  return loginAs(api, { email: user.email, password: user.password });
}

/** Asserts the documented types: integer / number totals and objects for the per-key maps. */
function expectStatsTypes(stats: Record<string, unknown>, maps: string[]): void {
  expect(Number.isInteger(stats.totalOrders), `totalOrders is an integer: ${stats.totalOrders}`).toBe(true);
  expect(Number.isInteger(stats.totalBooks), `totalBooks is an integer: ${stats.totalBooks}`).toBe(true);
  expect(typeof stats.totalCost).toBe('number');
  for (const key of maps) {
    const value = stats[key];
    expect(typeof value === 'object' && value !== null && !Array.isArray(value), `${key} is an object`).toBe(true);
  }
}

// ---------- GET /api/book-shop-stats/orders ----------

test('GET /api/book-shop-stats/orders as book shop admin returns 200', async ({ api }) => {
  const admin = await loginAs(api, ADMIN);

  const res = await admin.get(`${SHOP_STATS}/orders`);

  await expectStatus(res, 200);
  const stats = await expectJsonHas(res, ...TOTALS, ...ORDER_MAPS);
  expectStatsTypes(stats, ORDER_MAPS);
});

test('GET /api/book-shop-stats/orders without token returns 401', async ({ api }) => {
  const res = await api.get(`${SHOP_STATS}/orders`);

  await expectStatus(res, 401);
});

test('GET /api/book-shop-stats/orders user without book shop account returns 404', async ({ api }) => {
  const user = await createUser(api);

  const res = await user.get(`${SHOP_STATS}/orders`);

  await expectStatus(res, 404);
});

// ---------- GET /api/book-shop-stats/users ----------

test('GET /api/book-shop-stats/users as book shop admin returns 200', async ({ api }) => {
  const admin = await loginAs(api, ADMIN);

  const res = await admin.get(`${SHOP_STATS}/users`);

  await expectStatus(res, 200);
  const stats = await expectJsonHas(res, ...TOTALS, ...USER_MAPS);
  expectStatsTypes(stats, USER_MAPS);
});

test('GET /api/book-shop-stats/users without token returns 401', async ({ api }) => {
  const res = await api.get(`${SHOP_STATS}/users`);

  await expectStatus(res, 401);
});

test('GET /api/book-shop-stats/users user without book shop account returns 404', async ({ api }) => {
  const user = await createUser(api);

  const res = await user.get(`${SHOP_STATS}/users`);

  await expectStatus(res, 404);
});

// ---------- GET /api/book-shop-stats/all ----------

test('GET /api/book-shop-stats/all as book shop admin returns 200', async ({ api }) => {
  const admin = await loginAs(api, ADMIN);

  const res = await admin.get(`${SHOP_STATS}/all`);

  await expectStatus(res, 200);
  const stats = await expectJsonHas(res, ...TOTALS, ...ORDER_MAPS, ...USER_MAPS);
  expectStatsTypes(stats, [...ORDER_MAPS, ...USER_MAPS]);
});

test('GET /api/book-shop-stats/all without token returns 401', async ({ api }) => {
  const res = await api.get(`${SHOP_STATS}/all`);

  await expectStatus(res, 401);
});

test('GET /api/book-shop-stats/all user without book shop account returns 404', async ({ api }) => {
  const user = await createUser(api);

  const res = await user.get(`${SHOP_STATS}/all`);

  await expectStatus(res, 404);
});
