import { expect, type APIResponse } from '@playwright/test';

/** Asserts the status code. On failure the message shows the URL and response body. */
export async function expectStatus(res: APIResponse, expected: number): Promise<void> {
  const actual = res.status();
  const body = actual === expected ? '' : await res.text();
  expect(actual, `${res.url()}: expected status ${expected}, got ${actual}. Body: ${body}`).toBe(expected);
}

/** Asserts the JSON body is an object with every key. Returns the parsed body. */
export async function expectJsonHas(res: APIResponse, ...keys: string[]): Promise<Record<string, unknown>> {
  const body: unknown = await res.json();
  expect(typeof body === 'object' && body !== null && !Array.isArray(body), `${res.url()}: body is not a JSON object`).toBe(true);
  const json = body as Record<string, unknown>;
  for (const key of keys) {
    expect(json, `${res.url()}: JSON body is missing key "${key}". Body: ${JSON.stringify(json)}`).toHaveProperty(key);
  }
  return json;
}
