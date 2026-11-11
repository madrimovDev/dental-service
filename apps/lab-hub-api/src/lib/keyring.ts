import { type Key, unwrapDek } from './crypto';

/** Lab DEK'larini KEK bilan ochadi va xotirada keshlaydi (kalit bazada ochiq yo'q). */
export const createKeyring = (kek: Key) => {
  const cache = new Map<string, Key>();
  return {
    dekFor(lab: { id: string; dekWrapped: string }): Key {
      const hit = cache.get(lab.id);
      if (hit) return hit;
      const dek = unwrapDek(kek, lab.dekWrapped, lab.id);
      cache.set(lab.id, dek);
      return dek;
    },
  };
};
export type Keyring = ReturnType<typeof createKeyring>;
