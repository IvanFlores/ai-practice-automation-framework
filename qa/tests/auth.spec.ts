import { test, type Api } from '../framework/api';
import { expectJsonHas, expectStatus } from '../framework/assertions';

/** Registers a fresh user via POST /api/users and returns its credentials. */
async function createUser(api: Api) {
  const stamp = Date.now();
  const user = {
    email: `qa.user.${stamp}@example.test`,
    firstname: 'Qa',
    lastname: `User${stamp}`,
    password: `pw-${stamp}`,
    avatar: '.\\data\\users\\face_1591133479.7144732.jpg',
  };
  const res = await api.post('/api/users', { data: user });
  await expectStatus(res, 201);
  return { email: user.email, password: user.password };
}

test('POST /api/login valid credentials returns 200', async ({ api }) => {
  const { email, password } = await createUser(api);

  const res = await api.post('/api/login', { data: { email, password } });

  await expectStatus(res, 200);
  await expectJsonHas(res, 'access_token');
});

test('POST /api/login wrong password returns 401', async ({ api }) => {
  const { email } = await createUser(api);

  const res = await api.post('/api/login', { data: { email, password: 'definitely-wrong' } });

  await expectStatus(res, 401);
});
