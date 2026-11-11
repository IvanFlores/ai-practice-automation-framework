import type { APIResponse } from '@playwright/test';
import { test, expect, type Api } from '../framework/api';
import { expectJsonHas, expectStatus } from '../framework/assertions';

const MANAGE = '/api/book-shop-manage';

/**
 * Seed user 11 (db-base.json): the only book-shop account with the role "delivery-coordinator" (role 16),
 * which the seed actions "manage-orders", "manage-items" and "read-users" allow. A book-shop account created
 * through the API always gets the role "reader", so management tests have to log in as a seed staff user.
 * The tests only read with this user or change records they created themselves.
 */
const STAFF = { email: 'Henry.Spencer@test.test', password: '1234' };

/** Required fields of the spec schemas. */
const ITEM_KEYS = ['id', 'book_id', 'price', 'quantity', 'created_at'];
const ORDER_KEYS = ['user_id', 'status_id', 'book_ids', 'books_cost', 'partial_costs', 'total_cost', 'created_at', 'id'];
const BOOK_KEYS = ['id', 'title', 'author_ids', 'published_at', 'genre_ids', 'language', 'pages', 'cover', 'description'];

/** Order statuses (seed "book-shop-order-statuses"). */
const SENT = 5;
const PENDING = 10;
const COMPLETED = 99;

let counter = 0;

async function loginAs(api: Api, credentials: { email: string; password: string }): Promise<Api> {
  const login = await api.post('/api/login', { data: credentials });
  await expectStatus(login, 200);
  const { access_token } = await expectJsonHas(login, 'access_token');
  return api.withToken(String(access_token));
}

/** Asserts the body is a JSON array whose elements all have the given keys. Returns the array. */
async function expectArrayOf(res: APIResponse, ...keys: string[]): Promise<Record<string, unknown>[]> {
  const body: unknown = await res.json();
  expect(Array.isArray(body), `${res.url()}: body is not a JSON array. Body: ${JSON.stringify(body)}`).toBe(true);
  const list = body as Record<string, unknown>[];
  for (const element of list) {
    for (const key of keys) {
      expect(element, `${res.url()}: array element is missing key "${key}": ${JSON.stringify(element)}`).toHaveProperty(key);
    }
  }
  return list;
}

/**
 * GAD answers a write before the record reaches the DB file its book-shop handlers read from (a few ms later),
 * so a request sent right after a create can still see the old state. Setup waits here until the write is visible.
 */
async function eventually(what: string, probe: () => Promise<boolean>): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    if (await probe()) return;
  }
  throw new Error(`${what} did not become visible in time`);
}

async function waitForItem(staff: Api, itemId: unknown): Promise<void> {
  await eventually(`item ${itemId}`, async () => {
    const res = await staff.get(`${MANAGE}/items`);
    await expectStatus(res, 200);
    const items = (await res.json()) as { id: unknown }[];
    return items.some((item) => item.id === itemId);
  });
}

async function waitForOrder(staff: Api, orderId: unknown, statusId: number): Promise<void> {
  await eventually(`order ${orderId} with status ${statusId}`, async () => {
    const res = await staff.get(`${MANAGE}/orders`);
    await expectStatus(res, 200);
    const orders = (await res.json()) as { id: unknown; status_id: unknown }[];
    return orders.some((order) => order.id === orderId && order.status_id === statusId);
  });
}

/** Id of a book that has no shop item yet (read through the API, never hardcoded). */
async function bookWithoutItem(staff: Api): Promise<unknown> {
  const res = await staff.get(`${MANAGE}/books-without-items`);
  await expectStatus(res, 200);
  const books = await expectArrayOf(res, 'id');
  expect(books.length, 'at least one book without a shop item is left').toBeGreaterThan(0);
  return books[0].id;
}

/** Creates a shop item for a book that had none, so tests never change or delete seed items. */
async function createItem(staff: Api, price = 1200): Promise<{ id: unknown; bookId: unknown }> {
  const bookId = await bookWithoutItem(staff);
  const res = await staff.post(`${MANAGE}/items`, { data: { book_id: bookId, price, quantity: 5 } });
  await expectStatus(res, 201);
  const item = await expectJsonHas(res, 'id');
  await waitForItem(staff, item.id);
  return { id: item.id, bookId };
}

