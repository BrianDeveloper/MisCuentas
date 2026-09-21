export const CACHE_TTL_MS = 20_000;
export const RATE_TTL_MS = 300_000;

const store = new Map<string, { value: unknown; at: number }>();
const listeners = new Map<string, Set<() => void>>();

function emit(key: string): void {
  const set = listeners.get(key);
  if (!set) return;
  for (const fn of set) {
    try {
      fn();
    } catch {
      /* un listener no debe tumbar a los demás */
    }
  }
}

export function subscribeCache(key: string, fn: () => void): () => void {
  let set = listeners.get(key);
  if (!set) {
    set = new Set();
    listeners.set(key, set);
  }
  set.add(fn);
  return () => {
    set.delete(fn);
    if (set.size === 0) listeners.delete(key);
  };
}

export interface CacheEntry<T> {
  value: T;
  at: number;
}

export function cachePeek<T>(key: string): CacheEntry<T> | undefined {
  const e = store.get(key);
  if (!e) return undefined;
  return { value: e.value as T, at: e.at };
}

export function cacheGet<T>(key: string): T | undefined {
  const e = cachePeek<T>(key);
  if (!e) return undefined;
  if (Date.now() - e.at > CACHE_TTL_MS) return undefined;
  return e.value;
}

export function cacheSet(key: string, value: unknown): void {
  store.set(key, { value, at: Date.now() });
  emit(key);
}

export function cacheClear(key: string): void {
  store.delete(key);
  emit(key);
}

export function cacheClearAll(): void {
  store.clear();
  for (const key of listeners.keys()) emit(key);
}

export function invalidateClientData(): void {
  cacheClear('home');
  cacheClear('clients');
  for (const key of store.keys()) {
    if (key.startsWith('client:')) store.delete(key);
  }
}

export function invalidateRate(): void {
  cacheClear('rate');
}