#!/usr/bin/env bun
/**
 * RLS coverage check — CI lint.
 *
 * Tekshiradi:
 *  1. Har Drizzle schema fayldagi jadval `tenant_id` ustuni borligini topadi
 *  2. Excluded list ga tushmasa, `apps/api/migrations/rls/*.sql` da
 *     `ALTER TABLE <table> ENABLE ROW LEVEL SECURITY` borligini tasdiqlaydi
 *  3. Topilmagan jadval uchun error bilan exit 1
 *
 * Ishga tushirish: `bun run scripts/check-rls-coverage.ts`
 * CI'da: oxirgi step (typecheck + lint dan keyin)
 */

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const SCHEMA_DIR = join(import.meta.dir, '..', 'packages', 'db-schema', 'src', 'tables');
const RLS_DIR = join(import.meta.dir, '..', 'apps', 'api', 'migrations', 'rls');

/**
 * Platform-level jadvallar — RLS SHART EMAS.
 * Bu list'ga yangi jadval qo'shilsa, ehtiyot bo'ling: tenant izolyatsiyasi
 * shu jadval orqali sizib chiqishi mumkin.
 */
const PLATFORM_TABLES = new Set(['users', 'tenants', 'permissions', 'refresh_tokens']);

async function findTablesWithTenantId(): Promise<{ name: string; file: string }[]> {
  const files = (await readdir(SCHEMA_DIR)).filter((f) => f.endsWith('.ts'));
  const tables: { name: string; file: string }[] = [];

  for (const file of files) {
    const content = await readFile(join(SCHEMA_DIR, file), 'utf8');

    // pgTable('<name>', ...) extraktsiyasi
    const tableMatch = content.match(/pgTable\(\s*['"`]([a-z_]+)['"`]/);
    if (!tableMatch?.[1]) continue;
    const tableName = tableMatch[1];

    // `tenant_id` ustuni borligini tekshirish
    const hasTenantId = /tenantId:\s*uuid\(['"`]tenant_id['"`]\)/.test(content);
    if (hasTenantId) {
      tables.push({ name: tableName, file });
    }
  }
  return tables;
}

async function readAllRlsDdl(): Promise<string> {
  let sqlFiles: string[];
  try {
    sqlFiles = (await readdir(RLS_DIR)).filter((f) => f.endsWith('.sql'));
  } catch {
    return '';
  }

  const contents = await Promise.all(sqlFiles.map((f) => readFile(join(RLS_DIR, f), 'utf8')));
  return contents.join('\n');
}

async function main() {
  const tables = await findTablesWithTenantId();
  const rlsDdl = await readAllRlsDdl();

  const missing: string[] = [];
  // CLI-442 #4: ENABLE bilan bir qatorda FORCE ROW LEVEL SECURITY ham majburlanadi
  // (CLAUDE.md §3.4 — jadval egasi ham RLS'ga bo'ysunsin). FORCE'siz (faqat ENABLE)
  // tenant-scoped jadval CI'da FAIL beradi.
  const missingForce: string[] = [];

  for (const { name, file } of tables) {
    if (PLATFORM_TABLES.has(name)) continue;

    // RLS DDL'da ALTER TABLE <name> ENABLE ROW LEVEL SECURITY borligini tekshirish
    const enableRegex = new RegExp(
      `ALTER\\s+TABLE\\s+${name}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`,
      'i',
    );
    if (!enableRegex.test(rlsDdl)) {
      missing.push(`${name} (${file})`);
      continue;
    }

    const forceRegex = new RegExp(
      `ALTER\\s+TABLE\\s+${name}\\s+FORCE\\s+ROW\\s+LEVEL\\s+SECURITY`,
      'i',
    );
    if (!forceRegex.test(rlsDdl)) {
      missingForce.push(`${name} (${file})`);
    }
  }

  if (missing.length > 0 || missingForce.length > 0) {
    console.error('❌ RLS coverage check FAILED');
    if (missing.length > 0) {
      console.error("Quyidagi tenant-scoped jadvallar uchun RLS policy YO'Q (ENABLE):");
      for (const m of missing) {
        console.error(`  - ${m}`);
      }
    }
    if (missingForce.length > 0) {
      console.error(
        "Quyidagi tenant-scoped jadvallar ENABLE bor, lekin FORCE ROW LEVEL SECURITY YO'Q " +
          "(jadval egasi RLS'ni aylanib o'tishi mumkin, CLAUDE.md §3.4):",
      );
      for (const m of missingForce) {
        console.error(`  - ${m}`);
      }
    }
    console.error('');
    console.error('Yechim: apps/api/migrations/rls/ ichida yangi .sql fayl yarating');
    console.error(
      "va `ALTER TABLE <name> ENABLE ROW LEVEL SECURITY` + `ALTER TABLE <name> FORCE ROW LEVEL SECURITY` + policy qo'shing.",
    );
    process.exit(1);
  }

  console.log(`✅ RLS coverage OK — ${tables.length} ta tenant-scoped jadval policy bilan`);
  console.log(`   Platform jadvallari (RLS yo'q): ${[...PLATFORM_TABLES].join(', ')}`);
}

await main();
