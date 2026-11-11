import { test, expect, type Api } from '../framework/api';
import { expectJsonHas, expectStatus } from '../framework/assertions';

let counter = 0;

/** A valid UserUpdate body with a unique email. */
function newUser() {
  const stamp = `${Date.now()}${counter++}`;
  return {
    email: `qa.ai.user.${stamp}@example.test`,
    firstname: 'Qa',
    lastname: `AiUser${stamp}`,
    password: `pw-${stamp}`,
    avatar: '.\\data\\users\\face_1591133479.7144732.jpg',
  };
}

/**
 * Registers a fresh user and logs in as it. Seed users are never modified (CONVENTIONS.md section 5),
 * so every PUT/PATCH/DELETE test works on a user created here, through `own` (a client with that user's token).
 */
async function createUser(api: Api) {
  const user = newUser();
  const created = await api.post('/api/users', { data: user });
  await expectStatus(created, 201);
  const { id } = await expectJsonHas(created, 'id');
  await api.waitUntilStored('users', id);

  const login = await api.post('/api/login', { data: { email: user.email, password: user.password } });
  await expectStatus(login, 200);
  const { access_token } = await expectJsonHas(login, 'access_token');

  return { id, user, own: api.withToken(String(access_token)) };
}

/**
 * Malformed JSON for the documented "400 Bad request - malformed JSON" cases.
 * Sent as a Buffer so Playwright does not re-serialize it into valid JSON.
 */
const MALFORMED_JSON = { data: Buffer.from('{"email": '), headers: { 'Content-Type': 'application/json' } };

// ---------- GET /api/users ----------

test('GET /api/users list returns 200', async ({ api }) => {
  const res = await api.get('/api/users');

  await expectStatus(res, 200);
  const users: unknown = await res.json();
  expect(Array.isArray(users), 'body is a JSON array of users').toBe(true);
});

// ---------- POST /api/users ----------

test('POST /api/users valid user returns 201', async ({ api }) => {
  const data = newUser();

  const res = await api.post('/api/users', { data });

  await expectStatus(res, 201);
  const user = await expectJsonHas(res, 'id', 'email', 'firstname', 'lastname', 'avatar');
  expect(user.email).toBe(data.email);
});

test('POST /api/users malformed JSON returns 400', async ({ api }) => {
  const res = await api.post('/api/users', MALFORMED_JSON);

  await expectStatus(res, 400);
});

test('POST /api/users existing email returns 409', async ({ api }) => {
  const { user } = await createUser(api);

  const res = await api.post('/api/users', { data: { ...newUser(), email: user.email } });

  await expectStatus(res, 409);
});

test('POST /api/users missing firstname returns 422', async ({ api }) => {
  const { email, lastname, password, avatar } = newUser();

  const res = await api.post('/api/users', { data: { email, lastname, password, avatar } });

  await expectStatus(res, 422);
});

// ---------- GET /api/users/{id} ----------

test('GET /api/users/{id} existing user returns 200', async ({ api }) => {
  const { id } = await createUser(api);

  const res = await api.get(`/api/users/${id}`);

  await expectStatus(res, 200);
  await expectJsonHas(res, 'id', 'email', 'firstname', 'lastname', 'avatar');
});

test('GET /api/users/{id} non-numeric id returns 400', async ({ api }) => {
  test.fail(true, 'spec mismatch: app returns 404');
  const res = await api.get('/api/users/not-an-id');

  await expectStatus(res, 400);
});

test('GET /api/users/{id} unknown id returns 404', async ({ api }) => {
  const res = await api.get(`/api/users/${Date.now()}`);

  await expectStatus(res, 404);
});

// ---------- PUT /api/users/{id} ----------

test('PUT /api/users/{id} own user returns 200', async ({ api }) => {
  const { id, user, own } = await createUser(api);
  // The email is kept: the token is bound to it.
  const update = { ...user, firstname: 'QaPut', lastname: `Put${Date.now()}` };

  const res = await own.put(`/api/users/${id}`, { data: update });

  await expectStatus(res, 200);
  const updated = await expectJsonHas(res, 'id', 'email', 'firstname', 'lastname', 'avatar');
  expect(updated.firstname).toBe(update.firstname);
  expect(updated.lastname).toBe(update.lastname);
});

