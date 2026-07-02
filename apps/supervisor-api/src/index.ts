import { createApp } from './app';

const app = createApp();
const port = Number(process.env.API_PORT ?? 3101);

Bun.serve({
  port,
  fetch: app.fetch,
});

console.log(`supervisor-api listening on :${port}`);
