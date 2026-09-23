import { useCallback, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryClient } from './client';

export interface UseCachedDataOptions {
  onError?: (err: unknown) => void;
  ttlMs?: number;
}

export const DEFAULT_TTL_MS = 60_000;

/**
 * Lectura cache-first con stale-while-revalidate:
 * - Monta mostrando la data ya cacheada (si existe) vía placeholderData.
 * - Nunca deja la UI en blanco ni dispara spinner si hay caché.
 * - `refresh()` fuerza fetch del servidor (staleTime 0) para refresco manual.
 */
export function useCachedData<T>(
  key: string,
  loader: () => Promise<T>,
  opts: UseCachedDataOptions = {},
): { data: T | undefined; refresh: () => Promise<T> } {
  const ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS;
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const onErrorRef = useRef(opts.onError);
  onErrorRef.current = opts.onError;
  const handledErrorRef = useRef<unknown>(undefined);

  const query = useQuery<T>({
    queryKey: [key],
    queryFn: () => loaderRef.current(),
    staleTime: ttlMs,
    placeholderData: (prev) => prev,
  });

  useEffect(() => {
    if (query.isError && query.data === undefined && handledErrorRef.current !== query.error) {
      handledErrorRef.current = query.error;
      onErrorRef.current?.(query.error);
    }
    if (query.data !== undefined) {
      handledErrorRef.current = undefined;
    }
  }, [query.isError, query.data, query.error]);

  useEffect(() => {
    return () => {
      handledErrorRef.current = undefined;
    };
  }, []);

  const refresh = useCallback(async () => {
    const fresh = await queryClient.fetchQuery({
      queryKey: [key],
      queryFn: () => loaderRef.current(),
      staleTime: 0,
    });
    return fresh;
  }, [key]);

  return { data: query.data, refresh };
}