test('PUT /api/users/{id} unknown id returns 201', async ({ api }) => {
  test.fail(true, 'spec mismatch: app returns 401');
  const { own } = await createUser(api);

  const res = await own.put(`/api/users/${Date.now()}`, { data: newUser() });

  await expectStatus(res, 201);
  await expectJsonHas(res, 'id', 'email', 'firstname', 'lastname', 'avatar');
});

test('PUT /api/users/{id} malformed JSON returns 400', async ({ api }) => {
  const { id, own } = await createUser(api);

  const res = await own.put(`/api/users/${id}`, MALFORMED_JSON);

  await expectStatus(res, 400);
});

test('PUT /api/users/{id} without token returns 401', async ({ api }) => {
  const { id, user } = await createUser(api);

  const res = await api.put(`/api/users/${id}`, { data: { ...user, firstname: 'QaPutNoToken' } });

  await expectStatus(res, 401);
});

test('PUT /api/users/{id} missing firstname returns 422', async ({ api }) => {
  const { id, user, own } = await createUser(api);
  const { email, lastname, password, avatar } = user;

  const res = await own.put(`/api/users/${id}`, { data: { email, lastname, password, avatar } });

  await expectStatus(res, 422);
});

// ---------- PATCH /api/users/{id} ----------

test('PATCH /api/users/{id} new firstname returns 200', async ({ api }) => {
  const { id, own } = await createUser(api);
  const firstname = `QaPatch${Date.now()}`;

  const res = await own.patch(`/api/users/${id}`, { data: { firstname } });

  await expectStatus(res, 200);
  const updated = await expectJsonHas(res, 'id', 'email', 'firstname', 'lastname', 'avatar');
  expect(updated.firstname).toBe(firstname);
});

test('PATCH /api/users/{id} malformed JSON returns 400', async ({ api }) => {
  const { id, own } = await createUser(api);

  const res = await own.patch(`/api/users/${id}`, MALFORMED_JSON);

  await expectStatus(res, 400);
});

test('PATCH /api/users/{id} without token returns 401', async ({ api }) => {
  const { id } = await createUser(api);

  const res = await api.patch(`/api/users/${id}`, { data: { firstname: 'QaPatchNoToken' } });

  await expectStatus(res, 401);
});

test('PATCH /api/users/{id} unknown id returns 404', async ({ api }) => {
  test.fail(true, 'spec mismatch: app returns 401');
  const { own } = await createUser(api);

  const res = await own.patch(`/api/users/${Date.now()}`, { data: { firstname: 'QaPatchUnknown' } });

  await expectStatus(res, 404);
});

test('PATCH /api/users/{id} empty firstname returns 422', async ({ api }) => {
  const { id, own } = await createUser(api);

  const res = await own.patch(`/api/users/${id}`, { data: { firstname: '' } });

  await expectStatus(res, 422);
});

// ---------- DELETE /api/users/{id} ----------

test('DELETE /api/users/{id} own user returns 200', async ({ api }) => {
  const { id, own } = await createUser(api);

  const res = await own.delete(`/api/users/${id}`);

  await expectStatus(res, 200);
  await expectStatus(await api.get(`/api/users/${id}`), 404);
});

test('DELETE /api/users/{id} without token returns 401', async ({ api }) => {
  const { id } = await createUser(api);

  const res = await api.delete(`/api/users/${id}`);

  await expectStatus(res, 401);
});

test('DELETE /api/users/{id} unknown id returns 404', async ({ api }) => {
  const { own } = await createUser(api);

  const res = await own.delete(`/api/users/${Date.now()}`);

  await expectStatus(res, 404);
});

// ---------- HEAD /api/users/{id} ----------

test('HEAD /api/users/{id} existing user returns 200', async ({ api }) => {
  const { id } = await createUser(api);

  const res = await api.head(`/api/users/${id}`);

  await expectStatus(res, 200);
});

test('HEAD /api/users/{id} non-numeric id returns 400', async ({ api }) => {
  test.fail(true, 'spec mismatch: app returns 404');
  const res = await api.head('/api/users/not-an-id');

  await expectStatus(res, 400);
});

test('HEAD /api/users/{id} unknown id returns 404', async ({ api }) => {
  const res = await api.head(`/api/users/${Date.now()}`);

  await expectStatus(res, 404);
});
