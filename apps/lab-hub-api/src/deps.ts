import type { Config } from './config';
import type { Database } from './db/client';
import type { Keyring } from './lib/keyring';
import type { Storage } from './lib/storage';
import type { SupervisorClient } from './lib/supervisor-client';

/** Factory DI (CLAUDE.md §3.5) — modul singleton'lari yo'q, testlar o'z deps'ini beradi. */
export type Deps = {
  db: Database;
  config: Config;
  keyring: Keyring;
  storage: Storage;
  supervisor: SupervisorClient;
  now: () => Date;
};
