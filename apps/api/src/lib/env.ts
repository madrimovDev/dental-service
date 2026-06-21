import { z } from 'zod';
import { parseEnv } from './env-schema.ts';

export type { Env } from './env-schema.ts';
// Re-export schema/types so existing `import { Env } from './env.ts'` keeps working.
export { envSchema, isPlaceholderSecret, parseEnv } from './env-schema.ts';

// Boot-time validation (side effect). Importing this module validates Bun.env
// and fails fast on misconfiguration. For pure schema access in tests, import
// from './env-schema.ts' instead (no side effect).
const parsed = parseEnv(Bun.env);

if (!parsed.success) {
  console.error('❌ Environment validation failed:');
  console.error(z.treeifyError(parsed.error));
  process.exit(1);
}

export const env = parsed.data;
