import { test } from '../framework/api';
import { expectJsonHas, expectStatus } from '../framework/assertions';

// The spec documents only a 200 with no response schema ("content": {}) for every healthcheck operation,
// so each test asserts the status and that the body is a JSON object, nothing more.
// All of them are public and read-only.
const HEALTHCHECK_PATHS = [
  '/api/about',
  '/api/ping',
  '/api/health',
  '/api/health/memory',
  '/api/health/uptime',
  '/api/health/configcheck',
  '/api/health/dbcheck',
  '/api/health/db',
];

for (const path of HEALTHCHECK_PATHS) {
  test(`GET ${path} returns 200`, async ({ api }) => {
    const res = await api.get(path);

    await expectStatus(res, 200);
    await expectJsonHas(res);
  });
}