/** Registers a fresh user (no book-shop account) and logs in as it. */
async function createUser(api: Api): Promise<Api> {
  const stamp = `${Date.now()}${counter++}`;
  const user = {
    email: `qa.ai.bookshop.${stamp}@example.test`,
    firstname: 'Qa',
    lastname: `AiBookShop${stamp}`,
    password: `pw-${stamp}`,
    avatar: '.\\data\\users\\face_1591133479.7144732.jpg',
  };
  await expectStatus(await api.post('/api/users', { data: user }), 201);
  return loginAs(api, { email: user.email, password: user.password });
}

/**
 * A fresh customer (new user + own book-shop account) with a new order holding one item created by the test.
 * Returns the order id and the customer's client.
 */
async function createOrder(api: Api, staff: Api, itemPrice = 1200): Promise<{ id: unknown; customer: Api }> {
  const { bookId } = await createItem(staff, itemPrice);
  const customer = await createUser(api);
  await expectStatus(await customer.post('/api/book-shop-accounts', { data: {} }), 201);
  await eventually('book-shop account', async () => {
    const res = await customer.post('/api/book-shop-authorize', { data: {} });
    return res.status() === 200;
  });

  const res = await customer.post('/api/book-shop-orders/items', { data: { book_id: bookId } });
  await expectStatus(res, 201);
  const order = await expectJsonHas(res, 'id');
  await waitForOrder(staff, order.id, 1);
  return { id: order.id, customer };
}

// ---------- GET /api/book-shop-manage/orders ----------

test('GET /api/book-shop-manage/orders as delivery coordinator returns 200', async ({ api }) => {
  const staff = await loginAs(api, STAFF);

  const res = await staff.get(`${MANAGE}/orders`);

  await expectStatus(res, 200);
  await expectArrayOf(res, ...ORDER_KEYS);
});

test('GET /api/book-shop-manage/orders without token returns 401', async ({ api }) => {
  const res = await api.get(`${MANAGE}/orders`);

  await expectStatus(res, 401);
});

test('GET /api/book-shop-manage/orders user without book shop account returns 404', async ({ api }) => {
  const user = await createUser(api);

  const res = await user.get(`${MANAGE}/orders`);

  await expectStatus(res, 404);
});

// ---------- PATCH /api/book-shop-manage/orders/{id} ----------

test('PATCH /api/book-shop-manage/orders/{id} sent order to pending returns 200', async ({ api }) => {
  const staff = await loginAs(api, STAFF);
  const { id, customer } = await createOrder(api, staff);
  // The customer pays and sends the order; "sent" -> "pending" is then the coordinator's next step.
  await expectStatus(await customer.patch(`/api/book-shop-orders/${id}`, { data: { status_id: SENT } }), 200);
  await waitForOrder(staff, id, SENT);

  const res = await staff.patch(`${MANAGE}/orders/${id}`, { data: { status_id: PENDING } });

  await expectStatus(res, 200);
  const order = await expectJsonHas(res, ...ORDER_KEYS);
  expect(order.status_id).toBe(PENDING);
});

test('PATCH /api/book-shop-manage/orders/{id} without token returns 401', async ({ api }) => {
  const staff = await loginAs(api, STAFF);
  const { id } = await createOrder(api, staff);

  const res = await api.patch(`${MANAGE}/orders/${id}`, { data: { status_id: PENDING } });

  await expectStatus(res, 401);
});

test('PATCH /api/book-shop-manage/orders/{id} unknown id returns 404', async ({ api }) => {
  const staff = await loginAs(api, STAFF);

  const res = await staff.patch(`${MANAGE}/orders/${Date.now()}`, { data: { status_id: PENDING } });

  await expectStatus(res, 404);
});

test('PATCH /api/book-shop-manage/orders/{id} new order to completed returns 409', async ({ api }) => {
  const staff = await loginAs(api, STAFF);
  const { id } = await createOrder(api, staff);

  const res = await staff.patch(`${MANAGE}/orders/${id}`, { data: { status_id: COMPLETED } });

  await expectStatus(res, 409);
});

test('PATCH /api/book-shop-manage/orders/{id} not enough funds returns 422', async ({ api }) => {
  const staff = await loginAs(api, STAFF);
  // A new book-shop account starts with 10000 funds; this order costs 20000 plus shipping.
  const { id } = await createOrder(api, staff, 20000);

  const res = await staff.patch(`${MANAGE}/orders/${id}`, { data: { status_id: SENT } });

  await expectStatus(res, 422);
});

