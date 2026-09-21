import { useCallback, useEffect, useRef, useState } from 'react';
import { CACHE_TTL_MS, cachePeek, cacheSet } from './cache';

export function useCachedData<T>(
  key: string,
  loader: () => Promise<T>,
  opts?: { onError?: (err: unknown) => void },
): { data: T | undefined; refresh: () => Promise<T> } {
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const onErrorRef = useRef(opts?.onError);
  onErrorRef.current = opts?.onError;

  const [data, setData] = useState<T | undefined>(() => cachePeek<T>(key)?.value);

  useEffect(() => {
    const entry = cachePeek<T>(key);
    setData(entry?.value);
    if (entry && Date.now() - entry.at <= CACHE_TTL_MS) return;
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
  }, [key]);

  const refresh = useCallback(async () => {
    const fresh = await loaderRef.current();
    cacheSet(key, fresh);
    setData(fresh);
    return fresh;
  }, [key]);

  return { data, refresh };
}