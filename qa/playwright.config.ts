import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

// Load qa/.env if present (no dotenv dependency). Real env vars win over the file.
const envFile = fileURLToPath(new URL('./.env', import.meta.url));
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

const PORT = process.env.PORT ?? '3001';

export default defineConfig({
  testDir: './tests',
  // GAD's DB is one shared, mutable JSON file: run serially.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  reporter: 'list',
  globalSetup: './framework/global-setup.ts',
  use: {
    baseURL: `http://localhost:${PORT}`,
  },
  webServer: {
    command: 'npm start',
    cwd: '..',
    env: { PORT },
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
