export const CACHE_TTL_MS = 20_000;

const store = new Map<string, { value: unknown; at: number }>();

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
}

export function cacheClear(key: string): void {
  store.delete(key);
}

export function cacheClearAll(): void {
  store.clear();
}

export function invalidateClientData(): void {
  cacheClear('home');
  cacheClear('clients');
  for (const key of store.keys()) {
    if (key.startsWith('client:')) store.delete(key);
  }
}