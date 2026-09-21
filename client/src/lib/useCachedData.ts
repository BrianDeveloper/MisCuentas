import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CACHE_TTL_MS,
  cachePeek,
  cacheSet,
  subscribeCache,
} from './cache';

export interface UseCachedDataOptions {
  onError?: (err: unknown) => void;
  ttlMs?: number;
}

export function useCachedData<T>(
  key: string,
  loader: () => Promise<T>,
  opts: UseCachedDataOptions = {},
): { data: T | undefined; refresh: () => Promise<T> } {
  const ttlMs = opts.ttlMs ?? CACHE_TTL_MS;
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const onErrorRef = useRef(opts.onError);
  onErrorRef.current = opts.onError;

  const [data, setData] = useState<T | undefined>(() => cachePeek<T>(key)?.value);

  useEffect(() => {
    const entry = cachePeek<T>(key);
    setData(entry?.value);
    if (entry && Date.now() - entry.at <= ttlMs) return;
    let alive = true;
    loaderRef
      .current()
      .then((fresh) => {
        if (!alive) return;
        cacheSet(key, fresh);
        setData(fresh);
      })
      .catch((err) => {
        if (alive && !entry) onErrorRef.current?.(err);
      });
    return () => {
      alive = false;
    };
  }, [key, ttlMs]);

  useEffect(() => {
    return subscribeCache(key, () => {
      const entry = cachePeek<T>(key);
      if (!entry) return;
      if (Date.now() - entry.at <= ttlMs) {
        setData(entry.value);
      } else {
        loaderRef
          .current()
          .then((fresh) => {
            cacheSet(key, fresh);
            setData(fresh);
          })
          .catch(() => {});
      }
    });
  }, [key, ttlMs]);

  const refresh = useCallback(async () => {
    const fresh = await loaderRef.current();
    cacheSet(key, fresh);
    setData(fresh);
    return fresh;
  }, [key]);

  return { data, refresh };
}