// ---------- GET /api/book-shop-manage/items ----------

test('GET /api/book-shop-manage/items as delivery coordinator returns 200', async ({ api }) => {
  const staff = await loginAs(api, STAFF);

  const res = await staff.get(`${MANAGE}/items`);

  await expectStatus(res, 200);
  await expectArrayOf(res, ...ITEM_KEYS);
});

test('GET /api/book-shop-manage/items without token returns 401', async ({ api }) => {
  const res = await api.get(`${MANAGE}/items`);

  await expectStatus(res, 401);
});

// ---------- POST /api/book-shop-manage/items ----------

test('POST /api/book-shop-manage/items book without item returns 201', async ({ api }) => {
  const staff = await loginAs(api, STAFF);
  const bookId = await bookWithoutItem(staff);

  const res = await staff.post(`${MANAGE}/items`, { data: { book_id: bookId, price: 1500, quantity: 3 } });

  await expectStatus(res, 201);
  const item = await expectJsonHas(res, ...ITEM_KEYS);
  expect(item.book_id).toBe(bookId);
  await waitForItem(staff, item.id);
});

test('POST /api/book-shop-manage/items without token returns 401', async ({ api }) => {
  const staff = await loginAs(api, STAFF);
  const bookId = await bookWithoutItem(staff);

  const res = await api.post(`${MANAGE}/items`, { data: { book_id: bookId, price: 1500, quantity: 3 } });

  await expectStatus(res, 401);
});

test('POST /api/book-shop-manage/items book that already has an item returns 409', async ({ api }) => {
  const staff = await loginAs(api, STAFF);
  const { bookId } = await createItem(staff);

  const res = await staff.post(`${MANAGE}/items`, { data: { book_id: bookId, price: 1500, quantity: 3 } });

  await expectStatus(res, 409);
});

test('POST /api/book-shop-manage/items non-numeric price returns 422', async ({ api }) => {
  const staff = await loginAs(api, STAFF);
  const bookId = await bookWithoutItem(staff);

  const res = await staff.post(`${MANAGE}/items`, { data: { book_id: bookId, price: 'not-a-price', quantity: 3 } });

  await expectStatus(res, 422);
});

// ---------- PATCH /api/book-shop-manage/items/{id} ----------

test('PATCH /api/book-shop-manage/items/{id} new price and quantity returns 200', async ({ api }) => {
  const staff = await loginAs(api, STAFF);
  const { id } = await createItem(staff);

  const res = await staff.patch(`${MANAGE}/items/${id}`, { data: { price: 1750, quantity: 8 } });

  await expectStatus(res, 200);
  const item = await expectJsonHas(res, ...ITEM_KEYS);
  expect(item.price).toBe(1750);
  expect(item.quantity).toBe(8);
});

test('PATCH /api/book-shop-manage/items/{id} without token returns 401', async ({ api }) => {
  const staff = await loginAs(api, STAFF);
  const { id } = await createItem(staff);

  const res = await api.patch(`${MANAGE}/items/${id}`, { data: { price: 1750, quantity: 8 } });

  await expectStatus(res, 401);
});

test('PATCH /api/book-shop-manage/items/{id} unknown id returns 404', async ({ api }) => {
  const staff = await loginAs(api, STAFF);

  const res = await staff.patch(`${MANAGE}/items/${Date.now()}`, { data: { price: 1750, quantity: 8 } });

  await expectStatus(res, 404);
});

test('PATCH /api/book-shop-manage/items/{id} non-numeric price returns 422', async ({ api }) => {
  const staff = await loginAs(api, STAFF);
  const { id } = await createItem(staff);

  const res = await staff.patch(`${MANAGE}/items/${id}`, { data: { price: 'not-a-price', quantity: 8 } });

  await expectStatus(res, 422);
});

// ---------- DELETE /api/book-shop-manage/items/{id} ----------

test('DELETE /api/book-shop-manage/items/{id} existing item returns 200', async ({ api }) => {
  const staff = await loginAs(api, STAFF);
  const { id } = await createItem(staff);

  const res = await staff.delete(`${MANAGE}/items/${id}`);

  await expectStatus(res, 200);
});

