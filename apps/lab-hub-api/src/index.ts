import { createApp } from './app';
import { loadConfig } from './config';
import { createDb } from './db/client';
import { createKeyring } from './lib/keyring';
import { createStorage } from './lib/storage';
import { createSupervisorClient } from './lib/supervisor-client';
import { scheduleRetention } from './workers/retention';

// Fail-fast: LAB_HUB_KEK yo'q/noto'g'ri yoki sirlar yo'q bo'lsa — darhol crash
// (shifrlanmagan yoki ochib bo'lmaydigan holatda ishlashdan ko'ra).
let config: ReturnType<typeof loadConfig>;
try {
  config = loadConfig();
} catch (err) {
  console.error(`[lab-hub] config error: ${(err as Error).message}`);
  process.exit(1);
}

const { db } = createDb(config.databaseUrl);
const deps = {
  db,
  config,
  keyring: createKeyring(config.kek),
  storage: createStorage(config.uploadsDir),
  supervisor: createSupervisorClient({
    baseUrl: config.supervisorUrl,
    token: config.supervisorHubToken,
  }),
  now: () => new Date(),
};

const app = createApp(deps);
scheduleRetention(deps);

const server = Bun.serve({
  port: config.port,
  fetch: app.fetch,
  maxRequestBodySize: config.maxUploadBytes + 1024 * 1024,
});
console.log(`lab-hub-api listening on :${server.port}`);
