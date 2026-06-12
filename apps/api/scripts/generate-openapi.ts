/**
 * OpenAPI spec generatsiyasi — `createApp()` route definitsiyalaridan `openapi.json` yozadi.
 * Jonli DB SHART EMAS: `postgres()` pool lazy, spec extraction query qilmaydi. Env kerak.
 * Run: bun --filter @dental/api generate:openapi
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createApp } from '../src/app.ts';

const app = createApp();

const doc = app.getOpenAPIDocument({
  openapi: '3.1.0',
  info: { title: 'Dental Service API', version: '0.1.0' },
});

const outPath = resolve(import.meta.dir, '../../../packages/api-client/openapi.json');
writeFileSync(outPath, `${JSON.stringify(doc, null, 2)}\n`);
console.log(`✅ OpenAPI spec yozildi: ${outPath} (${Object.keys(doc.paths ?? {}).length} path)`);

// `createApp()` `db/client.ts` ni import qiladi → `postgres()` pool ochiq handle qoldiradi
// va event loop yopilmaydi (script osilib qoladi). Spec yozildi — majburan toza chiqamiz.
process.exit(0);
