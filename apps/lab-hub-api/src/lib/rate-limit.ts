/** In-memory fixed-window limiter (bitta jarayon; supervisor-api naqshi). */
type Entry = { count: number; resetAt: number };

export const createRateLimiter = (limit: number, windowMs: number) => {
  const store = new Map<string, Entry>();
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [k, e] of store) if (now >= e.resetAt) store.delete(k);
  }, 60_000);
  timer.unref?.();
  return {
    /** true = ruxsat, false = limit oshdi. */
    hit(key: string): boolean {
      const now = Date.now();
      const e = store.get(key);
      if (!e || now >= e.resetAt) {
        store.set(key, { count: 1, resetAt: now + windowMs });
        return true;
      }
      e.count += 1;
      return e.count <= limit;
    },
  };
};
