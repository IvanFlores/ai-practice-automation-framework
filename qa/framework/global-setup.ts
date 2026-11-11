import fs from 'node:fs';
import { request, type FullConfig } from '@playwright/test';
import { LOG_DIR } from './api';

// Runs once per `playwright test`, after the webServer is up.
export default async function globalSetup(config: FullConfig): Promise<void> {
  // Fresh coverage log for every run.
  fs.rmSync(LOG_DIR, { recursive: true, force: true });

  // Restore the seed DB. Uses a plain request context on purpose:
  // this call must NOT appear in the coverage log.
  const baseURL = config.projects[0]?.use.baseURL;
  const restorePath = process.env.RESTORE_PATH ?? '/api/restoreDB';
  const ctx = await request.newContext({ baseURL });
  try {
    const res = await ctx.get(restorePath);
    if (!res.ok()) {
      throw new Error(`DB restore failed: GET ${restorePath} -> ${res.status()} ${await res.text()}`);
    }
  } finally {
    await ctx.dispose();
  }
}
