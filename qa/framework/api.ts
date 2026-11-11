import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect as baseExpect, test as base, type APIRequestContext, type APIResponse } from '@playwright/test';

export { expect } from '@playwright/test';

/** Directory with one JSONL file per worker. Read by the Day 2 coverage tool. */
export const LOG_DIR = fileURLToPath(new URL('../coverage-log/', import.meta.url));
export const LOGIN_PATH = '/api/login';

export type Method = 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface CallOptions {
  params?: Record<string, string | number | boolean>;
  data?: unknown;
  headers?: Record<string, string>;
}

/** One line in coverage-log/worker-<n>.jsonl. */
export interface CoverageEntry {
  method: Method;
  path: string;
  status: number;
  query: string[];
  /** Sorted, lower-cased names of headers the test passed via `opts.headers` (not the bearer token). */
  headers: string[];
  hasBody: boolean;
}

/** Thin wrapper over APIRequestContext that records every call it makes. */
export class Api {
  constructor(
    private readonly request: APIRequestContext,
    private readonly logFile: string,
    private readonly headers: Record<string, string> = {},
  ) {}

  /** Same client and log file, plus a bearer token on every call. */
  withToken(token: string): Api {
    return new Api(this.request, this.logFile, { ...this.headers, Authorization: `Bearer ${token}` });
  }

  get(path: string, opts?: CallOptions) {
    return this.call('GET', path, opts);
  }
  head(path: string, opts?: CallOptions) {
    return this.call('HEAD', path, opts);
  }
  post(path: string, opts?: CallOptions) {
    return this.call('POST', path, opts);
  }
  put(path: string, opts?: CallOptions) {
    return this.call('PUT', path, opts);
  }
  patch(path: string, opts?: CallOptions) {
    return this.call('PATCH', path, opts);
  }
  delete(path: string, opts?: CallOptions) {
    return this.call('DELETE', path, opts);
  }

  async call(method: Method, path: string, opts: CallOptions = {}): Promise<APIResponse> {
    const res = await this.request.fetch(path, {
      method,
      params: opts.params,
      data: opts.data,
      headers: { ...this.headers, ...opts.headers },
      failOnStatusCode: false,
    });
    this.record(method, path, res.status(), opts);
    return res;
  }

  /**
   * Waits until a record created through the API has reached GAD's db file.
   * GAD serves plain GETs from memory, but its own handlers (ownership checks, soft delete, PUT-or-create,
   * stats) read the db file, which is written a moment after the create is answered. A call sent in between
   * acts on stale data: a PUT creates instead of updating, a DELETE answers 404.
   * Call it after creating a record the test will change, delete or count: `await api.waitUntilStored('articles', id)`.
   * The probe (`GET /api/db`, the raw file) is test infrastructure, not an operation under test, so it is not recorded.
   */
  async waitUntilStored(collection: string, id: unknown): Promise<void> {
    // Let the write finish before the first probe. GAD (steno) writes a temp file and renames it over the db
    // file; on Windows that rename fails, and the write is lost, if the db file is being read at that moment.
    // Probing immediately would cause exactly that collision.
    await new Promise((resolve) => setTimeout(resolve, 100));
    await baseExpect
      .poll(
        async () => {
          const res = await this.request.get('/api/db');
          const db = (await res.json()) as Record<string, { id?: unknown }[] | undefined>;
          return (db[collection] ?? []).some((row) => String(row.id) === String(id));
        },
        { message: `${collection} ${String(id)} did not reach the db file`, timeout: 5_000, intervals: [100, 200, 400] },
      )
      .toBe(true);
  }

  private record(method: Method, rawPath: string, status: number, opts: CallOptions): void {
    const url = new URL(rawPath, 'http://placeholder');
    const query = new Set([...url.searchParams.keys(), ...Object.keys(opts.params ?? {})]);
    const entry: CoverageEntry = {
      method,
      path: url.pathname,
      status,
      query: [...query].sort(),
      headers: Object.keys(opts.headers ?? {}).map((h) => h.toLowerCase()).sort(),
      hasBody: opts.data !== undefined,
    };
    fs.appendFileSync(this.logFile, JSON.stringify(entry) + '\n');
  }
}

function logFileFor(workerIndex: number): string {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  return path.join(LOG_DIR, `worker-${workerIndex}.jsonl`);
}

export const test = base.extend<{ api: Api; authApi: Api }>({
  /** Anonymous client. */
  api: async ({ request }, use, testInfo) => {
    await use(new Api(request, logFileFor(testInfo.workerIndex)));
  },

  /** Client logged in as GAD_EMAIL / GAD_PASSWORD. The login call is recorded too. */
  authApi: async ({ api }, use) => {
    const email = process.env.GAD_EMAIL;
    const password = process.env.GAD_PASSWORD;
    if (!email || !password) throw new Error('GAD_EMAIL and GAD_PASSWORD must be set (see qa/.env.example)');

    const res = await api.post(LOGIN_PATH, { data: { email, password } });
    if (res.status() !== 200) throw new Error(`Login failed: ${res.status()} ${await res.text()}`);
    const { access_token } = (await res.json()) as { access_token: string };

    await use(api.withToken(access_token));
  },
});