test('DELETE /api/book-shop-manage/items/{id} without token returns 401', async ({ api }) => {
  const staff = await loginAs(api, STAFF);
  const { id } = await createItem(staff);

  const res = await api.delete(`${MANAGE}/items/${id}`);

  await expectStatus(res, 401);
});

test('DELETE /api/book-shop-manage/items/{id} unknown id returns 404', async ({ api }) => {
  const staff = await loginAs(api, STAFF);

  const res = await staff.delete(`${MANAGE}/items/${Date.now()}`);

  await expectStatus(res, 404);
});

// ---------- GET /api/book-shop-manage/items/by-book/{bookId} ----------

test('GET /api/book-shop-manage/items/by-book/{bookId} book with item returns 200', async ({ api }) => {
  test.fail(true, 'spec mismatch: app returns 200 with the list of all items instead of the one BookShopItem');
  const staff = await loginAs(api, STAFF);

  const res = await staff.get(`${MANAGE}/items/by-book/1`);

  await expectStatus(res, 200);
  const item = await expectJsonHas(res, ...ITEM_KEYS);
  expect(item.book_id).toBe(1);
});

test('GET /api/book-shop-manage/items/by-book/{bookId} without token returns 401', async ({ api }) => {
  const res = await api.get(`${MANAGE}/items/by-book/1`);

  await expectStatus(res, 401);
});

test('GET /api/book-shop-manage/items/by-book/{bookId} unknown book id returns 404', async ({ api }) => {
  test.fail(true, 'spec mismatch: app returns 200');
  const staff = await loginAs(api, STAFF);

  const res = await staff.get(`${MANAGE}/items/by-book/${Date.now()}`);

  await expectStatus(res, 404);
});

// ---------- GET /api/book-shop-manage/books-without-items ----------

test('GET /api/book-shop-manage/books-without-items as delivery coordinator returns 200', async ({ api }) => {
  const staff = await loginAs(api, STAFF);

  const res = await staff.get(`${MANAGE}/books-without-items`);

  await expectStatus(res, 200);
  await expectArrayOf(res, ...BOOK_KEYS);
});

test('GET /api/book-shop-manage/books-without-items without token returns 401', async ({ api }) => {
  const res = await api.get(`${MANAGE}/books-without-items`);

  await expectStatus(res, 401);
});

// ---------- GET /api/book-shop-manage/users ----------

test('GET /api/book-shop-manage/users existing user id returns 200', async ({ api }) => {
  test.fail(true, 'spec mismatch: app returns 200 with an object keyed by user id instead of the Users array');
  const staff = await loginAs(api, STAFF);

  const res = await staff.get(`${MANAGE}/users`, { params: { id: 2 } });

  await expectStatus(res, 200);
  const users = await expectArrayOf(res, 'email', 'firstname', 'lastname', 'avatar');
  expect(users.length).toBeGreaterThan(0);
});

test('GET /api/book-shop-manage/users without token returns 401', async ({ api }) => {
  const res = await api.get(`${MANAGE}/users`, { params: { id: 2 } });

  await expectStatus(res, 401);
});

test('GET /api/book-shop-manage/users unknown user id returns 404', async ({ api }) => {
  test.fail(true, 'spec mismatch: app returns 200');
  const staff = await loginAs(api, STAFF);

  const res = await staff.get(`${MANAGE}/users`, { params: { id: Date.now() } });

  await expectStatus(res, 404);
});

// ---------- GET /api/book-shop-manage/team ----------

test('GET /api/book-shop-manage/team as delivery coordinator returns 200', async ({ api }) => {
  test.fail(true, 'spec mismatch: app returns 200 but members lack the required user_id, role_id and joined_at');
  const staff = await loginAs(api, STAFF);

  const res = await staff.get(`${MANAGE}/team`);

  await expectStatus(res, 200);
  const team = await expectArrayOf(res, 'id', 'user_id', 'role_id', 'joined_at');
  expect(team.length).toBeGreaterThan(0);
});

test('GET /api/book-shop-manage/team without token returns 401', async ({ api }) => {
  test.fail(true, 'spec mismatch: app returns 200');
  const res = await api.get(`${MANAGE}/team`);

  await expectStatus(res, 401);
});
